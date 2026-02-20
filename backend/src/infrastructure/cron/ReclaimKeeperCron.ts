/**
 * Reclaim Keeper Cron
 * Periodically checks for expired intents and orders,
 * marks them as expired in the database, and optionally
 * builds reclaim transactions to return funds to owners.
 *
 * This acts as the "Keeper Bot" described in the documentation.
 */
import { getLogger } from '../../config/logger.js';
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';

export class ReclaimKeeperCron {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /**
   * @param intentRepo  Intent repository
   * @param orderRepo   Order repository
   * @param intervalMs  How often to check for expired items (default: 60s)
   */
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly intervalMs: number = 60_000,
  ) {
    this.logger = getLogger().child({ service: 'reclaim-keeper' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info({ intervalMs: this.intervalMs }, 'Reclaim keeper cron started');

    // Run immediately, then on interval
    this.tick().catch((err) =>
      this.logger.error({ err }, 'Reclaim keeper tick failed'),
    );

    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error({ err }, 'Reclaim keeper tick failed'),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.info('Reclaim keeper cron stopped');
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    // Mark expired intents
    const expiredIntents = await this.intentRepo.markExpired(now);
    if (expiredIntents > 0) {
      this.logger.info({ count: expiredIntents }, 'Marked intents as expired');
    }

    // Mark expired orders
    const expiredOrders = await this.orderRepo.markExpired(now);
    if (expiredOrders > 0) {
      this.logger.info({ count: expiredOrders }, 'Marked orders as expired');
    }

    // NOTE: Actual on-chain reclaim (building Reclaim TX) would require:
    // 1. Querying escrow/order UTxOs for expired intents
    // 2. Building a Reclaim redeemer TX
    // 3. Submitting with solver wallet
    // This is a future enhancement — for now we just update DB status.
  }
}
