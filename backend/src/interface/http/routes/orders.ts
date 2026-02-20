/**
 * Orders Controller
 * CRUD operations for advanced orders (Limit, DCA, StopLoss)
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validation.js';
import { writeLimiter } from '../middleware/rate-limiter.js';
import { orderCreateSchema, orderListSchema } from '../../../shared/index.js';
import type { CreateOrder } from '../../../application/use-cases/CreateOrder.js';
import type { CancelOrder } from '../../../application/use-cases/CancelOrder.js';
import type { ListOrders } from '../../../application/use-cases/ListOrders.js';
import type { IOrderRepository } from '../../../domain/ports/IOrderRepository.js';

export function createOrderRouter(
  createOrder: CreateOrder,
  cancelOrder: CancelOrder,
  listOrders: ListOrders,
  orderRepo: IOrderRepository,
): Router {
  const router = Router();

  /** POST /v1/orders — Create order */
  router.post(
    '/orders',
    writeLimiter,
    validate(orderCreateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await createOrder.execute(req.body);
        res.status(201).json({
          orderId: result.orderId,
          unsignedTx: result.unsignedTx ?? null,
          txHash: result.txHash ?? null,
          estimatedFee: result.estimatedFee,
          status: 'CREATED',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/orders — List orders */
  router.get(
    '/orders',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = orderListSchema.parse(req.query);
        const result = await listOrders.execute(parsed);
        res.json({
          items: result.items.map((o) => {
            const p = o.toProps();
            return {
              orderId: p.id,
              type: p.type,
              status: p.status,
              creator: p.creator,
              inputAsset: `${p.inputPolicyId}.${p.inputAssetName}`,
              outputAsset: `${p.outputPolicyId}.${p.outputAssetName}`,
              inputAmount: p.inputAmount?.toString() ?? null,
              priceNumerator: p.priceNumerator?.toString() ?? null,
              priceDenominator: p.priceDenominator?.toString() ?? null,
              totalBudget: p.totalBudget?.toString() ?? null,
              amountPerInterval: p.amountPerInterval?.toString() ?? null,
              intervalSlots: p.intervalSlots ?? null,
              remainingBudget: p.remainingBudget?.toString() ?? null,
              executedIntervals: p.executedIntervals ?? 0,
              deadline: p.deadline,
              escrowTxHash: p.escrowTxHash ?? null,
              createdAt: p.createdAt.toISOString(),
              updatedAt: p.updatedAt.toISOString(),
            };
          }),
          cursor: result.cursor,
          hasMore: result.hasMore,
          total: result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/orders/:orderId — Get order detail */
  router.get(
    '/orders/:orderId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const order = await orderRepo.findById(req.params.orderId as string);
        if (!order) {
          res.status(404).json({
            status: 'error',
            code: 'ORDER_NOT_FOUND',
            message: `Order ${req.params.orderId} not found`,
          });
          return;
        }

        const p = order.toProps();
        res.json({
          orderId: p.id,
          type: p.type,
          status: p.status,
          creator: p.creator,
          inputAsset: `${p.inputPolicyId}.${p.inputAssetName}`,
          outputAsset: `${p.outputPolicyId}.${p.outputAssetName}`,
          inputAmount: p.inputAmount?.toString() ?? null,
          priceNumerator: p.priceNumerator?.toString() ?? null,
          priceDenominator: p.priceDenominator?.toString() ?? null,
          totalBudget: p.totalBudget?.toString() ?? null,
          amountPerInterval: p.amountPerInterval?.toString() ?? null,
          intervalSlots: p.intervalSlots ?? null,
          remainingBudget: p.remainingBudget?.toString() ?? null,
          executedIntervals: p.executedIntervals ?? 0,
          deadline: p.deadline,
          escrowTxHash: p.escrowTxHash ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** DELETE /v1/orders/:orderId — Cancel order */
  router.delete(
    '/orders/:orderId',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { senderAddress } = req.body as { senderAddress?: string };
        const result = await cancelOrder.execute({
          orderId: req.params.orderId as string,
          senderAddress: senderAddress ?? '',
        });

        res.json({
          orderId: result.orderId,
          unsignedTx: result.unsignedTx ?? null,
          status: result.status,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
