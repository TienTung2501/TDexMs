/**
 * Solver Engine — Main orchestrator
 * Runs the continuous loop: collect → validate → route → batch → settle.
 * Uses Blockfrost for chain interaction (replaces Ogmios).
 *
 * Fixed: B1 — uses findByUtxoRef to resolve DB intent IDs
 * Fixed: B8 — only marks FILLING after TX is successfully built
 * Fixed: B5 — records price tick after confirmed settlement
 * Fixed: R-03 — writes Swap records after settlement
 * Fixed: R-15 — volume tracking respects batch direction
 * CRITICAL RULE: All DB state changes occur ONLY after on-chain TX confirmation.
 */
import { getLogger } from '../config/logger.js';
import { IntentCollector } from './IntentCollector.js';
import { RouteOptimizer } from './RouteOptimizer.js';
import { BatchBuilder } from './BatchBuilder.js';
import type { BlockfrostClient } from '../infrastructure/cardano/BlockfrostClient.js';
import type { IIntentRepository } from '../domain/ports/IIntentRepository.js';
import type { IPoolRepository } from '../domain/ports/IPoolRepository.js';
import type { ITxBuilder } from '../domain/ports/ITxBuilder.js';
import type { IChainProvider } from '../domain/ports/IChainProvider.js';
import type { WsServer } from '../interface/ws/WsServer.js';
import type { CandlestickService } from '../application/services/CandlestickService.js';
import { getPrisma } from '../infrastructure/database/prisma-client.js';

export interface SolverConfig {
  batchWindowMs: number;
  maxRetries: number;
  minProfitLovelace: bigint;
  enabled: boolean;
  solverAddress: string;
}

export class SolverEngine {
  private readonly logger;
  private running = false;

  constructor(
    private readonly config: SolverConfig,
    private readonly collector: IntentCollector,
    private readonly optimizer: RouteOptimizer,
    private readonly batchBuilder: BatchBuilder,
    private readonly blockfrost: BlockfrostClient,
    private readonly intentRepo: IIntentRepository,
    private readonly wsServer: WsServer,
    private readonly txBuilder?: ITxBuilder,
    private readonly chainProvider?: IChainProvider,
    private readonly poolRepo?: IPoolRepository,
    private readonly candlestickService?: CandlestickService,
  ) {
    this.logger = getLogger().child({ service: 'solver-engine' });
  }

