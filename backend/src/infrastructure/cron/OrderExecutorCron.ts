/**
 * Order Executor Cron — Executes ALL order types (DCA, Limit, StopLoss)
 *
 * Periodically scans for executable orders:
 * - DCA: interval-based execution (amountPerInterval per interval)
 * - Limit: executes when pool price meets or exceeds target price
 * - StopLoss: executes when pool price drops to or below stop price
 *
 * CRITICAL RULE: DB state is ONLY updated after on-chain TX confirmation.
 *
 * Flow per tick:
 * 1. Query DB for orders with status ACTIVE or PARTIALLY_FILLED (all types)
 * 2. Filter: DCA must be interval-ripe, Limit/StopLoss must meet price condition
 * 3. For each qualifying order, resolve the matching pool UTxO reference
 * 4. Build ExecuteOrderTx via TxBuilder
 * 5. Sign with keeper wallet and submit
 * 6. Await on-chain confirmation (lucid.awaitTx)
 * 7. ONLY THEN: call order.recordExecution() and persist to DB
 */
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
} from '@lucid-evolution/lucid';
import { getLogger } from '../../config/logger.js';
import { TxSubmitter } from '../../solver/TxSubmitter.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder } from '../../domain/ports/ITxBuilder.js';
import type { Order } from '../../domain/entities/Order.js';
import type { Pool } from '../../domain/entities/Pool.js';
import { getEventBus } from '../../domain/events/index.js';

export class OrderExecutorCron {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lucidPromise: Promise<LucidEvolution> | null = null;
  private keeperAddress: string | null = null;

