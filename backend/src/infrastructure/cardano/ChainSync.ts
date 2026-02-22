/**
 * Chain Sync Service
 * Monitors the blockchain for relevant events and updates local state.
 * Uses Blockfrost API instead of self-hosted Kupo.
 *
 * Fixed: B2 — uses pool validator address + getUtxosByAsset instead of
 *        passing policyId directly to getUtxos (which expects Bech32).
 */
import { getLogger } from '../../config/logger.js';
import type { PrismaClient } from '@prisma/client';
import { BlockfrostClient } from './BlockfrostClient.js';

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
        await this.checkExpiredIntents();
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

  /** Sync pool reserves from chain state */
  private async syncPools(): Promise<void> {
    const pools = await this.prisma.pool.findMany({
      where: { state: 'ACTIVE' },
      select: { id: true, txHash: true, outputIndex: true, poolNftPolicyId: true, poolNftAssetName: true },
    });

    for (const pool of pools) {
      try {
        // B2 fix: Query pool validator address and filter by NFT asset
        // instead of passing policyId (hex) to getUtxos (which expects Bech32)
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

        if (utxos.length > 0) {
          const poolUtxo = utxos[0]!;

          // Check if UTxO changed (new TX)
          if (poolUtxo.txHash !== pool.txHash || poolUtxo.outputIndex !== pool.outputIndex) {
            this.logger.debug(
              { poolId: pool.id, newTx: poolUtxo.txHash },
              'Pool state updated',
            );

            await this.prisma.pool.update({
              where: { id: pool.id },
              data: {
                txHash: poolUtxo.txHash,
                outputIndex: poolUtxo.outputIndex,
              },
            });
          }
        }
      } catch (err) {
        this.logger.error({ err, poolId: pool.id }, 'Failed to sync pool');
      }
    }
  }

  /** Check and mark expired intents */
  private async checkExpiredIntents(): Promise<void> {
    const now = BigInt(Date.now());
    const result = await this.prisma.intent.updateMany({
      where: {
        status: { in: ['ACTIVE', 'FILLING'] },
        deadline: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.info({ count: result.count }, 'Marked intents expired');
    }
  }
}
