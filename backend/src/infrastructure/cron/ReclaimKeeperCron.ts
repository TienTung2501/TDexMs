/**
 * Reclaim Keeper Cron
 * Periodically checks for expired intents and orders,
 * marks them as expired in the database, and builds + submits
 * Reclaim transactions to return locked funds to owners.
 *
 * This acts as the "Keeper Bot" described in the documentation.
 *
 * CRITICAL RULE: DB state is only updated AFTER on-chain TX confirmation.
 *
 * Flow:
 * 1. Mark overdue intents/orders as EXPIRED in DB
 * 2. Find EXPIRED intents/orders that still have escrow UTxOs on-chain
 * 3. Build Reclaim TX (permissionless — anyone can submit after deadline)
 * 4. Sign with keeper (solver) wallet and submit
 * 5. Await on-chain confirmation (lucid.awaitTx)
 * 6. ONLY THEN update DB status to RECLAIMED / CANCELLED
 */
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
} from '@lucid-evolution/lucid';
import { getLogger } from '../../config/logger.js';
import { TxSubmitter } from '../../solver/TxSubmitter.js';
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { ITxBuilder } from '../../domain/ports/ITxBuilder.js';
import type { Intent } from '../../domain/entities/Intent.js';

export class ReclaimKeeperCron {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lucidPromise: Promise<LucidEvolution> | null = null;
  private keeperAddress: string | null = null;

