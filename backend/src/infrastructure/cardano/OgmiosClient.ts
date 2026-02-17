/**
 * Ogmios WebSocket Client
 * Interacts with Ogmios for TX submission and chain queries.
 */
import WebSocket from 'ws';
import { getLogger } from '../../config/logger.js';
import type { ChainTip, SubmitResult } from '../../domain/ports/IChainProvider.js';

interface OgmiosResponse {
  jsonrpc: string;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id?: unknown;
}

export class OgmiosClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly logger;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (val: unknown) => void; reject: (err: Error) => void }
  >();
  private connected = false;

  constructor(ogmiosUrl: string) {
    this.url = ogmiosUrl;
    this.logger = getLogger().child({ service: 'ogmios' });
  }

  /** Connect to Ogmios WebSocket */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.connected = true;
        this.logger.info('Connected to Ogmios');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as OgmiosResponse;
          const id = typeof msg.id === 'number' ? msg.id : -1;
          const pending = this.pendingRequests.get(id);
          if (pending) {
            this.pendingRequests.delete(id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        } catch (err) {
          this.logger.error({ err }, 'Failed to parse Ogmios message');
        }
      });

      this.ws.on('error', (err) => {
        this.logger.error({ err }, 'Ogmios WebSocket error');
        if (!this.connected) reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.logger.warn('Ogmios connection closed');
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'));
          this.pendingRequests.delete(id);
        }
      });
    });
  }

  /** Disconnect from Ogmios */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /** Submit a signed transaction */
  async submitTx(signedTxCbor: string): Promise<SubmitResult> {
    try {
      const result = (await this.request('submitTransaction', {
        transaction: { cbor: signedTxCbor },
      })) as { transaction: { id: string } };

      return {
        txHash: result.transaction.id,
        accepted: true,
      };
    } catch (err) {
      return {
        txHash: '',
        accepted: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /** Query current chain tip */
  async queryNetworkTip(): Promise<ChainTip> {
    const result = (await this.request('queryNetwork/tip', {})) as {
      slot: number;
      id: string;
      height: number;
      epoch: number;
    };

    return {
      slot: result.slot,
      hash: result.id,
      block: result.height,
      epoch: result.epoch,
    };
  }

  /** Query protocol parameters */
  async queryProtocolParameters(): Promise<unknown> {
    return this.request('queryLedgerState/protocolParameters', {});
  }

  /** Check Ogmios health */
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.connected) return false;
      await this.queryNetworkTip();
      return true;
    } catch {
      return false;
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        return reject(new Error('Not connected to Ogmios'));
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id,
      });

      this.ws.send(message, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Ogmios request timeout: ${method}`));
        }
      }, 30_000);
    });
  }
}
