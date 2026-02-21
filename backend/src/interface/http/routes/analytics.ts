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

        res.json({
          assetId,
          ticker: '',
          price: 0,
          priceChange24h: 0,
          volume24h: 0,
          marketCap: 0,
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