  /**
   * @param intentRepo  Intent repository
   * @param orderRepo   Order repository
   * @param txBuilder   Transaction builder for constructing reclaim TXs
   * @param solverSeedPhrase  Keeper wallet seed phrase (same as solver)
   * @param blockfrostUrl     Blockfrost URL
   * @param blockfrostProjectId  Blockfrost project ID
   * @param network           Cardano network
   * @param intervalMs        How often to check for expired items (default: 60s)
   * @param ordersEnabled     Whether to process orders (saves Blockfrost calls when disabled)
   */
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly txBuilder: ITxBuilder,
    private readonly solverSeedPhrase: string,
    private readonly blockfrostUrl: string,
    private readonly blockfrostProjectId: string,
    private readonly network: 'Preprod' | 'Preview' | 'Mainnet' = 'Preprod',
    private readonly intervalMs: number = 60_000,
    private readonly ordersEnabled: boolean = false,
  ) {
    this.logger = getLogger().child({ service: 'reclaim-keeper' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info({ intervalMs: this.intervalMs }, 'Reclaim keeper cron started');

    // Run immediately, then on interval
    this.tick().catch((err) =>
      this.logger.error({ err }, 'Reclaim keeper tick failed'),
    );

    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error({ err }, 'Reclaim keeper tick failed'),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.info('Reclaim keeper cron stopped');
  }

  /** Lazy-init Lucid with keeper wallet */
  private async getKeeperLucid(): Promise<{ lucid: LucidEvolution; address: string }> {
    if (!this.solverSeedPhrase) {
      throw new Error('SOLVER_SEED_PHRASE not configured — keeper cannot sign TXs');
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
      this.logger.info({ keeperAddress: this.keeperAddress }, 'Keeper wallet initialized');
    }

    return { lucid, address: this.keeperAddress };
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    // ─── Step 1: Mark expired intents/orders in DB ───
    const expiredIntents = await this.intentRepo.markExpired(now);
    if (expiredIntents > 0) {
      this.logger.info({ count: expiredIntents }, 'Marked intents as expired');
    }

    // Only process orders if enabled
    if (this.ordersEnabled) {
      const expiredOrders = await this.orderRepo.markExpired(now);
      if (expiredOrders > 0) {
        this.logger.info({ count: expiredOrders }, 'Marked orders as expired');
      }
    }

    // ─── Step 2: On-chain reclaim for expired intents ───
    // Skip if no seed phrase configured
    if (!this.solverSeedPhrase) {
      return;
    }

    try {
      await this.reclaimExpiredIntents();
    } catch (err) {
      this.logger.error({ err }, 'On-chain intent reclaim batch failed');
    }

    // B7 fix: also reclaim expired orders on-chain (only if orders enabled)
    if (this.ordersEnabled) {
      try {
        await this.reclaimExpiredOrders();
      } catch (err) {
        this.logger.error({ err }, 'On-chain order reclaim batch failed');
      }
    }
  }

  /**
   * Find expired intents with escrow UTxOs and build+submit reclaim TXs.
   * Issue #2 fix: Fan-out reclaims in parallel with Promise.allSettled.
   * Each reclaim uses a different escrow UTxO, so there's no contention risk.
   */
  private async reclaimExpiredIntents(): Promise<void> {
    // Find intents marked EXPIRED that still have an escrow UTxO reference
    const { items: expiredIntents } = await this.intentRepo.findMany({
      status: 'EXPIRED',
      limit: 10,
    });

    const reclaimable = expiredIntents.filter(
      (intent) => intent.escrowTxHash && intent.escrowOutputIndex !== undefined,
    );

    if (reclaimable.length === 0) return;

    this.logger.info(
      { count: reclaimable.length },
      'Found expired intents with escrow UTxOs — attempting reclaim',
    );

    const { address: keeperAddress } = await this.getKeeperLucid();

    // Parallel reclaim — each escrow UTxO is independent
    const results = await Promise.allSettled(
      reclaimable.map((intent) => this.reclaimSingle(intent, keeperAddress)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'rejected') {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.warn(
          { intentId: reclaimable[i]!.id, error: msg },
          'Failed to reclaim intent — will retry next tick',
        );
      }
    }
  }

  /** Build, sign, submit, and await confirmation for a single intent reclaim TX.
   *  CRITICAL RULE: DB is only updated after on-chain confirmation.
   */
  private async reclaimSingle(intent: Intent, keeperAddress: string): Promise<void> {
    this.logger.info({ intentId: intent.id }, 'Building intent reclaim TX');

    // Build the unsigned reclaim TX
    let unsignedTx: string;
    try {
      const result = await this.txBuilder.buildReclaimTx({
        escrowTxHash: intent.escrowTxHash!,
        escrowOutputIndex: intent.escrowOutputIndex!,
        keeperAddress,
        ownerAddress: intent.creator,
      });
      unsignedTx = result.unsignedTx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If UTxO is already spent (filled/cancelled elsewhere), clean up DB
      if (msg.includes('not found on-chain') || msg.includes('already be reclaimed')) {
        this.logger.info(
          { intentId: intent.id },
          'Intent escrow UTxO already spent on-chain — marking RECLAIMED in DB',
        );
        await this.intentRepo.updateStatus(intent.id, 'RECLAIMED');
        return;
      }
      throw err;
    }

    // Sign and submit via TxSubmitter queue — serial submission prevents UTxO contention
    const { lucid } = await this.getKeeperLucid();
    let submittedHash: string;
    try {
      submittedHash = await TxSubmitter.getInstance().submit({
        label: `reclaim-intent id=${intent.id}`,
        signAndSubmit: async () => {
          const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
          return signed.submit();
        },
      });
    } catch (submitErr) {
      const submitMsg = submitErr instanceof Error ? submitErr.message : String(submitErr);
      if (submitMsg.includes('not confirmed within')) {
        this.logger.warn(
          { intentId: intent.id },
          'Reclaim TX not confirmed within timeout — DB not updated; will retry next tick',
        );
        return;
      }
      throw submitErr;
    }

    // Only update DB after confirmed on-chain
    await this.intentRepo.updateStatus(intent.id, 'RECLAIMED');

    this.logger.info(
      { intentId: intent.id, txHash: submittedHash },
      'Intent reclaim confirmed and DB updated',
    );
  }

  /**
   * B7 fix: Find expired orders with escrow UTxOs and build+submit cancel TXs.
   * Issue #2 fix: Parallel reclaims with Promise.allSettled.
   * CRITICAL RULE: DB is only updated after on-chain confirmation.
   */
  private async reclaimExpiredOrders(): Promise<void> {
    const { items: expiredOrders } = await this.orderRepo.findMany({
      status: 'EXPIRED',
      limit: 10,
    });

    const reclaimable = expiredOrders.filter(
      (order) => {
        const props = order.toProps();
        return props.escrowTxHash && props.escrowOutputIndex !== undefined;
      },
    );

    if (reclaimable.length === 0) return;

    this.logger.info(
      { count: reclaimable.length },
      'Found expired orders with escrow UTxOs — attempting reclaim',
    );

    const { address: keeperAddress, lucid } = await this.getKeeperLucid();

    // Parallel reclaim — each order UTxO is independent
    const results = await Promise.allSettled(
      reclaimable.map((order) => this.reclaimSingleOrder(order, keeperAddress, lucid)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'rejected') {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.warn(
          { orderId: reclaimable[i]!.id, error: msg },
          'Failed to reclaim order — will retry next tick',
        );
      }
    }
  }

  /** Reclaim a single expired order on-chain */
  private async reclaimSingleOrder(
    order: import('../../domain/entities/Order.js').Order,
    keeperAddress: string,
    lucid: LucidEvolution,
  ): Promise<void> {
    const props = order.toProps();
    this.logger.info({ orderId: order.id }, 'Building order reclaim TX (ReclaimOrder redeemer)');

    const ownerAddress = props.creator;

    let unsignedTx: string;
    try {
      const result = await this.txBuilder.buildReclaimOrderTx({
        keeperAddress: keeperAddress,
        orderTxHash: props.escrowTxHash!,
        orderOutputIndex: props.escrowOutputIndex!,
        ownerAddress: ownerAddress,
      });
      unsignedTx = result.unsignedTx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If UTxO is already spent (reclaimed/executed elsewhere), clean up DB
      if (msg.includes('not found on-chain') || msg.includes('already be reclaimed')) {
        this.logger.info(
          { orderId: order.id },
          'Order UTxO already spent on-chain — marking CANCELLED in DB',
        );
        await this.orderRepo.updateStatus(order.id, 'CANCELLED');
        return;
      }
      throw err;
    }

    // Sign and submit via TxSubmitter queue — serial submission prevents UTxO contention
    let submittedHash: string;
    try {
      submittedHash = await TxSubmitter.getInstance().submit({
        label: `reclaim-order id=${order.id}`,
        signAndSubmit: async () => {
          const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
          return signed.submit();
        },
      });
    } catch (submitErr) {
      const submitMsg = submitErr instanceof Error ? submitErr.message : String(submitErr);
      if (submitMsg.includes('not confirmed within')) {
        this.logger.warn(
          { orderId: order.id },
          'Order reclaim TX not confirmed within timeout — DB not updated; will retry next tick',
        );
        return;
      }
      throw submitErr;
    }

    // Only update DB after confirmed on-chain — mark CANCELLED since funds are returned
    await this.orderRepo.updateStatus(order.id, 'CANCELLED');

    this.logger.info(
      { orderId: order.id, txHash: submittedHash },
      'Expired order reclaim confirmed and DB updated → CANCELLED',
    );
  }
}
