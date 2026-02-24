/**
 * Transaction Routes
 * Submit signed transactions and query TX status.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { writeLimiter } from '../middleware/rate-limiter.js';
import type { BlockfrostClient } from '../../../infrastructure/cardano/BlockfrostClient.js';
import type { IIntentRepository } from '../../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../../domain/ports/IPoolRepository.js';

export function createTxRouter(
  blockfrost: BlockfrostClient,
  intentRepo: IIntentRepository,
  poolRepo?: IPoolRepository,
  orderRepo?: IOrderRepository,
): Router {
  const router = Router();

  /**
   * POST /v1/tx/submit
   * Accepts a signed transaction CBOR hex string and submits it to the Cardano network.
   * Body: { signedTx: string }
   * Returns: { txHash, accepted, error? }
   */
  router.post(
    '/tx/submit',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { signedTx } = req.body as { signedTx?: string };

        if (!signedTx || typeof signedTx !== 'string') {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'signedTx (CBOR hex string) is required',
          });
          return;
        }

        const result = await blockfrost.submitTx(signedTx);

        if (result.accepted) {
          res.status(200).json({
            txHash: result.txHash,
            status: 'accepted',
          });
        } else {
          res.status(400).json({
            txHash: '',
            status: 'rejected',
            error: result.error,
          });
        }
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /v1/tx/confirm
   * Frontend calls after TX is confirmed on-chain, to update intent/order status.
   * Body: { txHash: string, intentId?: string, orderId?: string, action: string }
   */
  router.post(
    '/tx/confirm',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { txHash, intentId, orderId, poolId, action } = req.body as {
          txHash?: string;
          intentId?: string;
          orderId?: string;
          poolId?: string;
          action?: string;
        };

        if (!txHash) {
          res.status(400).json({
            status: 'error',
            code: 'INVALID_REQUEST',
            message: 'txHash is required',
          });
          return;
        }

        // If an intentId was provided, update its status
        // GUARD: Only promote to ACTIVE from CREATED/PENDING states.
        // Do NOT overwrite FILLED, PARTIALLY_FILLED, FILLING, etc.
        if (intentId) {
          const isCancel = action === 'cancel' || action === 'cancel_intent';
          if (isCancel) {
            await intentRepo.updateStatus(intentId, 'CANCELLED');
          } else {
            const current = await intentRepo.findById(intentId);
            if (current && ['CREATED', 'PENDING'].includes(current.status)) {
              await intentRepo.updateStatus(intentId, 'ACTIVE');
            }
          }
        }

        // If an orderId was provided, update its status
        // GUARD: Only promote to ACTIVE from CREATED/PENDING states.
        if (orderId && orderRepo) {
          const isCancel = action === 'cancel' || action === 'cancel_order';
          if (isCancel) {
            await orderRepo.updateStatus(orderId, 'CANCELLED');
          } else {
            const current = await orderRepo.findById(orderId);
            if (current && ['CREATED', 'PENDING'].includes(current.status)) {
              await orderRepo.updateStatus(orderId, 'ACTIVE');
            }
          }
        }

        // If a poolId was provided with burn action, mark pool INACTIVE
        if (poolId && action === 'burn_pool' && poolRepo) {
          await poolRepo.updateState(poolId, 'INACTIVE');
        }

        res.json({ status: 'ok', txHash });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /v1/tx/:txHash/status
   * Check if a transaction is confirmed on-chain.
   */
  router.get(
    '/tx/:txHash/status',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { txHash } = req.params;
        const confirmed = await blockfrost.awaitTx(txHash as string, 5_000);

        res.json({
          txHash,
          status: confirmed ? 'confirmed' : 'pending',
          confirmations: confirmed ? 1 : 0,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
