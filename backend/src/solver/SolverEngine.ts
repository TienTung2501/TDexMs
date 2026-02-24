/**
 * Solver Engine â€” Main orchestrator
 * Runs the continuous loop: collect â†’ validate â†’ route â†’ batch â†’ settle.
 * Uses Blockfrost for chain interaction (replaces Ogmios).
 *
 * Fixed: B1 â€” uses findByUtxoRef to resolve DB intent IDs
 * Fixed: B8 â€” only marks FILLING after TX is successfully built
 * Fixed: B5 â€” records price tick after confirmed settlement
 * Fixed: R-03 â€” writes Swap records after settlement
 * Fixed: R-15 â€” volume tracking respects batch direction
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
import { Lucid, Blockfrost, type LucidEvolution } from '@lucid-evolution/lucid';

export interface SolverConfig {
  batchWindowMs: number;
  maxRetries: number;
  minProfitLovelace: bigint;
  enabled: boolean;
  solverAddress: string;
  solverSeedPhrase: string;
  blockfrostUrl: string;
  blockfrostProjectId: string;
  network: 'Preprod' | 'Mainnet';
}

export class SolverEngine {
  private readonly logger;
  private running = false;
  private lucidPromise: Promise<LucidEvolution> | null = null;

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

  /** Get or create a Lucid instance for signing solver TXs */
  private async getSolverLucid(): Promise<LucidEvolution> {
    if (!this.lucidPromise) {
      this.lucidPromise = (async () => {
        const lucid = await Lucid(
          new Blockfrost(this.config.blockfrostUrl, this.config.blockfrostProjectId),
          this.config.network,
        );
        lucid.selectWallet.fromSeed(this.config.solverSeedPhrase);
        return lucid;
      })();
    }
    return this.lucidPromise;
  }

  /** Sign an unsigned TX CBOR with the solver wallet and submit to chain */
  private async signAndSubmitTx(unsignedTxCbor: string): Promise<string> {
    const lucid = await this.getSolverLucid();
    const txSigned = await lucid.fromTx(unsignedTxCbor).sign.withWallet().complete();
    const txHash = await txSigned.submit();
    return txHash;
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
    const chainIntents = await this.collector.getActiveIntents();

    if (chainIntents.length === 0) {
      this.logger.debug('No active intents found');
      return;
    }

    // Phase 1b: Filter out stale UTxOs that have no corresponding DB record.
    // This prevents the TX builder from trying to burn escrow tokens for
    // UTxOs that were already settled/cancelled but still linger on-chain.
    const intents: typeof chainIntents = [];
    let staleCount = 0;
    for (const intent of chainIntents) {
      const dbIntent = await this.intentRepo.findByUtxoRef(
        intent.utxoRef.txHash,
        intent.utxoRef.outputIndex,
      );
      if (!dbIntent) {
        // Log at debug level — stale UTxOs are expected after DB resets or
        // when test transactions were submitted before the DB was populated.
        this.logger.debug(
          { txHash: intent.utxoRef.txHash, outputIndex: intent.utxoRef.outputIndex },
          'Skipping stale on-chain escrow UTxO — no matching DB intent',
        );
        staleCount++;
        continue;
      }
      if (dbIntent.status !== 'ACTIVE' && dbIntent.status !== 'FILLING' && dbIntent.status !== 'PARTIALLY_FILLED') {
        this.logger.debug(
          { intentId: dbIntent.id, status: dbIntent.status },
          'Skipping non-ACTIVE/PARTIALLY_FILLED DB intent',
        );
        continue;
      }
      // Recovery check: if intent is FILLING with a pending settlementTxHash,
      // a previous iteration submitted a TX but timed out waiting for confirmation.
      // Don't re-settle — the TX may still confirm and consume the escrow UTxO.
      if (dbIntent.status === 'FILLING' && dbIntent.settlementTxHash) {
        this.logger.info(
          { intentId: dbIntent.id, txHash: dbIntent.settlementTxHash },
          'Skipping FILLING intent with pending settlement TX — awaiting on-chain confirmation',
        );
        continue;
      }
      // Skip intents whose deadline has already passed — the on-chain validator
      // will reject settlement TXs for expired intents.
      if (dbIntent.deadline && BigInt(dbIntent.deadline) <= BigInt(Date.now())) {
        this.logger.debug(
          { intentId: dbIntent.id, deadline: String(dbIntent.deadline) },
          'Skipping expired intent (deadline passed)',
        );
        continue;
      }
      intents.push(intent);
    }

    // Log a single summary if any stale UTxOs were found (reduces log noise)
    if (staleCount > 0) {
      this.logger.debug(
        { staleCount, totalChainUtxos: chainIntents.length },
        'Filtered stale on-chain escrow UTxOs with no DB record',
      );
    }

    if (intents.length === 0) {
      this.logger.debug('No DB-verified active intents after filtering');
      return;
    }

    this.logger.info(
      { chainCount: chainIntents.length, dbVerifiedCount: intents.length },
      'Processing intents (filtered stale UTxOs)',
    );

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

    // Phase 4: Process each batch — settle ONE intent at a time because the
    // on-chain minting policy (check_exactly_one_burn) only allows burning
    // 1 escrow token per TX.  We split multi-intent batches into single-intent
    // sub-batches that share pool/direction metadata.
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

      // Process intents one-by-one within this pool batch
      for (const singleIntent of batch.intents) {
        const intentKey = `${singleIntent.utxoRef.txHash}#${singleIntent.utxoRef.outputIndex}`;
        const route = routes.get(intentKey);
        // Use route's actual input/output (may be partial fill)
        const actualInput = route?.actualInput ?? singleIntent.inputAmount;
        const actualOutput = route?.totalOutput ?? 0n;
        const isPartialFill = route?.isPartialFill ?? false;

        const singleBatch: typeof batch = {
          ...batch,
          intents: [singleIntent],
          totalInputAmount: actualInput,
          totalOutputAmount: actualOutput,
        };

        if (isPartialFill) {
          this.logger.info(
            {
              utxoRef: intentKey,
              actualInput: actualInput.toString(),
              actualOutput: actualOutput.toString(),
              remainingInput: singleIntent.remainingInput.toString(),
            },
            'Processing partial fill for intent',
          );
        }

        const refs = [singleIntent.utxoRef];
        this.collector.markProcessing(refs);

        try {
          await this.settleBatch(singleBatch, isPartialFill);
          // Wait for pool UTxO to propagate after each successful settlement
          await sleep(2000);
        } catch (err) {
          this.logger.error(
            { err, poolId: batch.poolId, utxoRef: `${singleIntent.utxoRef.txHash}#${singleIntent.utxoRef.outputIndex}` },
            'Failed to settle single intent',
          );
        } finally {
          this.collector.clearProcessing(refs);
        }
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
  private async settleBatch(
    batch: import('./BatchBuilder.js').BatchGroup,
    isPartialFill = false,
  ): Promise<void> {
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
          poolDbId: batch.poolId,
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

        // Submit the TX â€” sign with solver wallet first
        let submittedTxHash: string;
        try {
          submittedTxHash = await this.signAndSubmitTx(txResult.unsignedTx);
        } catch (signErr) {
          // Revert FILLING â†’ ACTIVE on sign/submit failure
          for (const intent of batch.intents) {
            const intentId = await this.resolveIntentId(
              intent.utxoRef.txHash,
              intent.utxoRef.outputIndex,
            );
            if (intentId) {
              await this.intentRepo.updateStatus(intentId, 'ACTIVE');
            }
          }
          const errMsg = signErr instanceof Error ? signErr.message : String(signErr);
          throw new Error(`TX sign/submit failed: ${errMsg}`);
        }

        this.logger.info(
          { txHash: submittedTxHash, poolId: batch.poolId },
          'Settlement TX signed and submitted — awaiting on-chain confirmation',
        );

        // CRITICAL RULE: Await on-chain confirmation before any DB updates
        const confirmed = await this.chainProvider.awaitTx(submittedTxHash, 180_000);
        if (!confirmed) {
          // TX accepted into mempool but not confirmed within 180s.
          // IMPORTANT: Do NOT revert to ACTIVE. The TX may still confirm on-chain
          // which would consume the escrow UTxO. Reverting to ACTIVE could cause
          // the solver to try settling an already-consumed UTxO.
          // Instead, keep as FILLING and store the submitted txHash for traceability.
          // On the next solver iteration, if the escrow UTxO is no longer on-chain,
          // the intent simply won't appear in the collector results.
          this.logger.warn(
            { txHash: submittedTxHash },
            'Settlement TX not confirmed within 180s - keeping FILLING status (TX may still confirm)',
          );
          for (const intent of batch.intents) {
            const intentId = await this.resolveIntentId(
              intent.utxoRef.txHash,
              intent.utxoRef.outputIndex,
            );
            if (intentId) {
              // Store txHash for traceability but keep FILLING status
              const dbIntent = await this.intentRepo.findById(intentId);
              if (dbIntent) {
                dbIntent.markPendingSettlement(submittedTxHash);
                await this.intentRepo.save(dbIntent);
              }
            }
          }
          return;
        }

        this.logger.info(
          { txHash: submittedTxHash, poolId: batch.poolId },
          'Settlement TX confirmed on-chain” updating DB',
        );

        // â”€â”€ Post-confirmation DB updates â”€â”€

        // 0. Fetch pool entity once for direction determination and reserve updates
        const pool = this.poolRepo ? await this.poolRepo.findById(batch.poolId) : null;
        // Helper: Build assetId string for comparison (same format as EscrowIntent.inputAsset)
        const poolAssetA = pool
          ? (pool.assetAPolicyId ? `${pool.assetAPolicyId}.${pool.assetAAssetName}` : 'lovelace')
          : null;

        // 1. Update intent statuses and write Swap records (R-03 fix)
        // For partial fills: status → PARTIALLY_FILLED (escrow UTxO continues on-chain)
        // For full fills: status → FILLED (escrow UTxO consumed, token burned)
        const newStatus = isPartialFill ? 'PARTIALLY_FILLED' : 'FILLED';
        const prisma = getPrisma();
        for (const intent of batch.intents) {
          const intentId = await this.resolveIntentId(
            intent.utxoRef.txHash,
            intent.utxoRef.outputIndex,
          );

          if (intentId) {
            if (isPartialFill) {
              // Partial fill: update status, remaining input, fill count, and new escrow UTxO ref
              // The settlement TX creates a new escrow UTxO — we need to find its output index.
              // Convention: the first output to the escrow address is the continued escrow.
              // For now, update the essential fields via the Intent entity.
              const dbIntent = await this.intentRepo.findById(intentId);
              if (dbIntent) {
                dbIntent.markPartiallyFilled(
                  batch.totalInputAmount,
                  (dbIntent.toProps().fillCount ?? 0) + 1,
                  submittedTxHash,
                  // Output index of the new escrow UTxO — settlement TX typically puts it at index 0 or 1.
                  // The exact index will be corrected on next IntentCollector scan.
                  undefined,
                );
                await this.intentRepo.save(dbIntent);
              }
            } else {
              // Full fill: mark as FILLED
              const dbIntent = await this.intentRepo.findById(intentId);
              if (dbIntent) {
                dbIntent.markFilled(submittedTxHash, batch.totalOutputAmount, this.config.solverAddress);
                await this.intentRepo.save(dbIntent);
              } else {
                await this.intentRepo.updateStatus(intentId, 'FILLED');
              }
            }

            this.wsServer.broadcastIntent({
              intentId,
              status: newStatus,
              settlementTxHash: submittedTxHash,
              timestamp: Date.now(),
            });

            // R-03: Write Swap record for each settled intent
            try {
              const direction = (poolAssetA && intent.inputAsset === poolAssetA) ? 'AToB' : 'BToA';
              // Use batch totals (already reflect actual partial/full amounts)
              const outputEstimate = batch.totalOutputAmount;
              const feeNum = pool ? BigInt(pool.feeNumerator) : 30n;
              const feeEstimate = (batch.totalInputAmount * feeNum) / 10000n;

              await prisma.swap.create({
                data: {
                  poolId: batch.poolId,
                  txHash: submittedTxHash,
                  direction,
                  inputAmount: batch.totalInputAmount.toString(),
                  outputAmount: outputEstimate.toString(),
                  fee: feeEstimate.toString(),
                  priceImpact: 0,
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
              'Could not find DB intent for UTxO ref â€” status not updated',
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
              // Determine actual swap direction from the batch intents
              const batchDirectionAToB = batch.intents.length > 0 && poolAssetA
                ? batch.intents[0]!.inputAsset === poolAssetA
                : true;

              // Apply swap to domain entity to compute new reserves
              pool.applySwap(
                batch.totalInputAmount,
                batch.totalOutputAmount,
                batchDirectionAToB, // Bug #2 fix: use actual direction
              );
              await this.poolRepo.updateReserves(
                pool.id,
                pool.reserveA,
                pool.reserveB,
                pool.totalLpTokens,
                submittedTxHash,
                0, // Will be corrected by ChainSync
              );
              // R-15: Normalize volume to assetA units so A→B and B→A are comparable
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
                lastTxHash: submittedTxHash,
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
