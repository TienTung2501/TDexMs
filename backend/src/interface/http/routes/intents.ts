/**
 * Intent Controller
 * CRUD operations for swap intents
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validation.js';
import { writeLimiter } from '../middleware/rate-limiter.js';
import { intentSchema, intentListSchema } from '@solvernet/shared';
import type { CreateIntent } from '../../../application/use-cases/CreateIntent.js';
import type { CancelIntent } from '../../../application/use-cases/CancelIntent.js';
import type { IIntentRepository } from '../../../domain/ports/IIntentRepository.js';

export function createIntentRouter(
  createIntent: CreateIntent,
  cancelIntent: CancelIntent,
  intentRepo: IIntentRepository,
): Router {
  const router = Router();

  /** POST /v1/intents — Create intent */
  router.post(
    '/intents',
    writeLimiter,
    validate(intentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await createIntent.execute(req.body);
        res.status(201).json({
          intentId: result.intentId,
          unsignedTx: result.unsignedTx ?? null,
          txHash: result.txHash ?? null,
          status: 'CREATED',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/intents/:intentId — Get intent detail */
  router.get(
    '/intents/:intentId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const intent = await intentRepo.findById(req.params.intentId as string);
        if (!intent) {
          res.status(404).json({
            status: 'error',
            code: 'INTENT_NOT_FOUND',
            message: `Intent ${req.params.intentId} not found`,
          });
          return;
        }

        res.json({
          intentId: intent.id,
          status: intent.status,
          creator: intent.creator,
          inputAsset: `${intent.inputPolicyId}.${intent.inputAssetName}`,
          inputAmount: intent.inputAmount.toString(),
          outputAsset: `${intent.outputPolicyId}.${intent.outputAssetName}`,
          minOutput: intent.minOutput.toString(),
          actualOutput: intent.actualOutput?.toString() ?? null,
          deadline: Number(intent.deadline),
          partialFill: intent.partialFill,
          escrowTxHash: intent.escrowTxHash ?? null,
          settlementTxHash: intent.settlementTxHash ?? null,
          solverAddress: intent.solverAddress ?? null,
          createdAt: intent.createdAt.toISOString(),
          updatedAt: intent.updatedAt.toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** DELETE /v1/intents/:intentId — Cancel intent */
  router.delete(
    '/intents/:intentId',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { senderAddress } = req.body as { senderAddress?: string };
        const result = await cancelIntent.execute({
          intentId: req.params.intentId as string,
          senderAddress: senderAddress ?? '',
        });

        res.json({
          intentId: result.intentId,
          unsignedTx: result.unsignedTx ?? null,
          status: 'CANCELLING',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/intents — List intents */
  router.get(
    '/intents',
    validate(intentListSchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { address, status, cursor, limit } = req.query as {
          address: string;
          status?: string;
          cursor?: string;
          limit?: string;
        };

        const result = await intentRepo.findMany({
          address,
          status: status as 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | undefined,
          cursor: cursor ?? undefined,
          limit: limit ? Number(limit) : 20,
        });

        res.json({
          data: result.items.map((i: import('../../../domain/entities/Intent.js').Intent) => ({
            intentId: i.id,
            status: i.status,
            creator: i.creator,
            inputAsset: `${i.inputPolicyId}.${i.inputAssetName}`,
            inputAmount: i.inputAmount.toString(),
            outputAsset: `${i.outputPolicyId}.${i.outputAssetName}`,
            minOutput: i.minOutput.toString(),
            deadline: Number(i.deadline),
            createdAt: i.createdAt.toISOString(),
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

  return router;
}
