/**
 * WebSocket Server
 * Real-time price, intent, and pool update streams.
 */
import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getLogger } from '../../config/logger.js';
import { v4 as uuid } from 'uuid';

const logger = getLogger().child({ service: 'websocket' });

// ── Message Types ──

interface SubscribeMsg {
  type: 'subscribe';
  channel: 'prices' | 'intent' | 'pool';
  params: Record<string, unknown>;
}

interface UnsubscribeMsg {
  type: 'unsubscribe';
  channel: string;
}

type ClientMessage = SubscribeMsg | UnsubscribeMsg;

export interface PriceUpdate {
  pair: string;
  price: string;
  change24h: number;
  volume24h: string;
  timestamp: number;
}

export interface IntentUpdate {
  intentId: string;
  status: string;
  settlementTxHash?: string;
  actualOutput?: string;
  timestamp: number;
}

export interface PoolUpdate {
  poolId: string;
  reserveA: string;
  reserveB: string;
  price: string;
  tvlAda: string;
  lastTxHash?: string;
  timestamp: number;
}

// ── Client tracking ──

interface WsClient {
  id: string;
  ws: WebSocket;
  subscriptions: Map<string, Set<string>>; // channel → set of keys
  alive: boolean;
}

export class WsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WsClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /** Attach WebSocket server to an HTTP server */
  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/v1/ws' });

    this.wss.on('connection', (ws) => {
      const clientId = uuid();
      const client: WsClient = {
        id: clientId,
        ws,
        subscriptions: new Map(),
        alive: true,
      };
      this.clients.set(clientId, client);
      logger.info({ clientId, total: this.clients.size }, 'WS client connected');

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as ClientMessage;
          this.handleMessage(client, msg);
        } catch {
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('pong', () => {
        client.alive = true;
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info({ clientId, total: this.clients.size }, 'WS client disconnected');
      });

      ws.on('error', (err) => {
        logger.error({ err, clientId }, 'WS client error');
      });

      // Send welcome
      this.send(ws, {
        type: 'connected',
        data: { clientId, timestamp: Date.now() },
      });
    });

    // Heartbeat — ping every 30s, terminate dead connections
    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (!client.alive) {
          client.ws.terminate();
          this.clients.delete(id);
          continue;
        }
        client.alive = false;
        client.ws.ping();
      }
    }, 30_000);

    logger.info('WebSocket server attached at /v1/ws');
  }

  /** Broadcast a price update to all subscribers */
  broadcastPrice(update: PriceUpdate): void {
    for (const client of this.clients.values()) {
      const pairs = client.subscriptions.get('prices');
      if (pairs?.has(update.pair) || pairs?.has('*')) {
        this.send(client.ws, { type: 'price', data: update });
      }
    }
  }

  /** Send intent update to subscribers */
  broadcastIntent(update: IntentUpdate): void {
    for (const client of this.clients.values()) {
      const intents = client.subscriptions.get('intent');
      if (intents?.has(update.intentId) || intents?.has('*')) {
        this.send(client.ws, { type: 'intentUpdate', data: update });
      }
    }
  }

  /** Send pool update to subscribers */
  broadcastPool(update: PoolUpdate): void {
    for (const client of this.clients.values()) {
      const pools = client.subscriptions.get('pool');
      if (pools?.has(update.poolId) || pools?.has('*')) {
        this.send(client.ws, { type: 'poolUpdate', data: update });
      }
    }
  }

  /** Graceful shutdown */
  close(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.wss?.close();
    logger.info('WebSocket server closed');
  }

  /** Active client count */
  get clientCount(): number {
    return this.clients.size;
  }

  // ── Private ──

  private handleMessage(client: WsClient, msg: ClientMessage): void {
    switch (msg.type) {
      case 'subscribe':
        this.handleSubscribe(client, msg);
        break;
      case 'unsubscribe':
        client.subscriptions.delete(msg.channel);
        this.send(client.ws, {
          type: 'unsubscribed',
          data: { channel: msg.channel },
        });
        break;
      default:
        this.sendError(client.ws, `Unknown message type`);
    }
  }

  private handleSubscribe(client: WsClient, msg: SubscribeMsg): void {
    const { channel, params } = msg;

    if (!['prices', 'intent', 'pool'].includes(channel)) {
      this.sendError(client.ws, `Unknown channel: ${channel}`);
      return;
    }

    let keys: Set<string>;
    if (!client.subscriptions.has(channel)) {
      keys = new Set();
      client.subscriptions.set(channel, keys);
    } else {
      keys = client.subscriptions.get(channel)!;
    }

    // Extract subscription keys
    if (channel === 'prices') {
      const pairs = (params.pairs as string[]) ?? ['*'];
      pairs.forEach((p) => keys.add(p));
    } else if (channel === 'intent') {
      const intentId = (params.intentId as string) ?? '*';
      keys.add(intentId);
    } else if (channel === 'pool') {
      const poolId = (params.poolId as string) ?? '*';
      keys.add(poolId);
    }

    this.send(client.ws, {
      type: 'subscribed',
      data: { channel, keys: Array.from(keys) },
    });

    logger.debug(
      { clientId: client.id, channel, keys: keys.size },
      'Client subscribed',
    );
  }

  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: 'error', data: { message } });
  }
}
