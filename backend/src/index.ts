/**
 * SolverNet Backend — Entry Point & Composition Root
 * Wires together all dependencies and starts the server.
 *
 * Stack: Blockfrost (Cardano Preprod) + Supabase (PostgreSQL) + Render (Node.js)
 */
import { createServer } from 'http';
import { env } from './config/env.js';
import { getLogger } from './config/logger.js';

// Infrastructure
import { getPrisma, disconnectPrisma } from './infrastructure/database/index.js';
import { IntentRepository } from './infrastructure/database/IntentRepository.js';
import { PoolRepository } from './infrastructure/database/PoolRepository.js';
import { OrderRepository } from './infrastructure/database/OrderRepository.js';
import { BlockfrostClient } from './infrastructure/cardano/BlockfrostClient.js';
import { ChainProvider } from './infrastructure/cardano/ChainProvider.js';
import { TxBuilder } from './infrastructure/cardano/TxBuilder.js';
import { ChainSync } from './infrastructure/cardano/ChainSync.js';
import { PriceAggregationCron } from './infrastructure/cron/PriceAggregationCron.js';
import { ReclaimKeeperCron } from './infrastructure/cron/ReclaimKeeperCron.js';
import { OrderExecutorCron } from './infrastructure/cron/OrderExecutorCron.js';
import { PoolSnapshotCron } from './infrastructure/cron/PoolSnapshotCron.js';
import { CacheService } from './infrastructure/cache/CacheService.js';
import { FaucetBot } from './infrastructure/faucet/FaucetBot.js';

// Application
import { GetQuote } from './application/use-cases/GetQuote.js';
import { CreateIntent } from './application/use-cases/CreateIntent.js';
import { CancelIntent } from './application/use-cases/CancelIntent.js';
import { GetPoolInfo } from './application/use-cases/GetPoolInfo.js';
import { CreatePool } from './application/use-cases/CreatePool.js';
import { DepositLiquidity } from './application/use-cases/DepositLiquidity.js';
import { WithdrawLiquidity } from './application/use-cases/WithdrawLiquidity.js';
import { CreateOrder } from './application/use-cases/CreateOrder.js';
import { CancelOrder } from './application/use-cases/CancelOrder.js';
import { ListOrders } from './application/use-cases/ListOrders.js';
import { GetPortfolio } from './application/use-cases/GetPortfolio.js';
import { CandlestickService } from './application/services/CandlestickService.js';

// New domain use-cases (Task 2 / R-14)
import { SettleIntentUseCase } from './application/use-cases/SettleIntentUseCase.js';
import { ExecuteOrderUseCase } from './application/use-cases/ExecuteOrderUseCase.js';
import { UpdateSettingsUseCase } from './application/use-cases/UpdateSettingsUseCase.js';

// Interface
import { createApp } from './interface/http/app.js';
import { WsServer } from './interface/ws/WsServer.js';

// Solver
import { SolverEngine } from './solver/SolverEngine.js';
import { IntentCollector } from './solver/IntentCollector.js';
import { RouteOptimizer } from './solver/RouteOptimizer.js';
import { BatchBuilder } from './solver/BatchBuilder.js';

const logger = getLogger();

