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

    const expiredOrders = await this.orderRepo.markExpired(now);
    if (expiredOrders > 0) {
      this.logger.info({ count: expiredOrders }, 'Marked orders as expired');
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

    // B7 fix: also reclaim expired orders on-chain
    try {
      await this.reclaimExpiredOrders();
    } catch (err) {
      this.logger.error({ err }, 'On-chain order reclaim batch failed');
    }
  }

  /**
   * Find expired intents with escrow UTxOs and build+submit reclaim TXs.
   * Processes one-at-a-time to avoid contention issues.
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

    for (const intent of reclaimable) {
      try {
        await this.reclaimSingle(intent, keeperAddress);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { intentId: intent.id, error: msg },
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
    const { unsignedTx } = await this.txBuilder.buildReclaimTx({
      escrowTxHash: intent.escrowTxHash!,
      escrowOutputIndex: intent.escrowOutputIndex!,
      keeperAddress,
      ownerAddress: intent.creator,
    });

    // Sign and submit
    const { lucid } = await this.getKeeperLucid();
    const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
    const submittedHash = await signed.submit();

    this.logger.info(
      { intentId: intent.id, txHash: submittedHash },
      'Intent reclaim TX submitted — awaiting on-chain confirmation',
    );

    // CRITICAL RULE: Await on-chain confirmation before updating DB
    const confirmed = await lucid.awaitTx(submittedHash, 120_000);
    if (!confirmed) {
      this.logger.warn(
        { intentId: intent.id, txHash: submittedHash },
        'Reclaim TX not confirmed within 120s — DB not updated; will retry next tick',
      );
      return;
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

    for (const order of reclaimable) {
      try {
        const props = order.toProps();
        this.logger.info({ orderId: order.id }, 'Building order cancel TX for reclaim');

        const { unsignedTx } = await this.txBuilder.buildCancelOrderTx({
          orderId: order.id,
          senderAddress: keeperAddress,
          escrowTxHash: props.escrowTxHash!,
          escrowOutputIndex: props.escrowOutputIndex!,
        });

        const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
        const submittedHash = await signed.submit();

        this.logger.info(
          { orderId: order.id, txHash: submittedHash },
          'Order reclaim TX submitted — awaiting on-chain confirmation',
        );

        // CRITICAL RULE: Await on-chain confirmation before updating DB
        const confirmed = await lucid.awaitTx(submittedHash, 120_000);
        if (!confirmed) {
          this.logger.warn(
            { orderId: order.id, txHash: submittedHash },
            'Order reclaim TX not confirmed within 120s — DB not updated; will retry next tick',
          );
          continue;
        }

        // Only update DB after confirmed on-chain
        await this.orderRepo.updateStatus(order.id, 'CANCELLED');

        this.logger.info(
          { orderId: order.id, txHash: submittedHash },
          'Expired order reclaim confirmed and DB updated',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { orderId: order.id, error: msg },
          'Failed to reclaim order — will retry next tick',
        );
      }
    }
  }
}
