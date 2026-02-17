/**
 * Blockfrost Client — replaces self-hosted Ogmios + Kupo
 *
 * Uses Blockfrost HTTP API as the sole chain data provider.
 * Compatible with Blockfrost Free Tier (50k requests/day).
 *
 * Memory-optimized: no WebSocket connections, no persistent state.
 */
import { getLogger } from '../../config/logger.js';
import type {
  IChainProvider,
  UTxO,
  ChainTip,
  SubmitResult,
} from '../../domain/ports/IChainProvider.js';
import type { CacheService } from '../cache/CacheService.js';
import { CacheKeys, CacheTTL } from '../cache/CacheService.js';

/** Blockfrost UTxO response shape */
interface BfUtxo {
  tx_hash: string;
  tx_index: number;
  output_index: number;
  amount: Array<{ unit: string; quantity: string }>;
  block: string;
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}

/** Blockfrost tip response */
interface BfBlock {
  hash: string;
  epoch: number;
  slot: number;
  height: number;
  time: number;
}

export class BlockfrostClient implements IChainProvider {
  private readonly baseUrl: string;
  private readonly projectId: string;
  private readonly logger;
  private cache: CacheService | null = null;

  constructor(baseUrl: string, projectId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.projectId = projectId;
    this.logger = getLogger().child({ service: 'blockfrost' });
  }

  /** Attach a cache service (optional — graceful degradation) */
  setCache(cache: CacheService): void {
    this.cache = cache;
  }

  // ── IChainProvider implementation ──────────────

  async getUtxos(address: string): Promise<UTxO[]> {
    // Cache UTxOs for 30s to reduce Blockfrost API calls
    if (this.cache) {
      const cached = await this.cache.get<UTxO[]>(CacheKeys.UTXOS(address));
      if (cached) return cached;
    }

    const data = await this.get<BfUtxo[]>(`/addresses/${address}/utxos`);
    if (!data) return [];
    const utxos = data.map((u) => this.toUtxo(u));

    if (this.cache && utxos.length > 0) {
      await this.cache.set(CacheKeys.UTXOS(address), utxos, CacheTTL.BLOCKFROST);
    }

    return utxos;
  }

  async getUtxosByAsset(
    address: string,
    policyId: string,
    assetName: string,
  ): Promise<UTxO[]> {
    const unit = assetName ? `${policyId}${assetName}` : policyId;
    const data = await this.get<BfUtxo[]>(`/addresses/${address}/utxos/${unit}`);
    if (!data) return [];
    return data.map((u) => this.toUtxo(u));
  }

  async getChainTip(): Promise<ChainTip> {
    // Cache chain tip for 15s
    if (this.cache) {
      const cached = await this.cache.get<ChainTip>(CacheKeys.CHAIN_TIP);
      if (cached) return cached;
    }

    const block = await this.get<BfBlock>('/blocks/latest');
    if (!block) {
      return { slot: 0, hash: '', block: 0, epoch: 0 };
    }
    const tip: ChainTip = {
      slot: block.slot,
      hash: block.hash,
      block: block.height,
      epoch: block.epoch ?? 0,
    };

    if (this.cache) {
      await this.cache.set(CacheKeys.CHAIN_TIP, tip, CacheTTL.CHAIN_TIP);
    }

    return tip;
  }

