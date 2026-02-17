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
        const [poolCount, intentCount, filledCount] = await Promise.all([
          prisma.pool.count({ where: { state: 'ACTIVE' } }),
          prisma.intent.count(),
          prisma.intent.count({ where: { status: 'FILLED' } }),
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
          poolCount: pools.length,
          pools: pools.map((p) => ({
            poolId: p.id,
            assetA: `${p.assetAPolicyId}.${p.assetAAssetName}`,
            assetB: `${p.assetBPolicyId}.${p.assetBAssetName}`,
            reserveA: p.reserveA.toString(),
            reserveB: p.reserveB.toString(),
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
