/**
 * Reclaim Keeper Cron
 * Periodically checks for expired intents and orders,
 * marks them as expired in the database, and builds + submits
 * Reclaim transactions to return locked funds to owners.
 *
 * This acts as the "Keeper Bot" described in the documentation.
 *
 * Flow:
 * 1. Mark overdue intents/orders as EXPIRED in DB
 * 2. Find EXPIRED intents that still have escrow UTxOs on-chain
 * 3. Build Reclaim TX (permissionless — anyone can submit after deadline)
 * 4. Sign with keeper (solver) wallet and submit
 * 5. Update DB status to RECLAIMED
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
      this.logger.error({ err }, 'On-chain reclaim batch failed');
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

  /** Build, sign, and submit a single reclaim TX */
  private async reclaimSingle(intent: Intent, keeperAddress: string): Promise<void> {
    this.logger.info({ intentId: intent.id }, 'Building reclaim TX');

    // Build the unsigned reclaim TX
    const { unsignedTx, txHash } = await this.txBuilder.buildReclaimTx({
      escrowTxHash: intent.escrowTxHash!,
      escrowOutputIndex: intent.escrowOutputIndex!,
      keeperAddress,
      ownerAddress: intent.creator,
    });

    // Sign with keeper wallet
    const { lucid } = await this.getKeeperLucid();
    const signed = await lucid.fromTx(unsignedTx).sign.withWallet().complete();
    const submittedHash = await signed.submit();

    this.logger.info(
      { intentId: intent.id, txHash: submittedHash },
      'Reclaim TX submitted',
    );

    // Update DB status to RECLAIMED
    await this.intentRepo.updateStatus(intent.id, 'RECLAIMED');

    this.logger.info(
      { intentId: intent.id, txHash: submittedHash },
      'Intent reclaimed successfully',
    );
  }
}
