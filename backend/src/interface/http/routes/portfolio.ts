/**
 * Portfolio Controller
 * Aggregated wallet data: intents, orders, LP positions
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { GetPortfolio } from '../../../application/use-cases/GetPortfolio.js';
import type { IIntentRepository } from '../../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../../domain/ports/IOrderRepository.js';

export function createPortfolioRouter(
  getPortfolio: GetPortfolio,
  intentRepo: IIntentRepository,
  orderRepo: IOrderRepository,
): Router {
  const router = Router();

  /** GET /v1/portfolio/:address — Wallet portfolio summary */
  router.get(
    '/portfolio/:address',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await getPortfolio.execute(req.params.address as string);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/portfolio/:address/transactions — Recent transactions for wallet */
  router.get(
    '/portfolio/:address/transactions',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const address = req.params.address as string;
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        // Fetch recent intents and orders
        const [intents, orders] = await Promise.all([
          intentRepo.findMany({ address, limit }),
          orderRepo.findMany({ creator: address, limit }),
        ]);

        // Merge and sort by date
        const transactions = [
          ...intents.items.map((i) => ({
            id: i.id,
            type: 'intent' as const,
            status: i.status,
            inputAsset: `${i.inputPolicyId}.${i.inputAssetName}`,
            inputAmount: i.inputAmount.toString(),
            outputAsset: `${i.outputPolicyId}.${i.outputAssetName}`,
            createdAt: i.createdAt.toISOString(),
          })),
          ...orders.items.map((o) => {
            const p = o.toProps();
            return {
              id: p.id,
              type: `order:${p.type}` as const,
              status: p.status,
              inputAsset: `${p.inputPolicyId}.${p.inputAssetName}`,
              inputAmount: (p.inputAmount ?? p.totalBudget ?? 0n).toString(),
              outputAsset: `${p.outputPolicyId}.${p.outputAssetName}`,
              createdAt: p.createdAt.toISOString(),
            };
          }),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limit);

        res.json({
          address,
          items: transactions,
          total: intents.total + orders.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
