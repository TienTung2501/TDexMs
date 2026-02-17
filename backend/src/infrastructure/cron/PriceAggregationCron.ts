/**
 * Price Aggregation Cron
 * Periodically aggregates PriceTick rows into OHLCV Candle rows
 * and cleans up stale data. Memory-efficient for Render 512MB.
 *
 * Usage:
 *   const cron = new PriceAggregationCron(candlestickService, intervalMs);
 *   cron.start();   // non-blocking
 *   cron.stop();    // graceful stop
 */
import { getLogger } from '../../config/logger.js';
import type { CandlestickService } from '../../application/services/CandlestickService.js';

export class PriceAggregationCron {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private cleanupCounter = 0;

  /**
   * @param service  CandlestickService instance
   * @param intervalMs  How often to run aggregation (default: 60s)
   * @param cleanupEvery  Run cleanup every N aggregation cycles (default: 60 → ~1h at 60s)
   */
  constructor(
    private readonly service: CandlestickService,
    private readonly intervalMs: number = 60_000,
    private readonly cleanupEvery: number = 60,
  ) {
    this.logger = getLogger().child({ service: 'price-cron' });
  }

  /** Start the periodic aggregation */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info(
      { intervalMs: this.intervalMs, cleanupEvery: this.cleanupEvery },
      'Price aggregation cron started',
    );

    // Run once immediately, then on interval
    this.tick().catch((err) => this.logger.error({ err }, 'Initial tick failed'));

    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error({ err }, 'Cron tick failed'));
    }, this.intervalMs);

    // Prevent timer from keeping Node alive if it's the only thing running
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /** Stop the cron */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.logger.info('Price aggregation cron stopped');
  }

  /** Single tick: aggregate + optional cleanup */
  private async tick(): Promise<void> {
    try {
      const count = await this.service.aggregateCandles();

      if (count > 0) {
        this.logger.debug({ candlesUpdated: count }, 'Aggregation tick complete');
      }

      // Periodic cleanup of old data
      this.cleanupCounter++;
      if (this.cleanupCounter >= this.cleanupEvery) {
        this.cleanupCounter = 0;
        await this.service.cleanupOldData();
      }
    } catch (err) {
      this.logger.error({ err }, 'Aggregation tick error');
    }
  }
}
