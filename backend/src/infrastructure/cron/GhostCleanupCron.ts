/**
 * Ghost Cleanup Cron
 * Periodically removes "ghost" records from the database — intents, orders, and pools
 * that were saved with status CREATED but whose transactions were never signed or submitted
 * on-chain by the user.
 *
 * Problem:
 *   CreateIntent / CreateOrder / CreatePool use-cases save to DB BEFORE the user signs
 *   the transaction in their CIP-30 wallet. If the user cancels/closes the wallet popup
 *   or the browser crashes, ghost records persist in the DB indefinitely.
 *
 * Solution:
 *   Every INTERVAL_MS (default 120s), find CREATED records older than MAX_AGE_MS (default 5 min).
 *   For each, check if escrowTxHash is confirmed on-chain via Blockfrost.
 *     - If confirmed → promote to ACTIVE (safety net, redundant with ChainSync)
 *     - If NOT confirmed → DELETE from database
 *
 * This ensures:
 *   - Legitimately submitted intents are never deleted (promoted to ACTIVE within ~2 min)
 *   - Ghost intents from unsigned TXs are cleaned up within 5 minutes
 *   - ReclaimKeeperCron never wastes Blockfrost calls trying to reclaim non-existent UTxOs
 */
import { getLogger } from '../../config/logger.js';
import type { PrismaClient } from '@prisma/client';
import type { BlockfrostClient } from '../cardano/BlockfrostClient.js';

export class GhostCleanupCron {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /**
   * @param prisma          Prisma client for direct DB access (delete operations)
   * @param blockfrost      Blockfrost client for on-chain TX confirmation checks
   * @param intervalMs      How often to run (default: 120s)
   * @param maxAgeMs        Max age for CREATED records before cleanup (default: 5 min)
   * @param ordersEnabled   Whether to process orders (saves Blockfrost calls when disabled)
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly blockfrost: BlockfrostClient,
    private readonly intervalMs: number = 120_000,
    private readonly maxAgeMs: number = 5 * 60 * 1000,
    private readonly ordersEnabled: boolean = false,
  ) {
    this.logger = getLogger().child({ service: 'ghost-cleanup' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info(
      { intervalMs: this.intervalMs, maxAgeMs: this.maxAgeMs },
      'Ghost cleanup cron started',
    );

    // Run immediately, then on interval
    this.tick().catch((err) =>
      this.logger.error({ err }, 'Ghost cleanup tick failed'),
    );

    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error({ err }, 'Ghost cleanup tick failed'),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.info('Ghost cleanup cron stopped');
  }

  private async tick(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.maxAgeMs);

    await Promise.all([
      this.cleanupGhostIntents(cutoffDate),
      this.ordersEnabled
        ? this.cleanupGhostOrders(cutoffDate)
        : Promise.resolve(),
      this.cleanupGhostPools(cutoffDate),
    ]);
  }

  /**
   * Clean up ghost CREATED intents older than maxAgeMs.
   * For each: check on-chain → promote or delete.
   */
  private async cleanupGhostIntents(cutoffDate: Date): Promise<void> {
    try {
      const ghostIntents = await this.prisma.intent.findMany({
        where: {
          status: 'CREATED',
          createdAt: { lt: cutoffDate },
        },
        select: {
          id: true,
          escrowTxHash: true,
        },
        take: 50,
      });

      if (ghostIntents.length === 0) return;

      this.logger.info(
        { count: ghostIntents.length },
        'Found ghost CREATED intents — checking on-chain status',
      );

      let promoted = 0;
      let deleted = 0;

      for (const intent of ghostIntents) {
        try {
          if (intent.escrowTxHash) {
            const confirmed = await this.blockfrost.awaitTx(intent.escrowTxHash, 5_000);
            if (confirmed) {
              // TX is confirmed on-chain — promote to ACTIVE (safety net)
              await this.prisma.intent.update({
                where: { id: intent.id },
                data: { status: 'ACTIVE' },
              });
              promoted++;
              this.logger.info(
                { intentId: intent.id, txHash: intent.escrowTxHash },
                'Ghost cleanup: promoted confirmed intent → ACTIVE',
              );
              continue;
            }
          }

          // TX not confirmed (or no txHash) — delete ghost record
          await this.prisma.intent.delete({
            where: { id: intent.id },
          });
          deleted++;
          this.logger.info(
            { intentId: intent.id, txHash: intent.escrowTxHash },
            'Ghost cleanup: deleted unconfirmed CREATED intent',
          );
        } catch (err) {
          this.logger.warn(
            { intentId: intent.id, err },
            'Ghost cleanup: failed to process intent',
          );
        }
      }

      if (promoted > 0 || deleted > 0) {
        this.logger.info(
          { promoted, deleted },
          'Ghost intent cleanup completed',
        );
      }
    } catch (err) {
      this.logger.error({ err }, 'Ghost intent cleanup failed');
    }
  }

