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
            assetA: {
              policyId: pool.assetAPolicyId,
              assetName: pool.assetAAssetName,
              ticker: pool.assetATicker ?? undefined,
              decimals: pool.assetADecimals,
            },
            assetB: {
              policyId: pool.assetBPolicyId,
              assetName: pool.assetBAssetName,
              ticker: pool.assetBTicker ?? undefined,
              decimals: pool.assetBDecimals,
            },
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
          assetA: {
            policyId: pool.assetAPolicyId,
            assetName: pool.assetAAssetName,
            ticker: pool.assetATicker ?? undefined,
            decimals: pool.assetADecimals,
          },
          assetB: {
            policyId: pool.assetBPolicyId,
            assetName: pool.assetBAssetName,
            ticker: pool.assetBTicker ?? undefined,
            decimals: pool.assetBDecimals,
          },
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

        // R-02 fix: Query real PoolHistory rows written by PoolSnapshotCron / SolverEngine / Deposit / Withdraw
        const since = new Date(Date.now() - days * 86_400_000);
        const historyRows = await prisma.poolHistory.findMany({
          where: {
            poolId,
            timestamp: { gte: since },
          },
          orderBy: { timestamp: 'asc' },
        });

        // If no snapshot rows exist yet (fresh deployment), fall back to
        // a single-entry "current" snapshot so the UI is not blank.
        const history = historyRows.length > 0
          ? historyRows.map((h) => ({
              timestamp: h.timestamp.toISOString(),
              tvlAda: Number(h.tvlAda ?? 0),
              volume: Number(h.volume ?? 0),
              feeRevenue: Number(h.fees ?? 0),
              price: h.price ?? 0,
            }))
          : [{
              timestamp: new Date().toISOString(),
              tvlAda: Number(pool.tvlAda ?? 0n),
              volume: Number(pool.volume24h ?? 0n),
              feeRevenue: Number(pool.fees24h ?? 0n) * 0.003,
              price: pool.reserveB && pool.reserveA
                ? Number(pool.reserveA) / Number(pool.reserveB)
                : 0,
            }];

        res.json({
          poolId,
          history,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/tokens — Dynamic token registry derived from active pools (R-10 fix) */
  router.get(
    '/tokens',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const prisma = getPrisma();
        const pools = await prisma.pool.findMany({
          where: { state: 'ACTIVE' },
          select: {
            assetAPolicyId: true,
            assetAAssetName: true,
            assetATicker: true,
            assetADecimals: true,
            assetBPolicyId: true,
            assetBAssetName: true,
            assetBTicker: true,
            assetBDecimals: true,
          },
        });

        // De-duplicate tokens from all pool pairs
        const tokenMap = new Map<string, {
          policyId: string;
          assetName: string;
          ticker: string;
          decimals: number;
        }>();

        // Always include ADA
        tokenMap.set('lovelace', {
          policyId: '',
          assetName: '',
          ticker: 'ADA',
          decimals: 6,
        });

        for (const pool of pools) {
          const keyA = pool.assetAPolicyId
            ? `${pool.assetAPolicyId}.${pool.assetAAssetName}`
            : 'lovelace';
          if (!tokenMap.has(keyA)) {
            tokenMap.set(keyA, {
              policyId: pool.assetAPolicyId,
              assetName: pool.assetAAssetName,
              ticker: pool.assetATicker ?? pool.assetAAssetName.slice(0, 8) ?? keyA.slice(0, 12),
              decimals: pool.assetADecimals ?? 6,
            });
          }

          const keyB = pool.assetBPolicyId
            ? `${pool.assetBPolicyId}.${pool.assetBAssetName}`
            : 'lovelace';
          if (!tokenMap.has(keyB)) {
            tokenMap.set(keyB, {
              policyId: pool.assetBPolicyId,
              assetName: pool.assetBAssetName,
              ticker: pool.assetBTicker ?? pool.assetBAssetName.slice(0, 8) ?? keyB.slice(0, 12),
              decimals: pool.assetBDecimals ?? 6,
            });
          }
        }

        const tokens = Array.from(tokenMap.values());
        res.json({ tokens, count: tokens.length });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
