/**
 * Swap & Solver Routes
 * Direct pool swaps, escrow fill (settlement), and order execution.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { writeLimiter } from '../middleware/rate-limiter.js';
import type { ITxBuilder } from '../../../domain/ports/index.js';

export function createSwapRouter(txBuilder: ITxBuilder): Router {
  const router = Router();

  // ═══════════════════════════════════════════
  // POST /v1/swap/build — Build a direct pool swap TX (no escrow)
  // ═══════════════════════════════════════════
  router.post(
    '/swap/build',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          sender_address,
          change_address,
          input_asset_id,
          input_amount,
          output_asset_id,
          min_output,
          deadline,
        } = req.body;

        if (!sender_address || !input_asset_id || !input_amount || !output_asset_id) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'sender_address, input_asset_id, input_amount, output_asset_id are required',
          });
          return;
        }

        const result = await txBuilder.buildDirectSwapTx({
          senderAddress: sender_address,
          changeAddress: change_address || sender_address,
          inputAssetId: input_asset_id,
          inputAmount: BigInt(input_amount),
          outputAssetId: output_asset_id,
          minOutput: BigInt(min_output || 0),
          deadline: deadline || Date.now() + 15 * 60 * 1000, // 15min default
        });

        res.status(200).json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ═══════════════════════════════════════════
  // POST /v1/solver/fill-intent — Solver fills escrow intents against pool
  // ═══════════════════════════════════════════
  router.post(
    '/solver/fill-intent',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          solver_address,
          intent_utxo_refs,
          pool_utxo_ref,
        } = req.body;

        if (!solver_address || !intent_utxo_refs?.length || !pool_utxo_ref) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'solver_address, intent_utxo_refs, pool_utxo_ref are required',
          });
          return;
        }

        const result = await txBuilder.buildSettlementTx({
          solverAddress: solver_address,
          intentUtxoRefs: intent_utxo_refs.map((ref: { tx_hash: string; output_index: number }) => ({
            txHash: ref.tx_hash,
            outputIndex: ref.output_index,
          })),
          poolUtxoRef: {
            txHash: pool_utxo_ref.tx_hash,
            outputIndex: pool_utxo_ref.output_index,
          },
        });

        res.status(200).json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ═══════════════════════════════════════════
  // POST /v1/solver/execute-order — Solver executes a pending order against pool
  // ═══════════════════════════════════════════
  router.post(
    '/solver/execute-order',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          solver_address,
          order_utxo_ref,
          pool_utxo_ref,
        } = req.body;

        if (!solver_address || !order_utxo_ref || !pool_utxo_ref) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'solver_address, order_utxo_ref, pool_utxo_ref are required',
          });
          return;
        }

        const result = await txBuilder.buildExecuteOrderTx({
          solverAddress: solver_address,
          orderUtxoRef: {
            txHash: order_utxo_ref.tx_hash,
            outputIndex: order_utxo_ref.output_index,
          },
          poolUtxoRef: {
            txHash: pool_utxo_ref.tx_hash,
            outputIndex: pool_utxo_ref.output_index,
          },
        });

        res.status(200).json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ═══════════════════════════════════════════
  // POST /v1/admin/settings/build-deploy — Deploy initial settings UTxO
  // ═══════════════════════════════════════════
  router.post(
    '/admin/settings/build-deploy',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          admin_address,
          protocol_fee_bps,
          min_pool_liquidity,
          min_intent_size,
          solver_bond,
          fee_collector_address,
        } = req.body;

        if (!admin_address) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'admin_address is required',
          });
          return;
        }

        const result = await txBuilder.buildDeploySettingsTx({
          adminAddress: admin_address,
          protocolFeeBps: protocol_fee_bps,
          minPoolLiquidity: min_pool_liquidity ? BigInt(min_pool_liquidity) : undefined,
          minIntentSize: min_intent_size ? BigInt(min_intent_size) : undefined,
          solverBond: solver_bond ? BigInt(solver_bond) : undefined,
          feeCollectorAddress: fee_collector_address,
        });

        res.status(200).json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
