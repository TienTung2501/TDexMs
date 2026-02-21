/**
 * Pool Controller
 * CRUD operations for liquidity pools
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validation.js';
import { writeLimiter } from '../middleware/rate-limiter.js';
import {
  poolCreateSchema,
  depositSchema,
  withdrawSchema,
  poolListSchema,
  FEE_DENOMINATOR,
} from '../../../shared/index.js';
import type { GetPoolInfo } from '../../../application/use-cases/GetPoolInfo.js';
import type { CreatePool } from '../../../application/use-cases/CreatePool.js';
import type { DepositLiquidity } from '../../../application/use-cases/DepositLiquidity.js';
import type { WithdrawLiquidity } from '../../../application/use-cases/WithdrawLiquidity.js';
import { getPrisma } from '../../../infrastructure/database/prisma-client.js';

export function createPoolRouter(
  getPoolInfo: GetPoolInfo,
  createPool: CreatePool,
  depositLiquidity: DepositLiquidity,
  withdrawLiquidity: WithdrawLiquidity,
): Router {
  const router = Router();

  /** GET /v1/pools — List pools */
  router.get(
    '/pools',
    validate(poolListSchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await getPoolInfo.list(req.query as Record<string, string>);
        // Serialize Pool domain entities to DTOs — prevents bigint crash
        // and matches frontend PoolListResponse: { data, pagination }
        res.json({
          data: result.items.map((pool) => ({
            poolId: pool.id,
            assetA: { policyId: pool.assetAPolicyId, assetName: pool.assetAAssetName },
            assetB: { policyId: pool.assetBPolicyId, assetName: pool.assetBAssetName },
            reserveA: pool.reserveA.toString(),
            reserveB: pool.reserveB.toString(),
            totalLpTokens: pool.totalLpTokens.toString(),
            feeNumerator: pool.feeNumerator,
            feeDenominator: FEE_DENOMINATOR,
            state: pool.state,
            tvlAda: pool.tvlAda.toString(),
            volume24h: pool.volume24h.toString(),
            fees24h: pool.fees24h.toString(),
            apy: pool.calculateApy(),
            createdAt: pool.createdAt.toISOString(),
          })),
          pagination: {
            cursor: result.cursor,
            hasMore: result.hasMore,
            total: result.total,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/pools/:poolId — Get pool detail */
  router.get(
    '/pools/:poolId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const pool = await getPoolInfo.getById(req.params.poolId as string);
        res.json({
          poolId: pool.id,
          assetA: { policyId: pool.assetAPolicyId, assetName: pool.assetAAssetName },
          assetB: { policyId: pool.assetBPolicyId, assetName: pool.assetBAssetName },
          reserveA: pool.reserveA.toString(),
          reserveB: pool.reserveB.toString(),
          totalLpTokens: pool.totalLpTokens.toString(),
          feeNumerator: pool.feeNumerator,
          feeDenominator: FEE_DENOMINATOR,
          state: pool.state,
          tvlAda: pool.tvlAda.toString(),
          volume24h: pool.volume24h.toString(),
          fees24h: pool.fees24h.toString(),
          apy: pool.calculateApy(),
          createdAt: pool.createdAt.toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** POST /v1/pools/create — Create pool */
  router.post(
    '/pools/create',
    writeLimiter,
    validate(poolCreateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await createPool.execute(req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /** POST /v1/pools/:poolId/deposit — Add liquidity */
  router.post(
    '/pools/:poolId/deposit',
    writeLimiter,
    validate(depositSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await depositLiquidity.execute({
          ...req.body,
          poolId: req.params.poolId as string,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /** POST /v1/pools/:poolId/withdraw — Remove liquidity */
  router.post(
    '/pools/:poolId/withdraw',
    writeLimiter,
    validate(withdrawSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await withdrawLiquidity.execute({
          ...req.body,
          poolId: req.params.poolId as string,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/pools/:poolId/history — Pool TVL/volume/price history */
  router.get(
    '/pools/:poolId/history',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const poolId = req.params.poolId as string;
        // Frontend sends ?period=7d&interval=1d — parse "7d" → 7
        const periodStr = (req.query.period as string) || (req.query.days as string) || '30d';
        const days = Math.min(parseInt(periodStr, 10) || 30, 365);
        const prisma = getPrisma();

        const pool = await prisma.pool.findUnique({ where: { id: poolId } });
        if (!pool) {
          res.status(404).json({ error: 'Pool not found' });
          return;
        }

        // Generate placeholder history based on current state
        // In production, this would query a pool_snapshots table
        const now = Date.now();
        const history = [];
        const currentTvl = Number(pool.tvlAda ?? 0n);
        const currentVol = Number(pool.volume24h ?? 0n);

        for (let i = days - 1; i >= 0; i--) {
          const ts = new Date(now - i * 86_400_000);
          const factor = 0.8 + Math.random() * 0.4;
          history.push({
            timestamp: ts.toISOString(),
            tvlAda: Math.round(currentTvl * factor),
            volume: Math.round(currentVol * factor),
            feeRevenue: Math.round(currentVol * factor * 0.003),
            price: pool.reserveB && pool.reserveA
              ? Number(pool.reserveA) / Number(pool.reserveB) * factor
              : 0,
          });
        }

        res.json({
          poolId,
          history,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