  async submitTx(signedTxCbor: string): Promise<SubmitResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/tx/submit`, {
        method: 'POST',
        headers: {
          'project_id': this.projectId,
          'Content-Type': 'application/cbor',
        },
        body: Buffer.from(signedTxCbor, 'hex'),
      });

      if (resp.ok) {
        const txHash = (await resp.text()).replace(/"/g, '');
        this.logger.info({ txHash }, 'Transaction submitted via Blockfrost');
        return { txHash, accepted: true };
      }

      const errBody = await resp.text();
      this.logger.warn({ status: resp.status, body: errBody }, 'TX rejected');
      return { txHash: '', accepted: false, error: errBody };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { txHash: '', accepted: false, error: msg };
    }
  }

  async awaitTx(txHash: string, maxWaitMs = 120_000): Promise<boolean> {
    const start = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - start < maxWaitMs) {
      const tx = await this.get<{ hash: string }>(`/txs/${txHash}`);
      if (tx) return true;
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    this.logger.warn({ txHash, maxWaitMs }, 'TX confirmation timeout');
    return false;
  }

  async getProtocolParameters(): Promise<unknown> {
    // Cache protocol params for 5 min (rarely change)
    if (this.cache) {
      const cached = await this.cache.get(CacheKeys.PROTOCOL_PARAMS);
      if (cached) return cached;
    }

    const params = await this.get('/epochs/latest/parameters');

    if (this.cache && params) {
      await this.cache.set(CacheKeys.PROTOCOL_PARAMS, params, CacheTTL.PROTOCOL_PARAMS);
    }

    return params;
  }

  async isUtxoSpent(txHash: string, outputIndex: number): Promise<boolean> {
    const utxos = await this.get<{ outputs: BfUtxo[] }>(`/txs/${txHash}/utxos`);
    if (!utxos?.outputs) return false;
    const output = utxos.outputs.find((o) => o.output_index === outputIndex);
    // If the output doesn't exist in the response, consider it spent
    return !output;
  }

  // ── Blockfrost-specific public methods ─────────

  /** Get UTxOs at a script address (for escrow/pool queries) */
  async getScriptUtxos(scriptAddress: string): Promise<UTxO[]> {
    return this.getUtxos(scriptAddress);
  }

  /** Get UTxOs containing a specific asset (policy ID + hex asset name) */
  async getAssetUtxos(policyId: string, assetName: string): Promise<UTxO[]> {
    const unit = assetName ? `${policyId}${assetName}` : policyId;
    const data = await this.get<Array<{ tx_hash: string; tx_index: number; output_index: number; amount: Array<{ unit: string; quantity: string }> }>>(`/assets/${unit}/addresses`);
    if (!data || data.length === 0) return [];

    // Blockfrost /assets/.../addresses returns addresses, not UTxOs
    // We need to query each relevant address
    const allUtxos: UTxO[] = [];
    for (const entry of data.slice(0, 5)) { // Limit to 5 addresses to save API calls
      const addr = (entry as unknown as { address: string }).address;
      if (addr) {
        const utxos = await this.getUtxosByAsset(addr, policyId, assetName);
        allUtxos.push(...utxos);
      }
    }
    return allUtxos;
  }

  /** Get datum from a datum hash */
  async getDatum(datumHash: string): Promise<string | null> {
    const data = await this.get<{ cbor_value: string }>(`/scripts/datum/${datumHash}/cbor`);
    return data?.cbor_value ?? null;
  }

  /** Health check — verify Blockfrost connectivity */
  async isHealthy(): Promise<boolean> {
    try {
      const data = await this.get<{ is_healthy: boolean }>('/health');
      return data?.is_healthy === true;
    } catch {
      return false;
    }
  }

  /** Get Blockfrost usage metrics (to monitor free tier limits) */
  async getUsageMetrics(): Promise<{ calls_remaining: number; calls_made: number } | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/`, {
        headers: { project_id: this.projectId },
      });
      const remaining = resp.headers.get('x-ratelimit-remaining');
      const limit = resp.headers.get('x-ratelimit-limit');
      return {
        calls_remaining: remaining ? parseInt(remaining, 10) : 0,
        calls_made: limit ? parseInt(limit, 10) - (remaining ? parseInt(remaining, 10) : 0) : 0,
      };
    } catch {
      return null;
    }
  }

  // ── Private helpers ────────────────────────────

  private async get<T>(path: string): Promise<T | null> {
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        headers: { project_id: this.projectId },
      });

      if (resp.status === 404) return null;

      if (!resp.ok) {
        this.logger.warn(
          { status: resp.status, path },
          'Blockfrost request failed',
        );
        return null;
      }

      return (await resp.json()) as T;
    } catch (err) {
      this.logger.error({ err, path }, 'Blockfrost request error');
      return null;
    }
  }

  private toUtxo(bf: BfUtxo): UTxO {
    const value: Record<string, bigint> = {};

    for (const amt of bf.amount) {
      if (amt.unit === 'lovelace') {
        value['lovelace'] = BigInt(amt.quantity);
      } else {
        // unit = policyId + assetNameHex
        value[amt.unit] = BigInt(amt.quantity);
      }
    }

    return {
      txHash: bf.tx_hash,
      outputIndex: bf.output_index,
      address: '', // not available from /utxos directly
      value,
      datumHash: bf.data_hash ?? undefined,
      datum: bf.inline_datum ?? undefined,
    };
  }
}
