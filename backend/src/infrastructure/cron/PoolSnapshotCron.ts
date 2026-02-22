/**
 * Pool Snapshot Cron
 * Periodically snapshots pool state (reserves, TVL, volume, fees, price)
 * into the PoolHistory table and computes protocol-wide stats for ProtocolStats.
 *
 * Runs every hour by default.
 *
 * B4/B6 fix: These tables previously existed in schema but were never populated.
 */
import { getLogger } from '../../config/logger.js';
import type { PrismaClient } from '@prisma/client';

export class PoolSnapshotCron {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /**
   * @param prisma  Prisma client instance
   * @param intervalMs  Snapshot interval (default: 1 hour)
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly intervalMs: number = 3_600_000,
  ) {
    this.logger = getLogger().child({ service: 'pool-snapshot-cron' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info(
      { intervalMs: this.intervalMs },
      'Pool snapshot cron started',
    );

    // Run once immediately, then on interval
    this.tick().catch((err) => this.logger.error({ err }, 'Initial snapshot tick failed'));

    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error({ err }, 'Snapshot tick failed'));
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.logger.info('Pool snapshot cron stopped');
  }

  /** Single tick: snapshot all active pools + update protocol stats */
  private async tick(): Promise<void> {
    try {
      await this.snapshotPools();
      await this.updateProtocolStats();
    } catch (err) {
      this.logger.error({ err }, 'Snapshot tick error');
    }
  }

  /**
   * Snapshot every active pool's current state into PoolHistory.
   * B4 fix: PoolHistory table was never written to.
   */
  private async snapshotPools(): Promise<void> {
    const pools = await this.prisma.pool.findMany({
      where: { state: 'ACTIVE' },
      select: {
        id: true,
        reserveA: true,
        reserveB: true,
        tvlAda: true,
        volume24h: true,
        fees24h: true,
      },
    });

    if (pools.length === 0) return;

    const now = new Date();
    const snapshots = pools.map((pool) => {
      // price = reserveB / reserveA (avoid division by zero)
      const rA = Number(pool.reserveA);
      const rB = Number(pool.reserveB);
      const price = rA > 0 ? rB / rA : 0;

      return {
        poolId: pool.id,
        reserveA: pool.reserveA,
        reserveB: pool.reserveB,
        tvlAda: pool.tvlAda,
        volume: pool.volume24h,
        fees: pool.fees24h,
        price,
        timestamp: now,
      };
    });

    const result = await this.prisma.poolHistory.createMany({
      data: snapshots,
    });

    this.logger.debug(
      { snapshotCount: result.count },
      'Pool history snapshots created',
    );
  }

  /**
   * Compute aggregate protocol stats and upsert into ProtocolStats.
   * B6 fix: ProtocolStats table was never written to.
   */
  private async updateProtocolStats(): Promise<void> {
    // Aggregate stats across all active pools
    const aggregates = await this.prisma.pool.aggregate({
      where: { state: 'ACTIVE' },
      _sum: {
        tvlAda: true,
        volume24h: true,
        fees24h: true,
      },
      _count: true,
    });

    // Count distinct traders from swaps in last 24h
    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const recentSwaps = await this.prisma.swap.findMany({
      where: { timestamp: { gte: oneDayAgo } },
      select: { senderAddress: true },
      distinct: ['senderAddress'],
    });

    // 7-day volume
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const volume7dResult = await this.prisma.swap.aggregate({
      where: { timestamp: { gte: sevenDaysAgo } },
      _sum: { inputAmount: true },
    });

    const totalIntents = await this.prisma.intent.count();
    const intentsFilled = await this.prisma.intent.count({
      where: { status: 'FILLED' },
    });

    // Create a new stats snapshot (ProtocolStats tracks historical snapshots)
    await this.prisma.protocolStats.create({
      data: {
        tvl: aggregates._sum.tvlAda ?? 0,
        volume24h: aggregates._sum.volume24h ?? 0,
        volume7d: volume7dResult._sum.inputAmount ?? 0,
        fees24h: aggregates._sum.fees24h ?? 0,
        totalPools: aggregates._count,
        totalIntents,
        intentsFilled,
        uniqueTraders: recentSwaps.length,
      },
    });

    this.logger.debug(
      {
        pools: aggregates._count,
        uniqueTraders: recentSwaps.length,
        intentsFilled,
      },
      'Protocol stats snapshot created',
    );
  }
}