  /**
   * Clean up ghost CREATED orders older than maxAgeMs.
   */
  private async cleanupGhostOrders(cutoffDate: Date): Promise<void> {
    try {
      const ghostOrders = await this.prisma.order.findMany({
        where: {
          status: 'CREATED',
          createdAt: { lt: cutoffDate },
        },
        select: {
          id: true,
          escrowTxHash: true,
        },
        take: 50,
      });

      if (ghostOrders.length === 0) return;

      this.logger.info(
        { count: ghostOrders.length },
        'Found ghost CREATED orders — checking on-chain status',
      );

      let promoted = 0;
      let deleted = 0;

      for (const order of ghostOrders) {
        try {
          if (order.escrowTxHash) {
            const confirmed = await this.blockfrost.awaitTx(order.escrowTxHash, 5_000);
            if (confirmed) {
              await this.prisma.order.update({
                where: { id: order.id },
                data: { status: 'ACTIVE' },
              });
              promoted++;
              this.logger.info(
                { orderId: order.id, txHash: order.escrowTxHash },
                'Ghost cleanup: promoted confirmed order → ACTIVE',
              );
              continue;
            }
          }

          await this.prisma.order.delete({
            where: { id: order.id },
          });
          deleted++;
          this.logger.info(
            { orderId: order.id, txHash: order.escrowTxHash },
            'Ghost cleanup: deleted unconfirmed CREATED order',
          );
        } catch (err) {
          this.logger.warn(
            { orderId: order.id, err },
            'Ghost cleanup: failed to process order',
          );
        }
      }

      if (promoted > 0 || deleted > 0) {
        this.logger.info(
          { promoted, deleted },
          'Ghost order cleanup completed',
        );
      }
    } catch (err) {
      this.logger.error({ err }, 'Ghost order cleanup failed');
    }
  }

  /**
   * Clean up ghost pools saved as ACTIVE before TX confirmation.
   * CreatePool saves pools as state: 'ACTIVE' immediately — wrong for unsigned TXs.
   * Check if pool txHash is confirmed; if not, delete.
   */
  private async cleanupGhostPools(cutoffDate: Date): Promise<void> {
    try {
      // Find recently created pools that might be ghosts.
      // We check pools created within a recent window whose TX is not confirmed.
      // Since pools are set to ACTIVE immediately, we look for pools without
      // a confirmed TX that were created recently.
      const recentPools = await this.prisma.pool.findMany({
        where: {
          state: 'ACTIVE',
          createdAt: {
            lt: cutoffDate,
            // Only check pools created within the last hour to avoid
            // re-checking legitimately old pools every tick
            gt: new Date(Date.now() - 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          txHash: true,
        },
        take: 20,
      });

      if (recentPools.length === 0) return;

      let deleted = 0;

      for (const pool of recentPools) {
        try {
          if (pool.txHash) {
            const confirmed = await this.blockfrost.awaitTx(pool.txHash, 5_000);
            if (confirmed) {
              // Pool TX is confirmed — this is a legitimate pool, skip
              continue;
            }
          }

          // TX not confirmed — delete ghost pool
          await this.prisma.pool.delete({
            where: { id: pool.id },
          });
          deleted++;
          this.logger.info(
            { poolId: pool.id, txHash: pool.txHash },
            'Ghost cleanup: deleted unconfirmed pool',
          );
        } catch (err) {
          this.logger.warn(
            { poolId: pool.id, err },
            'Ghost cleanup: failed to process pool',
          );
        }
      }

      if (deleted > 0) {
        this.logger.info({ deleted }, 'Ghost pool cleanup completed');
      }
    } catch (err) {
      this.logger.error({ err }, 'Ghost pool cleanup failed');
    }
  }
}
