/**
 * Chain Sync Service
 * Monitors the blockchain for relevant events and updates local state.
 * Uses Blockfrost API instead of self-hosted Kupo.
 *
 * Fixed: B2 — uses pool validator address + getUtxosByAsset instead of
 *        passing policyId directly to getUtxos (which expects Bech32).
 * Fixed: Auto-promotes CREATED/PENDING intents & orders → ACTIVE when TX confirmed on-chain.
 * Fixed: Also expires CREATED/PENDING intents & orders past their deadline.
 * Fixed: syncPools now parses on-chain pool UTxO datum + value to keep DB reserves in-sync.
 */
import { getLogger } from '../../config/logger.js';
import type { PrismaClient } from '@prisma/client';
import { BlockfrostClient } from './BlockfrostClient.js';
import { Data, type Constr } from '@lucid-evolution/lucid';

export class ChainSync {
  private readonly logger;
  private running = false;
  private syncIntervalMs: number;

  constructor(
    private readonly blockfrost: BlockfrostClient,
    private readonly prisma: PrismaClient,
    private readonly poolValidatorAddress: string,
    syncIntervalMs = 30_000, // 30s default — conservative for free tier
  ) {
    this.logger = getLogger().child({ service: 'chain-sync' });
    this.syncIntervalMs = syncIntervalMs;
  }

  /** Start the sync loop */
  async start(): Promise<void> {
    this.running = true;
    this.logger.info('Chain sync started');

    while (this.running) {
      try {
        await this.syncPools();
        await this.promoteConfirmedIntents();
        await this.promoteConfirmedOrders();
        await this.checkExpiredIntents();
        await this.checkExpiredOrders();
      } catch (err) {
        this.logger.error({ err }, 'Chain sync iteration failed');
      }
      await new Promise((r) => setTimeout(r, this.syncIntervalMs));
    }
  }

  /** Stop the sync loop */
  stop(): void {
    this.running = false;
    this.logger.info('Chain sync stopping');
  }

  /** Sync pool reserves from chain state — reads on-chain UTxO datum + value */
  private async syncPools(): Promise<void> {
    const pools = await this.prisma.pool.findMany({
      where: { state: 'ACTIVE' },
      select: {
        id: true, txHash: true, outputIndex: true,
        poolNftPolicyId: true, poolNftAssetName: true,
        assetAPolicyId: true, assetAAssetName: true,
        assetBPolicyId: true, assetBAssetName: true,
      },
    });

    for (const pool of pools) {
      try {
        // B2 fix: Query pool validator address and filter by NFT asset
        const utxos = this.poolValidatorAddress
          ? await this.blockfrost.getUtxosByAsset(
              this.poolValidatorAddress,
              pool.poolNftPolicyId,
              pool.poolNftAssetName,
            )
          : await this.blockfrost.getAssetUtxos(
              pool.poolNftPolicyId,
              pool.poolNftAssetName,
            );

        if (utxos.length === 0) continue;
        const poolUtxo = utxos[0]!;

        // Always parse reserves from on-chain UTxO — even if the txHash hasn't changed,
        // because the DB reserves may have drifted from a previous bug.
        const changed = poolUtxo.txHash !== pool.txHash || poolUtxo.outputIndex !== pool.outputIndex;

        // Build asset unit keys (same format as Blockfrost: policyId + assetNameHex)
        const unitA = pool.assetAPolicyId
          ? `${pool.assetAPolicyId}${pool.assetAAssetName}`
          : 'lovelace';
        const unitB = pool.assetBPolicyId
          ? `${pool.assetBPolicyId}${pool.assetBAssetName}`
          : 'lovelace';

        // Physical reserves from the pool UTxO value
        const physicalA = poolUtxo.value[unitA] ?? 0n;
        const physicalB = poolUtxo.value[unitB] ?? 0n;

        // Parse inline datum for protocol fees, total LP tokens, etc.
        // PoolDatum = Constr(0, [pool_nft, asset_a, asset_b, total_lp_tokens,
        //                        fee_numerator, protocol_fees_a, protocol_fees_b, last_root_k])
        let protocolFeesA = 0n;
        let protocolFeesB = 0n;
        let totalLpTokens = 0n;
        if (poolUtxo.datum) {
          try {
            const decoded = Data.from(poolUtxo.datum) as Constr<Data>;
            if (decoded.fields.length >= 8) {
              totalLpTokens = decoded.fields[3] as bigint;
              protocolFeesA = decoded.fields[5] as bigint;
              protocolFeesB = decoded.fields[6] as bigint;
            }
          } catch (e) {
            this.logger.debug({ poolId: pool.id, err: e }, 'Failed to parse pool datum');
          }
        }

        // Write PHYSICAL reserves to DB (the Route Optimizer / Pool entity
        // will subtract protocolFees internally to get active reserves).
        const data: Record<string, unknown> = {
          txHash: poolUtxo.txHash,
          outputIndex: poolUtxo.outputIndex,
          reserveA: physicalA.toString(),
          reserveB: physicalB.toString(),
          totalLpTokens: totalLpTokens.toString(),
          protocolFeeAccA: protocolFeesA.toString(),
          protocolFeeAccB: protocolFeesB.toString(),
        };

        await this.prisma.pool.update({
          where: { id: pool.id },
          data,
        });

        // Log reserves at debug level (reduced from info to avoid log noise)
        this.logger.debug(
          {
            poolId: pool.id, txHash: poolUtxo.txHash,
            physicalA: physicalA.toString(),
            physicalB: physicalB.toString(),
            protocolFeesA: protocolFeesA.toString(),
            protocolFeesB: protocolFeesB.toString(),
            changed,
          },
          'Pool reserves synced',
        );
      } catch (err) {
        this.logger.error({ err, poolId: pool.id }, 'Failed to sync pool');
      }
    }
  }