  /**
   * @param orderRepo           Order repository
   * @param poolRepo            Pool repository (for UTxO lookup)
   * @param txBuilder           Transaction builder
   * @param solverSeedPhrase    Keeper wallet seed phrase (same as solver/reclaim keeper)
   * @param blockfrostUrl       Blockfrost API URL
   * @param blockfrostProjectId Blockfrost project ID
   * @param network             Cardano network
   * @param intervalMs          How often to check for ripe DCA orders (default: 60s)
   * @param batchLimit          Maximum DCA orders to process per tick (default: 5)
   */
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly poolRepo: IPoolRepository,
    private readonly txBuilder: ITxBuilder,
    private readonly solverSeedPhrase: string,
    private readonly blockfrostUrl: string,
    private readonly blockfrostProjectId: string,
    private readonly network: 'Preprod' | 'Preview' | 'Mainnet' = 'Preprod',
    private readonly intervalMs: number = 60_000,
    private readonly batchLimit: number = 5,
  ) {
    this.logger = getLogger().child({ service: 'order-executor' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info(
      { intervalMs: this.intervalMs, batchLimit: this.batchLimit },
      'Order executor cron started',
    );

    // Run immediately, then on interval
    this.tick().catch((err) =>
      this.logger.error({ err }, 'Order executor tick failed'),
    );

    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error({ err }, 'Order executor tick failed'),
      );
    }, this.intervalMs);

    // Allow Node.js to exit cleanly even if cron is still scheduled
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.info('Order executor cron stopped');
  }

  // ─────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────

  /** Lazy-initialise the Lucid instance and cache the keeper address */
  private async getKeeperLucid(): Promise<{ lucid: LucidEvolution; address: string }> {
    if (!this.solverSeedPhrase) {
      throw new Error('SOLVER_SEED_PHRASE not configured — order executor cannot sign TXs');
    }

    if (!this.lucidPromise) {
      this.lucidPromise = Lucid(
        new Blockfrost(this.blockfrostUrl, this.blockfrostProjectId),
        this.network,
      );
    }

    const lucid = await this.lucidPromise;

    if (!this.keeperAddress) {
      lucid.selectWallet.fromSeed(this.solverSeedPhrase);
      this.keeperAddress = await lucid.wallet().address();
      // Register with TxSubmitter singleton so all three services (SolverEngine,
      // OrderExecutorCron, ReclaimKeeperCron) share the same serial TX queue.
      TxSubmitter.getInstance().setLucid(lucid);
      this.logger.info(
        { keeperAddress: this.keeperAddress },
        'Order executor keeper wallet initialised',
      );
    }

    return { lucid, address: this.keeperAddress };
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    // Query ALL order types (DCA, Limit, StopLoss) that are ACTIVE or PARTIALLY_FILLED
    const [activePage, partialPage] = await Promise.all([
      this.orderRepo.findMany({ status: 'ACTIVE',           limit: this.batchLimit * 3 }),
      this.orderRepo.findMany({ status: 'PARTIALLY_FILLED', limit: this.batchLimit * 3 }),
    ]);

    const allOrders = [...activePage.items, ...partialPage.items]
      // Deduplicate (an order could theoretically appear in both pages during a race)
      .filter((o, idx, arr) => arr.findIndex((x) => x.id === o.id) === idx)
      // Skip expired orders (ReclaimKeeper handles those)
      .filter((o) => !o.isExpired(now));

    // Separate by type so we can apply type-specific readiness checks
    const dcaRipeCandidates = allOrders
      .filter((o) => o.type === 'DCA' && o.isDcaIntervalRipe(now));

    // DCA orders with a price cap need pool price checking before execution
    const dcaCandidates: Order[] = [];
    for (const order of dcaRipeCandidates) {
      const props = order.toProps();
      if (!props.priceNumerator || !props.priceDenominator) {
        // No price cap — always execute
        dcaCandidates.push(order);
        continue;
      }
      try {
        const pool = await this.resolvePool(order);
        if (!pool) { dcaCandidates.push(order); continue; }
        const isInputA = this.isOrderInputA(props, pool);
        const reserveIn = isInputA ? pool.reserveA : pool.reserveB;
        const reserveOut = isInputA ? pool.reserveB : pool.reserveA;
        if (reserveIn === 0n) continue;
        if (order.meetsDcaPriceCap(reserveOut, reserveIn)) {
          dcaCandidates.push(order);
        } else {
          this.logger.debug(
            { orderId: order.id, type: 'DCA' },
            'DCA order price cap not met — skipping',
          );
        }
      } catch {
        dcaCandidates.push(order); // on error, still include
      }
    }

    // Limit and StopLoss need pool price checking — resolve pools first
    const limitStopCandidates = allOrders.filter(
      (o) => o.type === 'LIMIT' || o.type === 'STOP_LOSS',
    );

    // Check pool prices for Limit/StopLoss orders
    const priceReadyOrders: Order[] = [];
    for (const order of limitStopCandidates) {
      try {
        const pool = await this.resolvePool(order);
        if (!pool) continue;

        // Calculate current market price for the order's swap direction
        const props = order.toProps();
        const isInputA = this.isOrderInputA(props, pool);
        // Market price = output / input (how many output tokens per 1 input token)
        // Using pool reserves as a proxy: reserveOut / reserveIn
        const reserveIn = isInputA ? pool.reserveA : pool.reserveB;
        const reserveOut = isInputA ? pool.reserveB : pool.reserveA;

        if (reserveIn === 0n) continue;

        if (order.type === 'LIMIT' && order.meetsLimitPrice(reserveOut, reserveIn)) {
          priceReadyOrders.push(order);
        } else if (order.type === 'STOP_LOSS' && order.triggersStopLoss(reserveOut, reserveIn)) {
          priceReadyOrders.push(order);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(
          { orderId: order.id, error: msg },
          'Failed to check price for order — skipping',
        );
      }
    }

    const candidates = [...dcaCandidates, ...priceReadyOrders]
      .slice(0, this.batchLimit);

    if (candidates.length === 0) {
      this.logger.debug('No executable orders found');
      return;
    }

    this.logger.info(
      {
        count: candidates.length,
        dca: dcaCandidates.length,
        limitStop: priceReadyOrders.length,
      },
      'Processing executable orders',
    );

    if (!this.solverSeedPhrase) {
      this.logger.warn('SOLVER_SEED_PHRASE not set — skipping order execution');
      return;
    }

    for (const order of candidates) {
      try {
        await this.executeOrder(order);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { orderId: order.id, type: order.type, error: msg },
          'Order execution failed — will retry next tick',
        );
      }
    }
  }

  /** Determine if order's input asset matches pool's asset_a */
  private isOrderInputA(
    props: ReturnType<Order['toProps']>,
    pool: Pool,
  ): boolean {
    const poolProps = pool.toProps();
    return props.inputPolicyId === poolProps.assetAPolicyId &&
      props.inputAssetName === poolProps.assetAAssetName;
  }

  /**
   * Resolve the best pool for an order's asset pair.
   * Tries direct pair first, then reverse pair.
   */
  private async resolvePool(order: Order) {
    const props = order.toProps();
    const inputAssetId  = props.inputPolicyId
      ? `${props.inputPolicyId}.${props.inputAssetName}`
      : 'lovelace';
    const outputAssetId = props.outputPolicyId
      ? `${props.outputPolicyId}.${props.outputAssetName}`
      : 'lovelace';

    return (
      await this.poolRepo.findByPair(inputAssetId, outputAssetId) ??
      await this.poolRepo.findByPair(outputAssetId, inputAssetId)
    );
  }

  /**
   * Execute a single order:
   * 1. Resolve pool UTxO
   * 2. Build TX
   * 3. Submit
   * 4. Await confirmation
   * 5. Update DB
   */
  private async executeOrder(order: Order): Promise<void> {
    const props = order.toProps();

    if (!props.escrowTxHash || props.escrowOutputIndex === undefined) {
      this.logger.warn(
        { orderId: order.id },
        'Order has no on-chain escrow UTxO — skipping',
      );
      return;
    }

    // Resolve the best pool for this asset pair
    const pool = await this.resolvePool(order);

    if (!pool) {
      const inputAssetId  = props.inputPolicyId
        ? `${props.inputPolicyId}.${props.inputAssetName}`
        : 'lovelace';
      const outputAssetId = props.outputPolicyId
        ? `${props.outputPolicyId}.${props.outputAssetName}`
        : 'lovelace';
      this.logger.warn(
        { orderId: order.id, type: order.type, inputAssetId, outputAssetId },
        'No active pool found for order asset pair — skipping',
      );
      return;
    }

    const { lucid, address: keeperAddress } = await this.getKeeperLucid();

    this.logger.info(
      {
        orderId: order.id,
        type: order.type,
        poolId: pool.id,
        interval: (props.executedIntervals ?? 0) + 1,
        remainingBudget: props.remainingBudget?.toString(),
      },
      'Building order execution TX',
    );

    // Build the execute-order TX
    const { unsignedTx } = await this.txBuilder.buildExecuteOrderTx({
      solverAddress: keeperAddress,
      orderUtxoRef: {
        txHash: props.escrowTxHash,
        outputIndex: props.escrowOutputIndex,
      },
      poolUtxoRef: {
        txHash: pool.txHash,
        outputIndex: pool.outputIndex,
      },
    });

    // Sign and submit via TxSubmitter queue — prevents UTxO contention with other bots
    let submittedHash: string;
    try {
      submittedHash = await TxSubmitter.getInstance().submit({
        label: `order-execute id=${order.id} type=${order.type}`,
        signAndSubmit: async () => {
          const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
          return signed.submit();
        },
      });
    } catch (submitErr) {
      const submitMsg = submitErr instanceof Error ? submitErr.message : String(submitErr);
      if (submitMsg.includes('not confirmed within')) {
        this.logger.warn(
          { orderId: order.id, type: order.type },
          'Order execution TX not confirmed within timeout — DB not updated; will retry next tick',
        );
        return;
      }
      throw submitErr;
    }

    this.logger.info(
      { orderId: order.id, type: order.type, txHash: submittedHash },
      'Order execution TX confirmed — updating DB',
    );

    // Post-confirmation DB update via domain entity
    order.recordExecution();
    await this.orderRepo.save(order);

    const updatedProps = order.toProps();
    getEventBus().emit('order.statusChanged', {
      orderId: order.id,
      oldStatus: 'ACTIVE',
      newStatus: updatedProps.status as any,
      timestamp: Date.now(),
    });
    this.logger.info(
      {
        orderId: order.id,
        status: updatedProps.status,
        executedIntervals: updatedProps.executedIntervals,
        remainingBudget: updatedProps.remainingBudget?.toString(),
      },
      'Order DB updated after confirmed execution',
    );
  }
}
