/**
 * Analytics Controller
 * Protocol-wide and token-specific analytics
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../../infrastructure/database/prisma-client.js';

export function createAnalyticsRouter(): Router {
  const router = Router();

  /** GET /v1/analytics/overview — Protocol overview */
  router.get(
    '/analytics/overview',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const prisma = getPrisma();

        // Gather protocol stats
        const [poolCount, intentCount, filledCount, uniqueTraders] = await Promise.all([
          prisma.pool.count({ where: { state: 'ACTIVE' } }),
          prisma.intent.count(),
          prisma.intent.count({ where: { status: 'FILLED' } }),
          prisma.intent.groupBy({ by: ['creator'] }).then((g) => g.length).catch(() => 0),
        ]);

        // Try to get protocol stats record
        const stats = await prisma.protocolStats.findFirst({
          orderBy: { timestamp: 'desc' },
        });

        res.json({
          tvl: stats?.tvl?.toString() ?? '0',
          volume24h: stats?.volume24h?.toString() ?? '0',
          volume7d: stats?.volume7d?.toString() ?? '0',
          fees24h: stats?.fees24h?.toString() ?? '0',
          totalPools: poolCount,
          totalIntents: intentCount,
          intentsFilled: filledCount,
          fillRate: intentCount > 0 ? (filledCount / intentCount) * 100 : 0,
          uniqueTraders,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/analytics/tokens/:assetId — Token analytics */
  router.get(
    '/analytics/tokens/:assetId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const prisma = getPrisma();
        const assetId = req.params.assetId as string;

        // Find pools containing this asset
        const pools = await prisma.pool.findMany({
          where: {
            OR: [
              { assetAPolicyId: assetId },
              { assetBPolicyId: assetId },
            ],
            state: 'ACTIVE',
          },
        });

        // Derive price from the deepest liquidity pool containing this asset
        let price = 0;
        let volume24h = 0;
        let ticker = '';
        let bestTvl = 0n;

        for (const p of pools) {
          const rA = Number(p.reserveA);
          const rB = Number(p.reserveB);
          if (rA <= 0 || rB <= 0) continue;

          const isA = p.assetAPolicyId === assetId;
          // price in terms of the counter-asset
          const unitPrice = isA ? rB / rA : rA / rB;
          const tvl = BigInt(p.tvlAda?.toString() ?? '0');

          if (tvl > bestTvl || bestTvl === 0n) {
            bestTvl = tvl;
            price = unitPrice;
            ticker = isA
              ? (p.assetAAssetName || `${p.assetAPolicyId.slice(0, 8)}..`)
              : (p.assetBAssetName || `${p.assetBPolicyId.slice(0, 8)}..`);
          }
          volume24h += Number(p.volume24h ?? 0);
        }

        // Derive 24h price change from the most recent candle
        let priceChange24h = 0;
        if (pools.length > 0) {
          const bestPool = pools.reduce((best, p) =>
            BigInt(p.tvlAda?.toString() ?? '0') > BigInt(best.tvlAda?.toString() ?? '0') ? p : best
          );
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const oldCandle = await prisma.candle.findFirst({
            where: { poolId: bestPool.id, interval: '1h', openTime: { lte: yesterday } },
            orderBy: { openTime: 'desc' },
          }).catch(() => null);
          if (oldCandle && Number(oldCandle.open) > 0 && price > 0) {
            priceChange24h = ((price - Number(oldCandle.open)) / Number(oldCandle.open)) * 100;
          }
        }

        // Estimate market cap from total supply across pools
        const marketCap = price > 0
          ? pools.reduce((sum, p) => {
              const isA = p.assetAPolicyId === assetId;
              return sum + Number(isA ? p.reserveA : p.reserveB) * 2; // 2× pool reserve ≈ rough circulating proxy
            }, 0) * price
          : 0;

        res.json({
          assetId,
          ticker,
          price,
          priceChange24h,
          volume24h,
          marketCap,
          poolCount: pools.length,
          pools: pools.map((p) => ({
            poolId: p.id,
            assetA: { policyId: p.assetAPolicyId, assetName: p.assetAAssetName },
            assetB: { policyId: p.assetBPolicyId, assetName: p.assetBAssetName },
            reserveA: p.reserveA.toString(),
            reserveB: p.reserveB.toString(),
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/analytics/prices — Token price list derived from pool reserves */
  router.get(
    '/analytics/prices',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const prisma = getPrisma();

        // Get all active pools and derive token prices
        const pools = await prisma.pool.findMany({
          where: { state: 'ACTIVE' },
        });

        // Build price map: token → price in ADA (lovelace)
        const prices: Record<string, { price_ada: number; price_usd: number; source_pool: string }> = {};

        // ADA is the base currency
        prices['ADA'] = { price_ada: 1, price_usd: 0.5, source_pool: '' };

        for (const pool of pools) {
          const reserveA = Number(pool.reserveA);
          const reserveB = Number(pool.reserveB);

          if (reserveA > 0 && reserveB > 0) {
            // If asset A is ADA (empty policy ID), then asset B price = reserveA / reserveB
            const aIsAda = !pool.assetAPolicyId || pool.assetAPolicyId === '';
            const bIsAda = !pool.assetBPolicyId || pool.assetBPolicyId === '';

            if (aIsAda) {
              const ticker = pool.assetBAssetName || `${pool.assetBPolicyId.slice(0, 8)}..`;
              const priceInAda = reserveA / reserveB;
              prices[ticker] = {
                price_ada: priceInAda,
                price_usd: priceInAda * 0.5,
                source_pool: pool.id,
              };
            } else if (bIsAda) {
              const ticker = pool.assetAAssetName || `${pool.assetAPolicyId.slice(0, 8)}..`;
              const priceInAda = reserveB / reserveA;
              prices[ticker] = {
                price_ada: priceInAda,
                price_usd: priceInAda * 0.5,
                source_pool: pool.id,
              };
            } else {
              // Non-ADA pair — derive relative price
              const tickerA = pool.assetAAssetName || `${pool.assetAPolicyId.slice(0, 8)}..`;
              const tickerB = pool.assetBAssetName || `${pool.assetBPolicyId.slice(0, 8)}..`;
              if (!prices[tickerA]) {
                prices[tickerA] = {
                  price_ada: 0,
                  price_usd: 0,
                  source_pool: pool.id,
                };
              }
              if (!prices[tickerB]) {
                prices[tickerB] = {
                  price_ada: 0,
                  price_usd: 0,
                  source_pool: pool.id,
                };
              }
            }
          }
        }

        res.json({
          prices: Object.entries(prices).map(([ticker, data]) => ({
            assetId: data.source_pool ? ticker : 'lovelace',
            ticker,
            priceAda: data.price_ada,
            priceUsd: data.price_usd,
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
