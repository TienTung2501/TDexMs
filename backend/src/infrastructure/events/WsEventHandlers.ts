/**
 * WebSocket Event Handlers
 *
 * Bridges the Domain Event Bus to the WebSocket transport layer.
 * Each domain event is translated into the appropriate WS broadcast.
 *
 * This is the ONLY place where WsServer.broadcastXxx methods are called
 * (besides the legacy SolverEngine calls which will be migrated later).
 *
 * Registered once during app boot in index.ts.
 */
import type { DomainEventBus } from '../../domain/events/DomainEventBus.js';
import type { WsServer } from '../../interface/ws/WsServer.js';
import { getLogger } from '../../config/logger.js';

const logger = getLogger().child({ service: 'ws-event-handler' });

export function registerWsEventHandlers(eventBus: DomainEventBus, wsServer: WsServer): void {
  // ── Intent status changes → broadcast to all subscribers ──
  eventBus.on('intent.statusChanged', (payload) => {
    logger.debug(
      { intentId: payload.intentId, status: payload.newStatus },
      'Broadcasting intent status change via WS',
    );
    wsServer.broadcastIntent({
      intentId: payload.intentId,
      status: payload.newStatus,
      settlementTxHash: payload.settlementTxHash,
      actualOutput: payload.actualOutput,
      timestamp: payload.timestamp,
    });
  });

  // ── Pool updates → broadcast pool data ──
  eventBus.on('pool.updated', (payload) => {
    logger.debug(
      { poolId: payload.poolId, action: payload.action },
      'Broadcasting pool update via WS',
    );
    wsServer.broadcastPool({
      poolId: payload.poolId,
      reserveA: payload.reserveA ?? '0',
      reserveB: payload.reserveB ?? '0',
      price: payload.price ?? '0',
      tvlAda: payload.tvlAda ?? '0',
      lastTxHash: payload.lastTxHash,
      timestamp: payload.timestamp,
    });
  });

  // ── Price ticks → broadcast price updates ──
  eventBus.on('price.tick', (payload) => {
    wsServer.broadcastPrice({
      pair: payload.pair,
      price: payload.price,
      change24h: payload.change24h,
      volume24h: payload.volume24h,
      timestamp: payload.timestamp,
    });
  });

  // ── Order status changes → broadcast to subscribers ──
  eventBus.on('order.statusChanged', (payload) => {
    logger.debug(
      { orderId: payload.orderId, status: payload.newStatus },
      'Broadcasting order status change via WS',
    );
    wsServer.broadcastOrder({
      orderId: payload.orderId,
      status: payload.newStatus,
      timestamp: payload.timestamp,
    });
  });

  logger.info(
    {
      intentHandlers: eventBus.listenerCount('intent.statusChanged'),
      poolHandlers: eventBus.listenerCount('pool.updated'),
      priceHandlers: eventBus.listenerCount('price.tick'),
      orderHandlers: eventBus.listenerCount('order.statusChanged'),
    },
    'WebSocket event handlers registered',
  );
}
