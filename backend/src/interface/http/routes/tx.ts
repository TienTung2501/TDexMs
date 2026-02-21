/**
 * Transaction Routes
 * Submit signed transactions and query TX status.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { writeLimiter } from '../middleware/rate-limiter.js';
import type { BlockfrostClient } from '../../../infrastructure/cardano/BlockfrostClient.js';
import type { IIntentRepository } from '../../../domain/ports/IIntentRepository.js';

export function createTxRouter(
  blockfrost: BlockfrostClient,
  intentRepo: IIntentRepository,
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
   * Frontend calls after TX is confirmed on-chain, to update intent status.
   * Body: { txHash: string, intentId?: string, action: 'create' | 'cancel' }
   */
  router.post(
    '/tx/confirm',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { txHash, intentId, action } = req.body as {
          txHash?: string;
          intentId?: string;
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
        if (intentId) {
          const newStatus = action === 'cancel' ? 'CANCELLED' : 'ACTIVE';
          await intentRepo.updateStatus(intentId, newStatus);
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
