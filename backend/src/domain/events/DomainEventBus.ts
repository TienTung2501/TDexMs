/**
 * Domain Event Bus — Lightweight in-process event broker.
 *
 * Decouples domain-layer state changes from infrastructure side-effects
 * (WebSocket broadcasts, cache invalidation, logging, etc.).
 *
 * Usage:
 *   // Producer (in use-cases / repositories):
 *   eventBus.emit('intent.statusChanged', { intentId, oldStatus, newStatus, ... });
 *
 *   // Consumer (in index.ts wiring):
 *   eventBus.on('intent.statusChanged', async (payload) => {
 *     wsServer.broadcastIntent({ ... });
 *   });
 *
 * Design decisions:
 * - In-process only (no Redis Pub/Sub yet — add when multi-instance needed)
 * - Async handlers — fire-and-forget; errors are logged but never block callers
 * - Strongly typed via DomainEventMap to prevent typos and ensure payload safety
 */
import { getLogger } from '../../config/logger.js';
import type { IntentStatus, OrderStatus, PoolState } from '../../shared/index.js';

const logger = getLogger().child({ service: 'event-bus' });

// ═══════════════════════════════════════════════════════
// Domain Event Payload Definitions
// ═══════════════════════════════════════════════════════

export interface IntentStatusChangedEvent {
  intentId: string;
  oldStatus: IntentStatus | null; // null = newly created
  newStatus: IntentStatus;
  creator?: string;
  settlementTxHash?: string;
  actualOutput?: string;
  timestamp: number;
}

export interface PoolUpdatedEvent {
  poolId: string;
  action: 'created' | 'deposit' | 'withdraw' | 'reserves_updated' | 'state_changed';
  reserveA?: string;
  reserveB?: string;
  price?: string;
  tvlAda?: string;
  newState?: PoolState;
  lastTxHash?: string;
  timestamp: number;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  oldStatus: OrderStatus | null;
  newStatus: OrderStatus;
  creator?: string;
  timestamp: number;
}

export interface PriceTickEvent {
  poolId: string;
  pair: string;
  price: string;
  change24h: number;
  volume24h: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════
// Event Map — single source of truth for all event types
// ═══════════════════════════════════════════════════════

export interface DomainEventMap {
  'intent.statusChanged': IntentStatusChangedEvent;
  'pool.updated': PoolUpdatedEvent;
  'order.statusChanged': OrderStatusChangedEvent;
  'price.tick': PriceTickEvent;
}

export type DomainEventName = keyof DomainEventMap;

type Handler<T> = (payload: T) => void | Promise<void>;

// ═══════════════════════════════════════════════════════
// Event Bus Implementation
// ═══════════════════════════════════════════════════════

export class DomainEventBus {
  private handlers = new Map<string, Array<Handler<unknown>>>();

  /** Register a handler for an event type */
  on<K extends DomainEventName>(event: K, handler: Handler<DomainEventMap[K]>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler as Handler<unknown>);
    logger.debug({ event, handlerCount: this.handlers.get(event)!.length }, 'Event handler registered');
  }

  /** Remove a specific handler */
  off<K extends DomainEventName>(event: K, handler: Handler<DomainEventMap[K]>): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler as Handler<unknown>);
    if (idx >= 0) list.splice(idx, 1);
  }

  /**
   * Emit an event — all registered handlers execute asynchronously.
   * Handlers NEVER throw into the caller; errors are logged and swallowed.
   */
  emit<K extends DomainEventName>(event: K, payload: DomainEventMap[K]): void {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    for (const handler of list) {
      // Fire-and-forget: catch errors to protect the emitter
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => {
          logger.error({ err, event, payload }, 'Domain event handler error (non-fatal)');
        });
    }
  }

  /** Get handler count for a specific event (useful for debugging) */
  listenerCount(event: DomainEventName): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** Remove all handlers (useful for testing) */
  removeAll(): void {
    this.handlers.clear();
  }
}

// ═══════════════════════════════════════════════════════
// Singleton instance — shared across the entire process
// ═══════════════════════════════════════════════════════

let _instance: DomainEventBus | null = null;

export function getEventBus(): DomainEventBus {
  if (!_instance) {
    _instance = new DomainEventBus();
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetEventBus(): void {
  _instance?.removeAll();
  _instance = null;
}
