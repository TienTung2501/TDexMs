/**
 * Swap & Solver Routes
 * Solver fill-intent (settlement) and order execution.
 *
 * Refactored (Task 2 / G1 G2 G3 G4): Routes now delegate to proper domain
 * use-cases instead of calling TxBuilder directly.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { writeLimiter } from '../middleware/rate-limiter.js';
import type { SettleIntentUseCase } from '../../../application/use-cases/SettleIntentUseCase.js';
import type { ExecuteOrderUseCase } from '../../../application/use-cases/ExecuteOrderUseCase.js';
import type { UpdateSettingsUseCase } from '../../../application/use-cases/UpdateSettingsUseCase.js';

export function createSwapRouter(deps: {
  settleIntent: SettleIntentUseCase;
  executeOrder: ExecuteOrderUseCase;
  updateSettings: UpdateSettingsUseCase;
}): Router {
  const router = Router();

  // ═══════════════════════════════════════════
  // POST /v1/solver/fill-intent — Solver fills escrow intents against pool
  //
  // Accepts:
  //   - intent_ids: string[]   DB UUIDs (preferred; validated by SettleIntentUseCase)
  // ═══════════════════════════════════════════
  router.post(
    '/solver/fill-intent',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { solver_address, intent_ids, pool_utxo_ref } = req.body;

        if (!solver_address) {
          res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'solver_address is required' });
          return;
        }
        if (!pool_utxo_ref?.tx_hash) {
          res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'pool_utxo_ref is required' });
          return;
        }
        if (!intent_ids?.length) {
          res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'intent_ids (DB UUIDs) are required' });
          return;
        }

        const result = await deps.settleIntent.execute({
          intentIds: intent_ids as string[],
          poolUtxoRef: { txHash: pool_utxo_ref.tx_hash, outputIndex: pool_utxo_ref.output_index },
          solverAddress: solver_address,
        });
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // ═══════════════════════════════════════════
  // POST /v1/solver/execute-order — Execute a pending DCA/Limit order against pool
  // ═══════════════════════════════════════════
  router.post(
    '/solver/execute-order',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { solver_address, order_id, pool_utxo_ref } = req.body;

        if (!solver_address || !order_id || !pool_utxo_ref) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'solver_address, order_id, and pool_utxo_ref are required',
          });
          return;
        }

        const result = await deps.executeOrder.execute({
          orderId: order_id,
          poolUtxoRef: { txHash: pool_utxo_ref.tx_hash, outputIndex: pool_utxo_ref.output_index },
          solverAddress: solver_address,
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // ═══════════════════════════════════════════
  // POST /v1/admin/settings/build-deploy — Deploy initial settings UTxO
  // POST /v1/admin/settings/build-update — Update existing settings UTxO
  // ═══════════════════════════════════════════
  router.post(
    '/admin/settings/build-deploy',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address, protocol_fee_bps, min_pool_liquidity, fee_collector_address } = req.body;

        if (!admin_address) {
          res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'admin_address is required' });
          return;
        }

        const result = await deps.updateSettings.execute({
          adminAddress: admin_address,
          protocolFeeBps: protocol_fee_bps ?? 5,
          minPoolLiquidity: min_pool_liquidity?.toString() ?? '2000000',
          feeCollectorAddress: fee_collector_address,
          mode: 'deploy',
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/admin/settings/build-update',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { admin_address, protocol_fee_bps, min_pool_liquidity, next_version } = req.body;

        if (!admin_address) {
          res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'admin_address is required' });
          return;
        }

        const result = await deps.updateSettings.execute({
          adminAddress: admin_address,
          protocolFeeBps: protocol_fee_bps ?? 5,
          minPoolLiquidity: min_pool_liquidity?.toString() ?? '2000000',
          nextVersion: next_version,
          mode: 'update',
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
