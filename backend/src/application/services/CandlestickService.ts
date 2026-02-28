/**
 * CandlestickService — TradingView-compatible OHLCV data provider
 *
 * Responsibilities:
 * 1. Record price ticks from swaps
 * 2. Aggregate ticks into OHLCV candles at 7 intervals: 1m, 5m, 15m, 1h, 4h, 1d, 1w
 * 3. Serve candle data for frontend charts (TradingView Lightweight Charts)
 * 4. Use Upstash Redis cache for read-heavy chart queries
 * 5. Auto-cleanup old candles per retention policy to optimize Supabase Free 500MB
 *
 * Storage optimization (Supabase Free 500MB):
 * Each interval has a retention limit to cap storage growth:
 *   M1  (1 min)  → 2 days    (~2880 candles/pool)
 *   M5  (5 min)  → 7 days    (~2016 candles/pool)
 *   M15 (15 min) → 14 days   (~1344 candles/pool)
 *   H1  (1 hour) → 30 days   (~720 candles/pool)
 *   H4  (4 hours)→ 90 days   (~540 candles/pool)
 *   D1  (1 day)  → 365 days  (~365 candles/pool)
 *   W1  (1 week) → forever   (unlimited)
 *
 * PriceTicks are kept for 2 days then cleaned (sufficient for M1 aggregation).
 */
import type { PrismaClient, CandleInterval } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { getLogger } from '../../config/logger.js';
import type { CacheService } from '../../infrastructure/cache/CacheService.js';
import { CacheKeys, CacheTTL } from '../../infrastructure/cache/CacheService.js';

/** All supported intervals with their config and retention policies */
const STORED_INTERVALS: Record<string, {
  enum: CandleInterval;
  ms: number;
  retentionDays: number | null; // null = keep forever
}> = {
  M1:  { enum: 'M1',  ms: 1 * 60_000,             retentionDays: 2 },
  M5:  { enum: 'M5',  ms: 5 * 60_000,             retentionDays: 7 },
  M15: { enum: 'M15', ms: 15 * 60_000,            retentionDays: 14 },
  H1:  { enum: 'H1',  ms: 60 * 60_000,            retentionDays: 30 },
  H4:  { enum: 'H4',  ms: 4 * 60 * 60_000,        retentionDays: 90 },
  D1:  { enum: 'D1',  ms: 24 * 60 * 60_000,       retentionDays: 365 },
  W1:  { enum: 'W1',  ms: 7 * 24 * 60 * 60_000,   retentionDays: null },
};

/** String → enum mapping for API queries */
const INTERVAL_MAP: Record<string, CandleInterval> = {
  '1m':  'M1',
  '5m':  'M5',
  '15m': 'M15',
  '1h':  'H1',
  '4h':  'H4',
  '1d':  'D1',
  '1w':  'W1',
  M1:  'M1',
  M5:  'M5',
  M15: 'M15',
  H1:  'H1',
  H4:  'H4',
  D1:  'D1',
  W1:  'W1',
};

/** TradingView-compatible candle output */
export interface CandleDTO {
  time: number;       // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string;     // String for large numbers
}

/** Query parameters for chart data */
export interface GetCandlesParams {
  poolId: string;
  interval: string;   // '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w'
  from?: number;       // Unix timestamp (seconds)
  to?: number;         // Unix timestamp (seconds)
  limit?: number;      // Max candles to return
}

/** Pool summary for chart header info */
export interface PoolChartInfo {
  poolId: string;
  assetA: string;
  assetB: string;
  assetATicker: string | null;
  assetBTicker: string | null;
  lastPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: string;
}

