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
import { getEventBus } from '../../../domain/events/index.js';

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
        const { txHash, intentId, orderId, poolId, action, newReserveA, newReserveB, newTotalLp } = req.body as {
          txHash?: string;
          intentId?: string;
          orderId?: string;
          poolId?: string;
          action?: string;
          newReserveA?: string;
          newReserveB?: string;
          newTotalLp?: string;
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
            // Guard: only mark CANCELLED if the intent is actually in CANCELLING state.
            // Prevents accidentally wiping an intent that was re-activated or already FILLED.
            const current = await intentRepo.findById(intentId);
            if (current && current.status === 'CANCELLING') {
              await intentRepo.updateStatus(intentId, 'CANCELLED');
              getEventBus().emit('intent.statusChanged', {
                intentId,
                oldStatus: 'CANCELLING',
                newStatus: 'CANCELLED',
                creator: current.creator,
                timestamp: Date.now(),
              });
            }
          } else {
            const current = await intentRepo.findById(intentId);
            if (current && ['CREATED', 'PENDING'].includes(current.status)) {
              const oldStatus = current.status;
              await intentRepo.updateStatus(intentId, 'ACTIVE');
              getEventBus().emit('intent.statusChanged', {
                intentId,
                oldStatus: oldStatus as 'CREATED' | 'PENDING',
                newStatus: 'ACTIVE',
                creator: current.creator,
                timestamp: Date.now(),
              });
            }
          }
        }

        if (orderId && orderRepo) {
          const isCancel = action === 'cancel' || action === 'cancel_order';
          if (isCancel) {
            const current = await orderRepo.findById(orderId);
            if (current && !['FILLED', 'EXPIRED'].includes(current.status)) {
              const oldStatus = current.status;
              await orderRepo.updateStatus(orderId, 'CANCELLED');
              getEventBus().emit('order.statusChanged', {
                orderId,
                oldStatus: oldStatus as any,
                newStatus: 'CANCELLED',
                timestamp: Date.now(),
              });
            }
          } else {
            const current = await orderRepo.findById(orderId);
            if (current && ['CREATED', 'PENDING'].includes(current.status)) {
              const oldStatus = current.status;
              await orderRepo.updateStatus(orderId, 'ACTIVE');
              getEventBus().emit('order.statusChanged', {
                orderId,
                oldStatus: oldStatus as any,
                newStatus: 'ACTIVE',
                timestamp: Date.now(),
              });
            }
          }
        }

        // If a poolId was provided with burn action, mark pool INACTIVE
        if (poolId && action === 'burn_pool' && poolRepo) {
          await poolRepo.updateState(poolId, 'INACTIVE');
        }

        // If a poolId was provided with create_pool action, promote CREATING → ACTIVE
        if (poolId && action === 'create_pool' && poolRepo) {
          await poolRepo.updateState(poolId, 'ACTIVE');
          getEventBus().emit('pool.updated', {
            poolId,
            action: 'created',
            newState: 'ACTIVE',
            lastTxHash: txHash,
            timestamp: Date.now(),
          });
        }

        // If a poolId was provided with deposit/withdraw, apply the deferred reserve update.
        // These were previously updated optimistically in DepositLiquidity/WithdrawLiquidity
        // use-cases, which corrupted reserves if the user rejected wallet signing.
        if (poolId && (action === 'deposit' || action === 'withdraw') && poolRepo && newReserveA && newReserveB && newTotalLp) {
          const pool = await poolRepo.findById(poolId);
          if (pool) {
            const rA = BigInt(newReserveA);
            const rB = BigInt(newReserveB);
            const rLp = BigInt(newTotalLp);
            await poolRepo.updateReserves(poolId, rA, rB, rLp, txHash, pool.outputIndex);
            const price = rB > 0n ? Number(rA) / Number(rB) : 0;
            await poolRepo.insertHistory({
              poolId,
              reserveA: rA,
              reserveB: rB,
              tvlAda: pool.tvlAda,
              volume: pool.volume24h,
              fees: pool.fees24h,
              price,
            });
            getEventBus().emit('pool.updated', {
              poolId,
              action: action as 'deposit' | 'withdraw',
              reserveA: rA.toString(),
              reserveB: rB.toString(),
              price: price.toString(),
              tvlAda: pool.tvlAda.toString(),
              lastTxHash: txHash,
              timestamp: Date.now(),
            });
          }
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
