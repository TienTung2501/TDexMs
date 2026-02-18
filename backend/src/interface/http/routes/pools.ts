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
        res.json(result);
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
          assetA: `${pool.assetAPolicyId}.${pool.assetAAssetName}`,
          assetB: `${pool.assetBPolicyId}.${pool.assetBAssetName}`,
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

  return router;
}