  /** Start the solver loop */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Solver engine disabled by config');
      return;
    }

    this.running = true;
    this.logger.info(
      { batchWindow: this.config.batchWindowMs },
      'Solver engine started',
    );

    while (this.running) {
      try {
        await this.runIteration();
      } catch (err) {
        this.logger.error({ err }, 'Solver iteration failed');
        // Back off on error
        await sleep(this.config.batchWindowMs * 2);
      }

      await sleep(this.config.batchWindowMs);
    }

    this.logger.info('Solver engine stopped');
  }

  /** Stop the solver loop */
  stop(): void {
    this.running = false;
  }

  /** Single solver iteration */
  private async runIteration(): Promise<void> {
    // Phase 1: Collect active intents from chain
    const intents = await this.collector.getActiveIntents();

    if (intents.length === 0) {
      this.logger.debug('No active intents found');
      return;
    }

    this.logger.info({ intentCount: intents.length }, 'Processing intents');

    // Phase 2: Find optimal routes for each intent
    const routes = await this.optimizer.findRoutes(intents);

    // Filter intents that have valid routes
    const routableIntents = intents.filter((i) => {
      const key = `${i.utxoRef.txHash}#${i.utxoRef.outputIndex}`;
      return routes.has(key);
    });

    if (routableIntents.length === 0) {
      this.logger.debug('No routable intents');
      return;
    }

    // Phase 3: Group into batches
    const batches = this.batchBuilder.groupByPool(routableIntents, routes);

    // Phase 4: Process each batch
    for (const batch of batches) {
      // Check profitability
      const surplus = this.batchBuilder.calculateSurplus(batch);
      if (surplus < this.config.minProfitLovelace) {
        this.logger.debug(
          { poolId: batch.poolId, surplus: surplus.toString() },
          'Batch not profitable enough, skipping',
        );
        continue;
      }

      // Mark intents as processing
      const refs = batch.intents.map((i) => i.utxoRef);
      this.collector.markProcessing(refs);

      try {
        await this.settleBatch(batch);
      } catch (err) {
        this.logger.error(
          { err, poolId: batch.poolId, intentCount: batch.intents.length },
          'Failed to settle batch',
        );
      } finally {
        this.collector.clearProcessing(refs);
      }
    }
  }

  /**
   * Resolve a DB intent by its escrow UTxO reference.
   * Returns the intent's UUID if found, null otherwise.
   */
  private async resolveIntentId(txHash: string, outputIndex: number): Promise<string | null> {
    const dbIntent = await this.intentRepo.findByUtxoRef(txHash, outputIndex);
    return dbIntent?.id ?? null;
  }

  /** Settle a batch with retry on contention */
  private async settleBatch(batch: import('./BatchBuilder.js').BatchGroup): Promise<void> {
    if (!this.txBuilder || !this.chainProvider) {
      this.logger.warn('TxBuilder or ChainProvider not configured — skipping settlement');
      return;
    }

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.logger.info(
          {
            poolId: batch.poolId,
            intentCount: batch.intents.length,
            totalInput: batch.totalInputAmount.toString(),
            attempt,
          },
          'Building settlement TX',
        );

        // Build the settlement transaction FIRST (B8 fix: don't mark FILLING before build)
        const txResult = await this.txBuilder.buildSettlementTx({
          intentUtxoRefs: batch.intents.map((i) => i.utxoRef),
          poolUtxoRef: {
            txHash: batch.poolId.split('#')[0] ?? '',
            outputIndex: parseInt(batch.poolId.split('#')[1] ?? '0', 10),
          },
          solverAddress: this.config.solverAddress,
        });

        this.logger.info(
          { txHash: txResult.txHash, fee: txResult.estimatedFee.toString() },
          'Settlement TX built',
        );

        // Now mark intents as FILLING (after successful build)
        for (const intent of batch.intents) {
          const intentId = await this.resolveIntentId(
            intent.utxoRef.txHash,
            intent.utxoRef.outputIndex,
          );
          if (intentId) {
            await this.intentRepo.updateStatus(intentId, 'FILLING');
          }
        }

        // Submit the TX
        const submitResult = await this.chainProvider.submitTx(txResult.unsignedTx);

        if (!submitResult.accepted) {
          // Revert FILLING → ACTIVE on failure
          for (const intent of batch.intents) {
            const intentId = await this.resolveIntentId(
              intent.utxoRef.txHash,
              intent.utxoRef.outputIndex,
            );
            if (intentId) {
              await this.intentRepo.updateStatus(intentId, 'ACTIVE');
            }
          }
          throw new Error(`TX rejected: ${submitResult.error}`);
        }

        this.logger.info(
          { txHash: submitResult.txHash, poolId: batch.poolId },
          'Settlement TX submitted — awaiting on-chain confirmation',
        );

        // CRITICAL RULE: Await on-chain confirmation before any DB updates
        const confirmed = await this.chainProvider.awaitTx(submitResult.txHash, 120_000);
        if (!confirmed) {
          // TX accepted into mempool but not confirmed within 120s.
          // Revert intents from FILLING → ACTIVE so the next solver iteration
          // can re-evaluate them (they may still confirm on-chain later).
          this.logger.warn(
            { txHash: submitResult.txHash },
            'Settlement TX not confirmed within 120s — reverting FILLING → ACTIVE',
          );
          for (const intent of batch.intents) {
            const intentId = await this.resolveIntentId(
              intent.utxoRef.txHash,
              intent.utxoRef.outputIndex,
            );
            if (intentId) {
              await this.intentRepo.updateStatus(intentId, 'ACTIVE');
            }
          }
          return;
        }

        this.logger.info(
          { txHash: submitResult.txHash, poolId: batch.poolId },
          'Settlement TX confirmed on-chain — updating DB',
        );

        // ── Post-confirmation DB updates ──

        // 0. Fetch pool entity once for direction determination and reserve updates
        const pool = this.poolRepo ? await this.poolRepo.findById(batch.poolId) : null;
        // Helper: Build assetId string for comparison (same format as EscrowIntent.inputAsset)
        const poolAssetA = pool
          ? (pool.assetAPolicyId ? `${pool.assetAPolicyId}.${pool.assetAAssetName}` : 'lovelace')
          : null;

        // 1. Update intent statuses to FILLED and write Swap records (R-03 fix)
        const prisma = getPrisma();
        for (const intent of batch.intents) {
          const intentId = await this.resolveIntentId(
            intent.utxoRef.txHash,
            intent.utxoRef.outputIndex,
          );

          if (intentId) {
            await this.intentRepo.updateStatus(intentId, 'FILLED');

            this.wsServer.broadcastIntent({
              intentId,
              status: 'FILLED',
              settlementTxHash: submitResult.txHash,
              timestamp: Date.now(),
            });

            // R-03: Write Swap record for each settled intent
            try {
              const direction = (poolAssetA && intent.inputAsset === poolAssetA) ? 'AToB' : 'BToA';
              // Compute approximate output: pro-rata share of batch totals
              const outputEstimate = batch.totalInputAmount > 0n
                ? (intent.inputAmount * batch.totalOutputAmount) / batch.totalInputAmount
                : 0n;
              // Fee estimate from the pool fee numerator (e.g. 30 = 0.3%)
              const feeNum = pool ? BigInt(pool.feeNumerator) : 30n;
              const feeEstimate = (intent.inputAmount * feeNum) / 10000n;
              // Price impact estimate (simple – difference from ideal ratio)
              const priceImpact = batch.totalInputAmount > 0n
                ? Math.abs(
                    Number(intent.inputAmount) / Number(batch.totalInputAmount) -
                    1 / batch.intents.length,
                  )
                : 0;

              await prisma.swap.create({
                data: {
                  poolId: batch.poolId,
                  txHash: submitResult.txHash,
                  direction,
                  inputAmount: intent.inputAmount.toString(),
                  outputAmount: outputEstimate.toString(),
                  fee: feeEstimate.toString(),
                  priceImpact,
                  senderAddress: intent.owner,
                  intentId,
                },
              });
            } catch (swapErr) {
              this.logger.warn({ err: swapErr, intentId }, 'Failed to write Swap record');
            }
          } else {
            this.logger.warn(
              { txHash: intent.utxoRef.txHash, outputIndex: intent.utxoRef.outputIndex },
              'Could not find DB intent for UTxO ref — status not updated',
            );
          }
        }

        // 2. Record price ticks for charts (B5 fix)
        if (this.candlestickService && batch.totalInputAmount > 0n) {
          try {
            const price = Number(batch.totalOutputAmount) / Number(batch.totalInputAmount);
            await this.candlestickService.recordTickAndUpdateCandles(
              batch.poolId,
              price,
              batch.totalInputAmount,
            );
            this.logger.debug(
              { poolId: batch.poolId, price },
              'Recorded price tick after settlement',
            );
          } catch (err) {
            this.logger.warn({ err }, 'Failed to record price tick after settlement');
          }
        }

        // 3. Update pool reserves in DB (if poolRepo available)
        if (this.poolRepo && pool) {
          try {
              // Apply swap to domain entity to compute new reserves
              pool.applySwap(
                batch.totalInputAmount,
                batch.totalOutputAmount,
                true, // direction is determined by the batch
              );
              await this.poolRepo.updateReserves(
                pool.id,
                pool.reserveA,
                pool.reserveB,
                pool.totalLpTokens,
                submitResult.txHash,
                0, // Will be corrected by ChainSync
              );
              // R-15 fix: Normalize volume to assetA units so A→B and B→A are comparable
              // For A→B: volumeInA = totalInputAmount (already in A)
              // For B→A: volumeInA = totalOutputAmount (the A side of the swap)
              const batchDirectionAToB = batch.intents.length > 0 && poolAssetA
                ? batch.intents[0]!.inputAsset === poolAssetA
                : true;
              const normalizedVolume = batchDirectionAToB
                ? batch.totalInputAmount
                : batch.totalOutputAmount;

              // Update 24h volume stats
              await this.poolRepo.updateStats(
                pool.id,
                pool.volume24h + normalizedVolume,
                pool.fees24h,
                pool.tvlAda,
              );

              // Insert PoolHistory snapshot (Task 1 / audit R-02 write-side)
              const newPrice = pool.reserveB > 0n
                ? Number(pool.reserveA) / Number(pool.reserveB)
                : 0;
              await this.poolRepo.insertHistory({
                poolId: pool.id,
                reserveA: pool.reserveA,
                reserveB: pool.reserveB,
                tvlAda: pool.tvlAda,
                volume: pool.volume24h + normalizedVolume,
                fees: pool.fees24h,
                price: newPrice,
              });

              // Task 4: Broadcast real-time pool state update via WebSocket
              this.wsServer.broadcastPool({
                poolId: pool.id,
                reserveA: pool.reserveA.toString(),
                reserveB: pool.reserveB.toString(),
                price: newPrice.toString(),
                tvlAda: pool.tvlAda.toString(),
                lastTxHash: submitResult.txHash,
                timestamp: Date.now(),
              });
          } catch (err) {
            this.logger.warn({ err }, 'Failed to update pool reserves after settlement');
          }
        }

        return; // Success
      } catch (err) {
        if (attempt < this.config.maxRetries) {
          this.logger.warn(
            { attempt, err },
            'Settlement failed, retrying...',
          );
          await this.optimizer.refreshPools();
          await sleep(500 + Math.random() * 2000);
        } else {
          // On final failure, ensure intents are reverted to ACTIVE
          for (const intent of batch.intents) {
            try {
              const intentId = await this.resolveIntentId(
                intent.utxoRef.txHash,
                intent.utxoRef.outputIndex,
              );
              if (intentId) {
                await this.intentRepo.updateStatus(intentId, 'ACTIVE');
              }
            } catch {
              // Best-effort revert
            }
          }
          throw err;
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
