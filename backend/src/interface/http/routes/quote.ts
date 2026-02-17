/**
 * Quote Controller
 * GET /v1/quote — Calculate swap quotes with routing
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validation.js';
import { quoteSchema } from '@solvernet/shared';
import type { GetQuote } from '../../../application/use-cases/GetQuote.js';

export function createQuoteRouter(getQuote: GetQuote): Router {
  const router = Router();

  router.get(
    '/quote',
    validate(quoteSchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { inputAsset, outputAsset, inputAmount, outputAmount, slippage } = req.query as {
          inputAsset: string;
          outputAsset: string;
          inputAmount?: string;
          outputAmount?: string;
          slippage?: string;
        };

        const quote = await getQuote.execute({
          inputAsset,
          outputAsset,
          inputAmount: inputAmount ?? undefined,
          outputAmount: outputAmount ?? undefined,
          slippage: slippage ? Number(slippage) : 50,
        });

        res.json({
          inputAsset: quote.inputAsset,
          outputAsset: quote.outputAsset,
          inputAmount: quote.inputAmount,
          outputAmount: quote.outputAmount,
          minOutput: quote.minOutput,
          priceImpact: quote.priceImpact,
          route: quote.route.map((hop) => ({
            poolId: hop.poolId,
            type: hop.type,
            inputAsset: hop.inputAsset,
            outputAsset: hop.outputAsset,
            inputAmount: hop.inputAmount,
            outputAmount: hop.outputAmount,
            fee: hop.fee,
          })),
          estimatedFees: {
            protocolFee: quote.estimatedFees.protocolFee,
            networkFee: quote.estimatedFees.networkFee,
            solverFee: quote.estimatedFees.solverFee,
          },
          expiresAt: quote.expiresAt,
          quoteId: quote.quoteId,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