async function main(): Promise<void> {
  logger.info(
    { env: env.NODE_ENV, port: env.PORT, network: env.CARDANO_NETWORK },
    'Starting SolverNet backend (Blockfrost + Supabase)',
  );

  // ──────────────────────────────────────────────
  // 1. Infrastructure Layer
  // ──────────────────────────────────────────────
  const prisma = getPrisma();

  // Blockfrost — single chain provider (replaces Ogmios + Kupo)
  const blockfrost = new BlockfrostClient(env.BLOCKFROST_URL, env.BLOCKFROST_PROJECT_ID);

  // Upstash Redis cache (optional — graceful degradation if not configured)
  const cache = (env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN)
    ? new CacheService(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN)
    : null;

  if (cache) {
    blockfrost.setCache(cache);
    const healthy = await cache.isHealthy();
    logger.info({ healthy }, 'Upstash Redis cache connected');
  } else {
    logger.warn('Upstash Redis not configured — running without cache');
  }

  // Verify Blockfrost connectivity (non-blocking)
  blockfrost.isHealthy().then((ok) => {
    if (ok) {
      logger.info('Blockfrost connection verified');
    } else {
      logger.warn('Blockfrost is unreachable — chain queries will fail');
    }
  }).catch((err) => {
    logger.warn({ err }, 'Blockfrost health check failed');
  });

  // Chain abstractions
  const chainProvider = new ChainProvider(blockfrost);

  // Derive admin VKH from ADMIN_ADDRESS (needed for parameterized validators)
  let adminVkh = '';
  if (env.ADMIN_ADDRESS) {
    try {
      // Dynamic import to avoid top-level dependency
      const { getAddressDetails } = await import('@lucid-evolution/lucid');
      const details = getAddressDetails(env.ADMIN_ADDRESS);
      adminVkh = details.paymentCredential?.hash || '';
      logger.info({ adminVkh: adminVkh.slice(0, 16) + '...' }, 'Derived admin VKH');
    } catch (e) {
      logger.warn('Could not derive admin VKH from ADMIN_ADDRESS');
    }
  }

  const txBuilder = new TxBuilder(
    env.CARDANO_NETWORK as 'preprod' | 'preview' | 'mainnet',
    env.BLOCKFROST_URL,
    env.BLOCKFROST_PROJECT_ID,
    adminVkh,
  );

  // Repositories
  const intentRepo = new IntentRepository(prisma);
  const poolRepo = new PoolRepository(prisma);
  const orderRepo = new OrderRepository(prisma);

  // ──────────────────────────────────────────────
  // 2. Application Layer — Use Cases + Services
  // ──────────────────────────────────────────────
  const getQuote = new GetQuote(poolRepo);
  const createIntent = new CreateIntent(intentRepo, txBuilder);
  const cancelIntent = new CancelIntent(intentRepo, txBuilder);
  const getPoolInfo = new GetPoolInfo(poolRepo);
  const createPool = new CreatePool(poolRepo, txBuilder);

  // Order use cases
  const createOrder = new CreateOrder(orderRepo, txBuilder);
  const cancelOrder = new CancelOrder(orderRepo, txBuilder);
  const listOrders = new ListOrders(orderRepo);
  const getPortfolio = new GetPortfolio(intentRepo, orderRepo, poolRepo, blockfrost);

  // Chart / OHLCV service
  const candlestickService = new CandlestickService(prisma, cache, env.CHART_MAX_CANDLES);

  // Task 2: Domain use-cases for settle / execute-order / settings
  const settleIntent = new SettleIntentUseCase(intentRepo, txBuilder);
  const executeOrder = new ExecuteOrderUseCase(orderRepo, txBuilder);
  const updateSettings = new UpdateSettingsUseCase(txBuilder);

  // ──────────────────────────────────────────────
  // 3. Interface Layer — HTTP + WebSocket
  // ──────────────────────────────────────────────
  const wsServer = new WsServer();

  // Task 4: inject WsServer into liquidity use-cases so pool updates are broadcast in real-time
  const depositLiquidity = new DepositLiquidity(poolRepo, txBuilder, wsServer);
  const withdrawLiquidity = new WithdrawLiquidity(poolRepo, txBuilder, wsServer);

  const app = createApp({
    getQuote,
    createIntent,
    cancelIntent,
    getPoolInfo,
    createPool,
    depositLiquidity,
    withdrawLiquidity,
    createOrder,
    cancelOrder,
    listOrders,
    getPortfolio,
    settleIntent,
    executeOrder,
    updateSettings,
    intentRepo,
    orderRepo,
    poolRepo,
    txBuilder,
    blockfrost,
    candlestickService,
    cache,
    prisma,
  });

  const httpServer = createServer(app);
  wsServer.attach(httpServer);

  // ──────────────────────────────────────────────
  // 4. Solver Engine
  // ──────────────────────────────────────────────
  // Use TxBuilder's resolved escrow address (computed from blueprint) instead of env var
  // to ensure consistency between TX building and intent collection.
  const resolvedEscrowAddr = txBuilder.getEscrowAddress();
  if (resolvedEscrowAddr !== env.ESCROW_SCRIPT_ADDRESS) {
    logger.warn(
      { envAddr: env.ESCROW_SCRIPT_ADDRESS, resolvedAddr: resolvedEscrowAddr },
      'ESCROW_SCRIPT_ADDRESS mismatch — using resolved address from blueprint',
    );
  }
  const intentCollector = new IntentCollector(blockfrost, resolvedEscrowAddr);
  const routeOptimizer = new RouteOptimizer(poolRepo);
  const batchBuilder = new BatchBuilder();

  const solverEngine = new SolverEngine(
    {
      batchWindowMs: env.SOLVER_BATCH_WINDOW_MS,
      maxRetries: env.SOLVER_MAX_RETRIES,
      minProfitLovelace: BigInt(env.SOLVER_MIN_PROFIT_LOVELACE),
      enabled: env.SOLVER_ENABLED,
      solverAddress: env.SOLVER_ADDRESS,
      solverSeedPhrase: env.SOLVER_SEED_PHRASE,
      blockfrostUrl: env.BLOCKFROST_URL,
      blockfrostProjectId: env.BLOCKFROST_PROJECT_ID,
      network: (env.CARDANO_NETWORK === 'mainnet' ? 'Mainnet' : 'Preprod') as 'Preprod' | 'Mainnet',
    },
    intentCollector,
    routeOptimizer,
    batchBuilder,
    blockfrost,
    intentRepo,
    wsServer,
    txBuilder,
    chainProvider,
    poolRepo,
    candlestickService,
  );

  // ──────────────────────────────────────────────
  // 5. Background Services
  // ──────────────────────────────────────────────

  // Chain sync — polls Blockfrost for pool state every 30s
  // B2 fix: pass pool validator address so ChainSync queries the correct Bech32 address
  const resolvedPoolAddr = txBuilder.getPoolAddress();
  if (resolvedPoolAddr !== env.POOL_SCRIPT_ADDRESS) {
    logger.warn(
      { envAddr: env.POOL_SCRIPT_ADDRESS, resolvedAddr: resolvedPoolAddr },
      'POOL_SCRIPT_ADDRESS mismatch — using resolved address from blueprint',
    );
  }
  const chainSync = new ChainSync(blockfrost, prisma, resolvedPoolAddr, 30_000);

  // Price aggregation cron — aggregates ticks → candles
  const priceCron = new PriceAggregationCron(
    candlestickService,
    env.CHART_SNAPSHOT_INTERVAL_MS,
  );

  // Reclaim keeper — marks expired intents/orders + on-chain reclaim
  const reclaimKeeper = new ReclaimKeeperCron(
    intentRepo,
    orderRepo,
    txBuilder,
    env.SOLVER_SEED_PHRASE,
    env.BLOCKFROST_URL,
    env.BLOCKFROST_PROJECT_ID,
    env.CARDANO_NETWORK === 'mainnet' ? 'Mainnet' : 'Preprod',
    60_000,
  );

  // DCA order executor — fires ripe DCA interval executions
  const orderExecutorCron = new OrderExecutorCron(
    orderRepo,
    poolRepo,
    txBuilder,
    env.SOLVER_SEED_PHRASE,
    env.BLOCKFROST_URL,
    env.BLOCKFROST_PROJECT_ID,
    env.CARDANO_NETWORK === 'mainnet' ? 'Mainnet' : 'Preprod',
    60_000,
  );

  // Pool snapshot cron — snapshots pool state → PoolHistory + ProtocolStats
  // B4/B6 fix: these tables were previously never populated
  const poolSnapshotCron = new PoolSnapshotCron(prisma, 3_600_000); // every hour

  // Testnet faucet bot — requests free test ADA every 24h
  // Only active on preprod/preview; silently skips on mainnet
  const faucetBot = new FaucetBot({
    targetAddress: env.FAUCET_TARGET_ADDRESS || env.SOLVER_ADDRESS,
    network: env.CARDANO_NETWORK,
    apiKey: env.FAUCET_API_KEY || undefined,
    intervalMs: env.FAUCET_INTERVAL_MS,
  });

  // ──────────────────────────────────────────────
  // 6. Start
  // ──────────────────────────────────────────────
  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, network: env.CARDANO_NETWORK },
      `SolverNet API running on http://localhost:${env.PORT}`,
    );
  });

  // Start background services (non-blocking)
  solverEngine.start().catch((err) => {
    logger.error({ err }, 'Solver engine crashed');
  });

  chainSync.start().catch((err) => {
    logger.error({ err }, 'Chain sync crashed');
  });

  priceCron.start();
  reclaimKeeper.start();
  orderExecutorCron.start();
  poolSnapshotCron.start();
  faucetBot.start();

  // ──────────────────────────────────────────────
  // 7. Graceful Shutdown
  // ──────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');

    solverEngine.stop();
    chainSync.stop();
    priceCron.stop();
    reclaimKeeper.stop();
    orderExecutorCron.stop();
    poolSnapshotCron.stop();
    faucetBot.stop();
    wsServer.close();

    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    await disconnectPrisma();

    logger.info('Cleanup complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