  /**
   * Auto-promote CREATED/PENDING intents → ACTIVE when their escrowTxHash is confirmed on-chain.
   * This is the safety-net for when the frontend's /tx/confirm call fails or is never made.
   */
  private async promoteConfirmedIntents(): Promise<void> {
    const stuckIntents = await this.prisma.intent.findMany({
      where: {
        status: { in: ['CREATED', 'PENDING'] },
        escrowTxHash: { not: null },
      },
      select: { id: true, escrowTxHash: true },
      take: 20,
    });

    if (stuckIntents.length === 0) return;

    let promotedCount = 0;
    for (const intent of stuckIntents) {
      try {
        const confirmed = await this.blockfrost.awaitTx(intent.escrowTxHash!, 5_000);
        if (confirmed) {
          await this.prisma.intent.update({
            where: { id: intent.id },
            data: { status: 'ACTIVE' },
          });
          promotedCount++;
          this.logger.info(
            { intentId: intent.id, txHash: intent.escrowTxHash },
            'Auto-promoted intent CREATED/PENDING → ACTIVE (on-chain TX confirmed)',
          );
        }
      } catch (err) {
        this.logger.debug(
          { intentId: intent.id, err },
          'Failed to check intent TX confirmation',
        );
      }
    }

    if (promotedCount > 0) {
      this.logger.info({ count: promotedCount }, 'Auto-promoted intents to ACTIVE');
    }
  }

  /**
   * Auto-promote CREATED/PENDING orders → ACTIVE when their escrowTxHash is confirmed on-chain.
   */
  private async promoteConfirmedOrders(): Promise<void> {
    const stuckOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['CREATED', 'PENDING'] },
        escrowTxHash: { not: null },
      },
      select: { id: true, escrowTxHash: true },
      take: 20,
    });

    if (stuckOrders.length === 0) return;

    let promotedCount = 0;
    for (const order of stuckOrders) {
      try {
        const confirmed = await this.blockfrost.awaitTx(order.escrowTxHash!, 5_000);
        if (confirmed) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: 'ACTIVE' },
          });
          promotedCount++;
          this.logger.info(
            { orderId: order.id, txHash: order.escrowTxHash },
            'Auto-promoted order CREATED/PENDING → ACTIVE (on-chain TX confirmed)',
          );
        }
      } catch (err) {
        this.logger.debug(
          { orderId: order.id, err },
          'Failed to check order TX confirmation',
        );
      }
    }

    if (promotedCount > 0) {
      this.logger.info({ count: promotedCount }, 'Auto-promoted orders to ACTIVE');
    }
  }

  /** Check and mark expired intents (including CREATED/PENDING that passed deadline) */
  private async checkExpiredIntents(): Promise<void> {
    const now = BigInt(Date.now());
    const result = await this.prisma.intent.updateMany({
      where: {
        status: { in: ['CREATED', 'PENDING', 'ACTIVE', 'FILLING'] },
        deadline: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.info({ count: result.count }, 'Marked intents expired');
    }
  }

  /** Check and mark expired orders (including CREATED/PENDING that passed deadline) */
  private async checkExpiredOrders(): Promise<void> {
    const now = BigInt(Date.now());
    const result = await this.prisma.order.updateMany({
      where: {
        status: { in: ['CREATED', 'PENDING', 'ACTIVE', 'PARTIALLY_FILLED'] },
        deadline: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.info({ count: result.count }, 'Marked orders expired');
    }
  }
}
