/**
 * Admin Controller
 * Protected endpoints for factory admin operations:
 * auth check, dashboard metrics, revenue collection,
 * settings management, and danger-zone operations.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { writeLimiter } from '../middleware/rate-limiter.js';
import { env } from '../../../config/env.js';
import type { IPoolRepository } from '../../../domain/ports/IPoolRepository.js';
import type { IIntentRepository } from '../../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../../domain/ports/IOrderRepository.js';
import type { ITxBuilder } from '../../../domain/ports/index.js';
import type { CandlestickService } from '../../../application/services/CandlestickService.js';
import { UpdateSettingsUseCase } from '../../../application/use-cases/UpdateSettingsUseCase.js';

export interface AdminDependencies {
  poolRepo: IPoolRepository;
  intentRepo: IIntentRepository;
  orderRepo: IOrderRepository;
  candlestickService: CandlestickService;
  txBuilder?: ITxBuilder;
  prisma?: PrismaClient;
}

export function createAdminRouter(deps: AdminDependencies): Router {
  const router = Router();

  // ── Admin Auth Check ────────────────────────
  router.get(
    '/admin/auth/check',
    async (req: Request, res: Response, _next: NextFunction) => {
      const walletAddress = req.query.wallet_address as string;
      const adminAddr = env.ADMIN_ADDRESS;

      const isAdmin = !!walletAddress && !!adminAddr && walletAddress === adminAddr;

      res.json({
        is_admin: isAdmin,
        roles: {
          is_factory_admin: isAdmin,
          is_settings_admin: isAdmin,
        },
        system_status: {
          current_version: 1, // TODO: read from on-chain settings datum
        },
      });
    },
  );

  // ── Dashboard Metrics ───────────────────────
  router.get(
    '/admin/dashboard/metrics',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const pools = await deps.poolRepo.findAllActive();

        let totalTvl = 0n;
        let totalVol24h = 0n;
        for (const pool of pools) {
          totalTvl += pool.tvlAda;
          totalVol24h += pool.volume24h;
        }

        // Aggregate pending fees (placeholder: protocol fee from volume)
        const totalPendingFees = Number(totalVol24h) * 0.003; // 0.3% fee estimate

        // Generate 30d fee chart (placeholder — evenly distributed)
        const fee_growth_30d: { date: string; accumulated_usd: number }[] = [];
        const now = Date.now();
        for (let i = 29; i >= 0; i--) {
          const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
          fee_growth_30d.push({
            date,
            accumulated_usd: totalPendingFees * ((30 - i) / 30),
          });
        }

        res.json({
          total_tvl_usd: Number(totalTvl) * 0.5, // placeholder ADA→USD
          volume_24h_usd: Number(totalVol24h) * 0.5,
          active_pools: pools.length,
          total_pending_fees_usd: totalPendingFees * 0.5,
          charts: { fee_growth_30d },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Revenue: Pending Fees ───────────────────
  router.get(
    '/admin/revenue/pending',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const pools = await deps.poolRepo.findAllActive();

        const entries = pools.map((pool) => {
          // Placeholder fee calculation: 0.3% of volume
          const feeEstimate = Number(pool.volume24h) * 0.003;
          return {
            pool_id: pool.id,
            pair: `${pool.assetAAssetName || 'ADA'}_${pool.assetBAssetName || 'ADA'}`,
            pending_fees: {
              asset_a_amount: feeEstimate / 2,
              asset_b_amount: feeEstimate / 2,
              total_usd_value: feeEstimate * 0.5,
            },
          };
        });

        res.json(entries);
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Revenue: Build Collect Fees TX ──────────
  router.post(
    '/admin/revenue/build-collect',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address, pool_ids } = req.body;
        if (!admin_address || !pool_ids?.length) {
          res.status(400).json({ error: 'admin_address and pool_ids are required' });
          return;
        }

        if (!deps.txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        const result = await deps.txBuilder.buildCollectFeesTx({
          adminAddress: admin_address,
          poolIds: pool_ids,
        });

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Settings: Current ───────────────────────
  router.get(
    '/admin/settings/current',
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        // TODO: Read from on-chain settings UTxO when settings_validator is deployed
        res.json({
          global_settings: {
            max_protocol_fee_bps: 30, // 0.3%
            min_pool_liquidity: 1_000_000, // 1 ADA
            current_version: 1,
          },
          factory_settings: {
            admin_vkh: env.ADMIN_ADDRESS
              ? env.ADMIN_ADDRESS.slice(0, 56) // placeholder VKH extraction
              : '',
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Settings: Build Update Global ───────────
  router.post(
    '/admin/settings/build-update-global',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address, new_settings } = req.body;
        if (!admin_address || !new_settings) {
          res.status(400).json({ error: 'admin_address and new_settings are required' });
          return;
        }

        if (!deps.txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        // R-14 fix: Route through UpdateSettingsUseCase for domain validation
        const useCase = new UpdateSettingsUseCase(deps.txBuilder);
        const result = await useCase.execute({
          adminAddress: admin_address,
          protocolFeeBps: new_settings.max_protocol_fee_bps ?? 30,
          minPoolLiquidity: String(new_settings.min_pool_liquidity ?? 1_000_000),
          nextVersion: new_settings.next_version ?? 1,
          mode: 'update',
        });

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Settings: Build Update Factory Admin ────
  router.post(
    '/admin/settings/build-update-factory',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { current_admin_address, new_admin_vkh } = req.body;
        if (!current_admin_address || !new_admin_vkh) {
          res.status(400).json({ error: 'current_admin_address and new_admin_vkh are required' });
          return;
        }

        if (!deps.txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        const result = await deps.txBuilder.buildUpdateFactoryAdminTx({
          currentAdminAddress: current_admin_address,
          newAdminVkh: new_admin_vkh,
        });

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Factory: Build Deploy ────────────────────
  router.post(
    '/admin/factory/build-deploy',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address } = req.body;
        if (!admin_address) {
          res.status(400).json({ error: 'admin_address is required' });
          return;
        }

        if (!deps.txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        const result = await deps.txBuilder.buildDeployFactoryTx({
          adminAddress: admin_address,
        });

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Danger Zone: Burn Pool NFT ──────────────
  router.post(
    '/admin/pools/build-burn',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address, pool_id } = req.body;
        if (!admin_address || !pool_id) {
          res.status(400).json({ error: 'admin_address and pool_id are required' });
          return;
        }

        if (!deps.txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        const result = await deps.txBuilder.buildBurnPoolNFTTx({
          adminAddress: admin_address,
          poolId: pool_id,
        });

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Danger Zone: Reset Database ─────────────
  router.post(
    '/admin/reset-db',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address, confirm } = req.body;

        // Require admin auth
        if (!admin_address || admin_address !== env.ADMIN_ADDRESS) {
          res.status(403).json({ error: 'Forbidden: admin_address does not match ADMIN_ADDRESS' });
          return;
        }

        if (confirm !== 'RESET_ALL_DATA') {
          res.status(400).json({ error: 'Must send confirm: "RESET_ALL_DATA"' });
          return;
        }

        if (!deps.prisma) {
          res.status(503).json({ error: 'Prisma client not available' });
          return;
        }

        const prisma = deps.prisma;

        // Delete in FK-safe order
        const deleted: Record<string, number> = {};
        deleted.swap = (await prisma.swap.deleteMany()).count;
        deleted.poolHistory = (await prisma.poolHistory.deleteMany()).count;
        deleted.candle = (await prisma.candle.deleteMany()).count;
        deleted.priceTick = (await prisma.priceTick.deleteMany()).count;
        deleted.protocolStats = (await prisma.protocolStats.deleteMany()).count;
        deleted.order = (await prisma.order.deleteMany()).count;
        deleted.intent = (await prisma.intent.deleteMany()).count;
        deleted.pool = (await prisma.pool.deleteMany()).count;

        res.json({
          success: true,
          message: 'All data deleted',
          deleted,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
