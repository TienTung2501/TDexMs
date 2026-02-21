/**
 * Express Application Factory
 * Creates and configures the Express app with all middleware and routes.
 * Stack: Blockfrost (replaces Ogmios+Kupo)
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../config/env.js';
import { errorHandler, apiLimiter, requestLogger } from '../http/middleware/index.js';
import { createHealthRouter } from '../http/routes/health.js';
import { createQuoteRouter } from '../http/routes/quote.js';
import { createIntentRouter } from '../http/routes/intents.js';
import { createPoolRouter } from '../http/routes/pools.js';
import { createAnalyticsRouter } from '../http/routes/analytics.js';
import { createChartRouter } from '../http/routes/chart.js';
import { createTxRouter } from '../http/routes/tx.js';
import { createOrderRouter } from '../http/routes/orders.js';
import { createPortfolioRouter } from '../http/routes/portfolio.js';
import { createAdminRouter } from '../http/routes/admin.js';
import type { GetQuote } from '../../application/use-cases/GetQuote.js';
import type { CreateIntent } from '../../application/use-cases/CreateIntent.js';
import type { CancelIntent } from '../../application/use-cases/CancelIntent.js';
import type { GetPoolInfo } from '../../application/use-cases/GetPoolInfo.js';
import type { CreatePool } from '../../application/use-cases/CreatePool.js';
import type { DepositLiquidity } from '../../application/use-cases/DepositLiquidity.js';
import type { WithdrawLiquidity } from '../../application/use-cases/WithdrawLiquidity.js';
import type { CreateOrder } from '../../application/use-cases/CreateOrder.js';
import type { CancelOrder } from '../../application/use-cases/CancelOrder.js';
import type { ListOrders } from '../../application/use-cases/ListOrders.js';
import type { GetPortfolio } from '../../application/use-cases/GetPortfolio.js';
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder } from '../../domain/ports/index.js';
import type { BlockfrostClient } from '../../infrastructure/cardano/BlockfrostClient.js';
import type { CandlestickService } from '../../application/services/CandlestickService.js';
import type { CacheService } from '../../infrastructure/cache/CacheService.js';

export interface AppDependencies {
  getQuote: GetQuote;
  createIntent: CreateIntent;
  cancelIntent: CancelIntent;
  getPoolInfo: GetPoolInfo;
  createPool: CreatePool;
  depositLiquidity: DepositLiquidity;
  withdrawLiquidity: WithdrawLiquidity;
  createOrder: CreateOrder;
  cancelOrder: CancelOrder;
  listOrders: ListOrders;
  getPortfolio: GetPortfolio;
  intentRepo: IIntentRepository;
  orderRepo: IOrderRepository;
  poolRepo: IPoolRepository;
  txBuilder: ITxBuilder;
  blockfrost: BlockfrostClient;
  candlestickService: CandlestickService;
  cache: CacheService | null;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  // ── Security ──
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  );

  // ── Body parsing ──
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Logging (skip in production for memory savings) ──
  if (env.NODE_ENV !== 'production' || env.LOG_LEVEL === 'debug') {
    app.use(requestLogger);
  }

  // ── Rate limiting ──
  app.use('/v1', apiLimiter);

  // ── Routes ──
  const v1 = express.Router();

  v1.use(createHealthRouter(deps.blockfrost, deps.cache));
  v1.use(createQuoteRouter(deps.getQuote));
  v1.use(createIntentRouter(deps.createIntent, deps.cancelIntent, deps.intentRepo));
  v1.use(createPoolRouter(deps.getPoolInfo, deps.createPool, deps.depositLiquidity, deps.withdrawLiquidity));
  v1.use(createAnalyticsRouter());
  v1.use(createChartRouter(deps.candlestickService));
  v1.use(createTxRouter(deps.blockfrost, deps.intentRepo));
  v1.use(createOrderRouter(deps.createOrder, deps.cancelOrder, deps.listOrders, deps.orderRepo));
  v1.use(createPortfolioRouter(deps.getPortfolio, deps.intentRepo, deps.orderRepo, deps.poolRepo, deps.txBuilder));
  v1.use(createAdminRouter({
    poolRepo: deps.poolRepo,
    intentRepo: deps.intentRepo,
    orderRepo: deps.orderRepo,
    candlestickService: deps.candlestickService,
    txBuilder: deps.txBuilder,
  }));

  app.use('/v1', v1);

  // ── 404 handler ──
  app.use((_req, res) => {
    res.status(404).json({
      status: 'error',
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    });
  });

  // ── Error handler ──
  app.use(errorHandler);

  return app;
}
