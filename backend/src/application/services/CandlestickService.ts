/**
 * CandlestickService — TradingView-compatible OHLCV data provider
 *
 * Responsibilities:
 * 1. Record price ticks from swaps
 * 2. Aggregate ticks into OHLCV candles at 4H / 1D / 1W intervals
 * 3. Serve candle data for frontend charts (TradingView Lightweight Charts)
 * 4. Use Upstash Redis cache for read-heavy chart queries
 *
 * Storage optimization (Supabase Free 500MB):
 * - Only H4, D1, W1 candles are persisted to PostgreSQL
 * - PriceTicks are kept for 2 days then cleaned
 * - Smaller intervals (1m–1h) can be enabled later when upgrading
 */
import type { PrismaClient, CandleInterval } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { getLogger } from '../../config/logger.js';
import type { CacheService } from '../../infrastructure/cache/CacheService.js';
import { CacheKeys, CacheTTL } from '../../infrastructure/cache/CacheService.js';

/** Only intervals we actually persist (free tier) */
const STORED_INTERVALS: Record<string, { enum: CandleInterval; ms: number }> = {
  H4: { enum: 'H4', ms: 4 * 60 * 60_000 },
  D1: { enum: 'D1', ms: 24 * 60 * 60_000 },
  W1: { enum: 'W1', ms: 7 * 24 * 60 * 60_000 },
};

/** String → enum mapping for API queries */
const INTERVAL_MAP: Record<string, CandleInterval> = {
  '4h': 'H4',
  '1d': 'D1',
  '1w': 'W1',
  H4: 'H4',
  D1: 'D1',
  W1: 'W1',
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
  interval: string;   // '4h' | '1d' | '1w'
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

    // Only upsert for stored intervals (H4, D1, W1)
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
        `Note: Only 4h/1d/1w are stored on free tier.`,
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
   * Get available intervals (only stored ones on free tier).
   */
  getAvailableIntervals(): Array<{ value: string; label: string; seconds: number }> {
    return [
      { value: '4h', label: '4H', seconds: 14400 },
      { value: '1d', label: '1D', seconds: 86400 },
      { value: '1w', label: '1W', seconds: 604800 },
    ];
  }

  // ═══════════════════════════════════════════
  // 3. BATCH AGGREGATION (cron job)
  // ═══════════════════════════════════════════

  /**
   * Aggregate recent price ticks into candles.
   * Only processes H4, D1, W1 intervals (free tier).
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
   * Cleanup old ticks to save Supabase storage.
   * Ticks: keep 2 days. Candles: keep forever (only 3 intervals = small footprint).
   */
  async cleanupOldData(): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60_000);

    const result = await this.prisma.priceTick.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.info({ count: result.count }, 'Cleaned old price ticks');
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
