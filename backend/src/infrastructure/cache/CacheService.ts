/**
 * CacheService — Upstash Redis-based caching layer
 *
 * Provides a unified cache interface for the entire backend.
 * Uses Upstash Redis (serverless, HTTP-based) — compatible with
 * Render Free Tier (no persistent TCP connections needed).
 *
 * Cache Strategy:
 * - Blockfrost responses: short TTL (30-60s) to reduce API calls
 * - Chart candle data: medium TTL (5-15 min) for read-heavy chart queries
 * - Pool data: short TTL (30s) for near-real-time accuracy
 * - Health check: very short TTL (10s) to reduce DB + Blockfrost hits
 *
 * Graceful degradation: if Redis is unavailable, all methods
 * return null/false and the app falls back to direct DB/API queries.
 */
import { Redis } from '@upstash/redis';
import { getLogger } from '../../config/logger.js';

/** Cache key prefixes to organize namespaces */
export const CacheKeys = {
  /** Blockfrost chain tip: `bf:tip` */
  CHAIN_TIP: 'bf:tip',
  /** Blockfrost UTxOs: `bf:utxos:{address}` */
  UTXOS: (address: string) => `bf:utxos:${address}`,
  /** Blockfrost protocol params: `bf:params` */
  PROTOCOL_PARAMS: 'bf:params',
  /** Blockfrost health: `bf:health` */
  BF_HEALTH: 'bf:health',

  /** Chart candles: `chart:candles:{poolId}:{interval}:{from}:{to}` */
  CANDLES: (poolId: string, interval: string, from?: number, to?: number) =>
    `chart:candles:${poolId}:${interval}:${from ?? 0}:${to ?? 0}`,
  /** Latest price: `chart:price:{poolId}` */
  LATEST_PRICE: (poolId: string) => `chart:price:${poolId}`,
  /** Pool chart info: `chart:info:{poolId}` */
  POOL_CHART_INFO: (poolId: string) => `chart:info:${poolId}`,

  /** Pool data: `pool:{poolId}` */
  POOL: (poolId: string) => `pool:${poolId}`,
  /** Pool list: `pools:active` */
  ACTIVE_POOLS: 'pools:active',

  /** Health check result: `sys:health` */
  HEALTH: 'sys:health',
} as const;

/** Default TTLs in seconds */
export const CacheTTL = {
  /** Blockfrost queries — 30s (reduce 50k/day API usage) */
  BLOCKFROST: 30,
  /** Chain tip — 15s (need relatively fresh) */
  CHAIN_TIP: 15,
  /** Protocol parameters — 5 min (rarely change) */
  PROTOCOL_PARAMS: 300,
  /** Chart candles — 5 min (historical data is static) */
  CANDLES: 300,
  /** Latest price — 15s (needs to be fresh) */
  LATEST_PRICE: 15,
  /** Pool chart info — 30s */
  POOL_CHART_INFO: 30,
  /** Pool data — 30s */
  POOL: 30,
  /** Active pools list — 60s */
  ACTIVE_POOLS: 60,
  /** Health check — 10s */
  HEALTH: 10,
} as const;

export class CacheService {
  private readonly redis: Redis;
  private readonly logger;
  private connected = false;

  constructor(redisUrl: string, redisToken: string) {
    this.redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    this.logger = getLogger().child({ service: 'cache' });
  }

  // ═══════════════════════════════════════════
  // Core operations
  // ═══════════════════════════════════════════

  /**
   * Get a cached value. Returns null if not found or on error.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get<T>(key);
      return value;
    } catch (err) {
      this.logger.debug({ err, key }, 'Cache get failed (graceful)');
      return null;
    }
  }

  /**
   * Set a cache value with TTL (in seconds).
   * Silently fails if Redis is unavailable.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } catch (err) {
      this.logger.debug({ err, key }, 'Cache set failed (graceful)');
    }
  }

  /**
   * Delete a cache key.
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.debug({ err, key }, 'Cache del failed (graceful)');
    }
  }

  /**
   * Delete all keys matching a pattern (use sparingly).
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      let cursor = '0';
      let deleted = 0;
      do {
        const [nextCursor, keys] = await this.redis.scan(Number(cursor), { match: pattern, count: 100 });
        cursor = String(nextCursor);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
      return deleted;
    } catch (err) {
      this.logger.debug({ err, pattern }, 'Cache invalidate pattern failed');
      return 0;
    }
  }

  // ═══════════════════════════════════════════
  // Cache-aside pattern helper
  // ═══════════════════════════════════════════

  /**
   * Get from cache or execute the fetcher function and cache the result.
   * This is the primary pattern for all cached operations.
   *
   * @example
   * const tip = await cache.getOrSet(
   *   CacheKeys.CHAIN_TIP,
   *   CacheTTL.CHAIN_TIP,
   *   () => blockfrost.getChainTip(),
   * );
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss — execute fetcher
    const value = await fetcher();

    // Store in cache (fire-and-forget)
    this.set(key, value, ttlSeconds).catch(() => {
      /* graceful — already logged in set() */
    });

    return value;
  }

  // ═══════════════════════════════════════════
  // Health & diagnostics
  // ═══════════════════════════════════════════

  /**
   * Check if Redis is reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      this.connected = result === 'PONG';
      return this.connected;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * Get cache stats for monitoring.
   */
  async getStats(): Promise<{ connected: boolean; dbSize: number } | null> {
    try {
      const size = await this.redis.dbsize();
      return { connected: true, dbSize: size };
    } catch {
      return { connected: false, dbSize: 0 };
    }
  }
}
