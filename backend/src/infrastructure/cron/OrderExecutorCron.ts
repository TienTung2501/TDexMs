/**
 * Order Executor Cron — DCA (Dollar-Cost Averaging) Interval Bot
 *
 * Periodically scans for DCA orders whose next execution interval has elapsed,
 * builds and submits the execution TX via the keeper wallet, then awaits
 * on-chain confirmation before updating the database.
 *
 * CRITICAL RULE: DB state is ONLY updated after on-chain TX confirmation.
 *
 * Flow per tick:
 * 1. Query DB for DCA orders with status ACTIVE or PARTIALLY_FILLED
 * 2. Filter: type = 'DCA' AND nextIntervalTime <= now (isDcaIntervalRipe)
 * 3. For each ripe order, resolve the matching pool UTxO reference
 * 4. Build ExecuteOrderTx via TxBuilder
 * 5. Sign with keeper wallet and submit
 * 6. Await on-chain confirmation (lucid.awaitTx)
 * 7. ONLY THEN: call order.recordExecution() and persist to DB
 *    - Decrements remainingBudget by amountPerInterval
 *    - Increments executedIntervals
 *    - Marks FILLED when remainingBudget reaches 0
 */
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
} from '@lucid-evolution/lucid';
import { getLogger } from '../../config/logger.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder } from '../../domain/ports/ITxBuilder.js';
import type { Order } from '../../domain/entities/Order.js';

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
      this.logger.info(
        { keeperAddress: this.keeperAddress },
        'Order executor keeper wallet initialised',
      );
    }

    return { lucid, address: this.keeperAddress };
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    // Collect DCA orders that are ACTIVE or PARTIALLY_FILLED
    const [activePage, partialPage] = await Promise.all([
      this.orderRepo.findMany({ status: 'ACTIVE',           type: 'DCA', limit: this.batchLimit }),
      this.orderRepo.findMany({ status: 'PARTIALLY_FILLED', type: 'DCA', limit: this.batchLimit }),
    ]);

    const candidates = [...activePage.items, ...partialPage.items]
      // Deduplicate (an order could theoretically appear in both pages during a race)
      .filter((o, idx, arr) => arr.findIndex((x) => x.id === o.id) === idx)
      // Only orders where the execution interval has elapsed
      .filter((o) => o.isDcaIntervalRipe(now))
      // Limit total to batchLimit so we don't overload the keeper wallet
      .slice(0, this.batchLimit);

    if (candidates.length === 0) {
      this.logger.debug('No ripe DCA orders found');
      return;
    }

    this.logger.info({ count: candidates.length }, 'Processing ripe DCA orders');

    if (!this.solverSeedPhrase) {
      this.logger.warn('SOLVER_SEED_PHRASE not set — skipping DCA execution');
      return;
    }

    for (const order of candidates) {
      try {
        await this.executeOrder(order);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { orderId: order.id, error: msg },
          'DCA order execution failed — will retry next tick',
        );
      }
    }
  }

  /**
   * Execute a single DCA interval:
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
        'DCA order has no on-chain escrow UTxO — skipping',
      );
      return;
    }

    // Resolve the best pool for this asset pair
    const inputAssetId  = props.inputPolicyId
      ? `${props.inputPolicyId}.${props.inputAssetName}`
      : 'lovelace';
    const outputAssetId = props.outputPolicyId
      ? `${props.outputPolicyId}.${props.outputAssetName}`
      : 'lovelace';

    // Try direct pair, then reverse
    const pool =
      await this.poolRepo.findByPair(inputAssetId, outputAssetId) ??
      await this.poolRepo.findByPair(outputAssetId, inputAssetId);

    if (!pool) {
      this.logger.warn(
        { orderId: order.id, inputAssetId, outputAssetId },
        'No active pool found for DCA order asset pair — skipping',
      );
      return;
    }

    const { lucid, address: keeperAddress } = await this.getKeeperLucid();

    this.logger.info(
      {
        orderId: order.id,
        poolId: pool.id,
        interval: (props.executedIntervals ?? 0) + 1,
        remainingBudget: props.remainingBudget?.toString(),
      },
      'Building DCA execution TX',
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

    // Sign and submit via keeper wallet
    const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
    const submittedHash = await signed.submit();

    this.logger.info(
      { orderId: order.id, txHash: submittedHash },
      'DCA execution TX submitted — awaiting on-chain confirmation',
    );

    // CRITICAL RULE: Await on-chain confirmation before updating DB
    const confirmed = await lucid.awaitTx(submittedHash, 120_000);
    if (!confirmed) {
      this.logger.warn(
        { orderId: order.id, txHash: submittedHash },
        'DCA execution TX not confirmed within 120s — DB not updated; will retry next tick',
      );
      return;
    }

    this.logger.info(
      { orderId: order.id, txHash: submittedHash },
      'DCA execution TX confirmed — updating DB',
    );

    // Post-confirmation DB update via domain entity
    order.recordExecution();
    await this.orderRepo.save(order);

    const updatedProps = order.toProps();
    this.logger.info(
      {
        orderId: order.id,
        status: updatedProps.status,
        executedIntervals: updatedProps.executedIntervals,
        remainingBudget: updatedProps.remainingBudget?.toString(),
      },
      'DCA order DB updated after confirmed execution',
    );
  }
}