export class CandlestickService {
  private readonly logger;
  private readonly maxCandles: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheService | null,
    maxCandles = 500,
  ) {
    this.logger = getLogger().child({ service: 'candlestick' });
    this.maxCandles = maxCandles;
  }

  // ═══════════════════════════════════════════
  // 1. RECORD A PRICE TICK (called after each swap)
  // ═══════════════════════════════════════════

  /**
   * Record a raw price tick from a swap event.
   */
  async recordTick(
    poolId: string,
    price: number,
    volume: bigint,
    timestamp?: Date,
  ): Promise<void> {
    await this.prisma.priceTick.create({
      data: {
        poolId,
        price: new Decimal(price),
        volume: volume.toString(),
        timestamp: timestamp ?? new Date(),
      },
    });

    // Invalidate cached price for this pool
    if (this.cache) {
      await this.cache.del(CacheKeys.LATEST_PRICE(poolId));
      await this.cache.del(CacheKeys.POOL_CHART_INFO(poolId));
    }
  }

  /**
   * Record a tick and immediately update the current candle for stored intervals.
   */
  async recordTickAndUpdateCandles(
    poolId: string,
    price: number,
    volume: bigint,
    timestamp?: Date,
  ): Promise<void> {
    const ts = timestamp ?? new Date();
    await this.recordTick(poolId, price, volume, ts);

    const priceDecimal = new Decimal(price);
    const volumeStr = volume.toString();

    // Only upsert for stored intervals (all 7 intervals)
    for (const [key, config] of Object.entries(STORED_INTERVALS)) {
      const openTime = this.floorToInterval(ts, config.ms);
      const closeTime = new Date(openTime.getTime() + config.ms);

      try {
        await this.prisma.candle.upsert({
          where: {
            poolId_interval_openTime: {
              poolId,
              interval: config.enum,
              openTime,
            },
          },
          create: {
            poolId,
            interval: config.enum,
            openTime,
            closeTime,
            open: priceDecimal,
            high: priceDecimal,
            low: priceDecimal,
            close: priceDecimal,
            volume: volumeStr,
            txCount: 1,
          },
          update: {
            close: priceDecimal,
            txCount: { increment: 1 },
          },
        });

        // Update high/low with SQL (Prisma can't do conditional updates)
        await this.prisma.$executeRawUnsafe(
          `UPDATE candles
           SET high = GREATEST(high, $1::numeric),
               low = LEAST(low, $2::numeric),
               volume = volume + $3::numeric
           WHERE "poolId" = $4
             AND interval = $5::"CandleInterval"
             AND "openTime" = $6`,
          price,
          price,
          volumeStr,
          poolId,
          key,
          openTime,
        );
      } catch (err) {
        this.logger.error({ err, poolId, interval: key }, 'Candle upsert failed');
      }
    }

    // Invalidate candle caches for this pool
    if (this.cache) {
      await this.cache.invalidatePattern(`chart:candles:${poolId}:*`);
    }
  }

  // ═══════════════════════════════════════════
  // 2. QUERY CANDLES (for TradingView frontend) — cached
  // ═══════════════════════════════════════════

  /**
   * Get OHLCV candles for a pool — main chart data endpoint.
   * Results are cached in Upstash Redis for 5 minutes.
   */
  async getCandles(params: GetCandlesParams): Promise<CandleDTO[]> {
    const interval = INTERVAL_MAP[params.interval];
    if (!interval) {
      throw new Error(
        `Invalid interval: ${params.interval}. Available: ${Object.keys(INTERVAL_MAP).join(', ')}. ` +
        `Supported: 1m, 5m, 15m, 1h, 4h, 1d, 1w.`,
      );
    }

    const limit = Math.min(params.limit ?? this.maxCandles, this.maxCandles);
    const cacheKey = CacheKeys.CANDLES(params.poolId, params.interval, params.from, params.to);

    // Try cache first
    if (this.cache) {
      const cached = await this.cache.get<CandleDTO[]>(cacheKey);
      if (cached) return cached;
    }

    const where: Record<string, unknown> = {
      poolId: params.poolId,
      interval,
    };

    if (params.from || params.to) {
      where['openTime'] = {};
      if (params.from) {
        (where['openTime'] as Record<string, Date>)['gte'] = new Date(params.from * 1000);
      }
      if (params.to) {
        (where['openTime'] as Record<string, Date>)['lte'] = new Date(params.to * 1000);
      }
    }

    const candles = await this.prisma.candle.findMany({
      where,
      orderBy: { openTime: 'asc' },
      take: limit,
    });

    const result: CandleDTO[] = candles.map((c) => ({
      time: Math.floor(c.openTime.getTime() / 1000),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: c.volume.toString(),
    }));

    // Cache the result
    if (this.cache && result.length > 0) {
      await this.cache.set(cacheKey, result, CacheTTL.CANDLES);
    }

    return result;
  }

  /**
   * Get the latest price tick for a pool — cached.
   */
  async getLatestPrice(poolId: string): Promise<number | null> {
    if (this.cache) {
      const cached = await this.cache.get<number>(CacheKeys.LATEST_PRICE(poolId));
      if (cached !== null) return cached;
    }

    const tick = await this.prisma.priceTick.findFirst({
      where: { poolId },
      orderBy: { timestamp: 'desc' },
      select: { price: true },
    });

    const price = tick ? Number(tick.price) : null;

    if (this.cache && price !== null) {
      await this.cache.set(CacheKeys.LATEST_PRICE(poolId), price, CacheTTL.LATEST_PRICE);
    }

    return price;
  }

  /**
   * Get pool chart summary info — cached (30s).
   */
  async getPoolChartInfo(poolId: string): Promise<PoolChartInfo | null> {
    if (this.cache) {
      const cached = await this.cache.get<PoolChartInfo>(CacheKeys.POOL_CHART_INFO(poolId));
      if (cached) return cached;
    }

    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      select: {
        id: true,
        assetAPolicyId: true,
        assetAAssetName: true,
        assetATicker: true,
        assetBPolicyId: true,
        assetBAssetName: true,
        assetBTicker: true,
        volume24h: true,
      },
    });

    if (!pool) return null;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Use H4 candles to compute 24h stats (6 candles = 24h)
    const candles24h = await this.prisma.candle.findMany({
      where: {
        poolId,
        interval: 'H4',
        openTime: { gte: oneDayAgo },
      },
      orderBy: { openTime: 'asc' },
    });

    const lastPrice = candles24h.length > 0
      ? Number(candles24h[candles24h.length - 1]!.close)
      : 0;

    const firstPrice = candles24h.length > 0
      ? Number(candles24h[0]!.open)
      : 0;

    const high24h = candles24h.length > 0
      ? Math.max(...candles24h.map((c) => Number(c.high)))
      : 0;

    const low24h = candles24h.length > 0
      ? Math.min(...candles24h.map((c) => Number(c.low)))
      : 0;

    const priceChange24h = lastPrice - firstPrice;
    const priceChangePercent24h = firstPrice > 0
      ? (priceChange24h / firstPrice) * 100
      : 0;

    const info: PoolChartInfo = {
      poolId: pool.id,
      assetA: `${pool.assetAPolicyId}.${pool.assetAAssetName}`,
      assetB: `${pool.assetBPolicyId}.${pool.assetBAssetName}`,
      assetATicker: pool.assetATicker,
      assetBTicker: pool.assetBTicker,
      lastPrice,
      priceChange24h,
      priceChangePercent24h,
      high24h,
      low24h,
      volume24h: pool.volume24h.toString(),
    };

    if (this.cache) {
      await this.cache.set(CacheKeys.POOL_CHART_INFO(poolId), info, CacheTTL.POOL_CHART_INFO);
    }

    return info;
  }

  /**
   * Get available intervals with retention info.
   */
  getAvailableIntervals(): Array<{
    value: string;
    label: string;
    seconds: number;
    retentionDays: number | null;
  }> {
    return [
      { value: '1m',  label: '1M',  seconds: 60,     retentionDays: 2 },
      { value: '5m',  label: '5M',  seconds: 300,    retentionDays: 7 },
      { value: '15m', label: '15M', seconds: 900,    retentionDays: 14 },
      { value: '1h',  label: '1H',  seconds: 3600,   retentionDays: 30 },
      { value: '4h',  label: '4H',  seconds: 14400,  retentionDays: 90 },
      { value: '1d',  label: '1D',  seconds: 86400,  retentionDays: 365 },
      { value: '1w',  label: '1W',  seconds: 604800, retentionDays: null },
    ];
  }

  // ═══════════════════════════════════════════
  // 3. BATCH AGGREGATION (cron job)
  // ═══════════════════════════════════════════

  /**
   * Aggregate recent price ticks into candles.
   * Processes all 7 intervals: M1, M5, M15, H1, H4, D1, W1.
   */
  async aggregateCandles(): Promise<number> {
    const pools = await this.prisma.pool.findMany({
      where: { state: 'ACTIVE' },
      select: { id: true },
    });

    let totalUpdated = 0;

    for (const pool of pools) {
      for (const [key, config] of Object.entries(STORED_INTERVALS)) {
        try {
          const count = await this.aggregatePoolInterval(
            pool.id,
            config.enum,
            config.ms,
          );
          totalUpdated += count;
        } catch (err) {
          this.logger.error(
            { err, poolId: pool.id, interval: key },
            'Candle aggregation failed',
          );
        }
      }
    }

    if (totalUpdated > 0) {
      this.logger.info({ totalUpdated }, 'Candle aggregation complete');
    }

    return totalUpdated;
  }

  /**
   * Cleanup old data to save Supabase storage.
   *
   * 1. PriceTicks: keep 2 days (sufficient for M1 candle aggregation)
   * 2. Candles: cleanup per retention policy:
   *    - M1: 2 days, M5: 7 days, M15: 14 days, H1: 30 days
   *    - H4: 90 days, D1: 365 days, W1: forever
   * 3. PoolHistory: keep 90 days
   * 4. ProtocolStats: keep 90 days
   */
  async cleanupOldData(): Promise<void> {
    // 1. Clean old price ticks (2 days)
    const tickCutoff = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    const tickResult = await this.prisma.priceTick.deleteMany({
      where: { timestamp: { lt: tickCutoff } },
    });
    if (tickResult.count > 0) {
      this.logger.info({ count: tickResult.count }, 'Cleaned old price ticks');
    }

    // 2. Clean candles per retention policy
    let totalCandlesCleaned = 0;
    for (const [key, config] of Object.entries(STORED_INTERVALS)) {
      if (config.retentionDays === null) continue; // W1 = keep forever

      const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60_000);
      try {
        const result = await this.prisma.candle.deleteMany({
          where: {
            interval: config.enum,
            openTime: { lt: cutoff },
          },
        });
        if (result.count > 0) {
          totalCandlesCleaned += result.count;
          this.logger.debug(
            { interval: key, count: result.count, retentionDays: config.retentionDays },
            'Cleaned expired candles',
          );
        }
      } catch (err) {
        this.logger.error({ err, interval: key }, 'Failed to clean candles');
      }
    }
    if (totalCandlesCleaned > 0) {
      this.logger.info({ count: totalCandlesCleaned }, 'Total candles cleaned by retention policy');
    }

    // 3. Clean old pool history (90 days)
    const histCutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);
    try {
      const histResult = await this.prisma.poolHistory.deleteMany({
        where: { timestamp: { lt: histCutoff } },
      });
      if (histResult.count > 0) {
        this.logger.info({ count: histResult.count }, 'Cleaned old pool history (>90 days)');
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to clean pool history');
    }

    // 4. Clean old protocol stats (90 days)
    try {
      const statsResult = await this.prisma.protocolStats.deleteMany({
        where: { timestamp: { lt: histCutoff } },
      });
      if (statsResult.count > 0) {
        this.logger.info({ count: statsResult.count }, 'Cleaned old protocol stats (>90 days)');
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to clean protocol stats');
    }
  }

  // ═══════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════

  private async aggregatePoolInterval(
    poolId: string,
    interval: CandleInterval,
    intervalMs: number,
  ): Promise<number> {
    const lastCandle = await this.prisma.candle.findFirst({
      where: { poolId, interval },
      orderBy: { openTime: 'desc' },
      select: { closeTime: true },
    });

    const startFrom = lastCandle?.closeTime
      ?? new Date(Date.now() - 7 * 24 * 60 * 60_000); // Look back 7 days initially

    const ticks = await this.prisma.priceTick.findMany({
      where: {
        poolId,
        timestamp: { gte: startFrom },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (ticks.length === 0) return 0;

    // Group ticks into candle periods
    const candles = new Map<number, {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: bigint;
      txCount: number;
    }>();

    for (const tick of ticks) {
      const periodStart = this.floorToInterval(tick.timestamp, intervalMs).getTime();
      const price = Number(tick.price);
      const tickVolume = BigInt(tick.volume.toString());

      const existing = candles.get(periodStart);
      if (existing) {
        existing.high = Math.max(existing.high, price);
        existing.low = Math.min(existing.low, price);
        existing.close = price;
        existing.volume += tickVolume;
        existing.txCount += 1;
      } else {
        candles.set(periodStart, {
          open: price,
          high: price,
          low: price,
          close: price,
          volume: tickVolume,
          txCount: 1,
        });
      }
    }

    let count = 0;
    for (const [periodMs, candle] of candles) {
      const openTime = new Date(periodMs);
      const closeTime = new Date(periodMs + intervalMs);

      await this.prisma.candle.upsert({
        where: {
          poolId_interval_openTime: {
            poolId,
            interval,
            openTime,
          },
        },
        create: {
          poolId,
          interval,
          openTime,
          closeTime,
          open: new Decimal(candle.open),
          high: new Decimal(candle.high),
          low: new Decimal(candle.low),
          close: new Decimal(candle.close),
          volume: candle.volume.toString(),
          txCount: candle.txCount,
        },
        update: {
          high: new Decimal(candle.high),
          low: new Decimal(candle.low),
          close: new Decimal(candle.close),
          volume: candle.volume.toString(),
          txCount: candle.txCount,
        },
      });
      count++;
    }

    return count;
  }

  /** Floor a timestamp to the nearest interval boundary */
  private floorToInterval(date: Date, intervalMs: number): Date {
    const ms = date.getTime();
    return new Date(ms - (ms % intervalMs));
  }
}
