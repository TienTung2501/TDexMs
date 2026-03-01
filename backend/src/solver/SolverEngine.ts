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
import { TxSubmitter } from './TxSubmitter.js';
import { IntentCollector } from './IntentCollector.js';
import { RouteOptimizer } from './RouteOptimizer.js';
import { BatchBuilder } from './BatchBuilder.js';
import { NettingEngine, type EscrowInfo, type PoolState, type BatchPlan } from './NettingEngine.js';
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

export interface SolverStatus {
  running: boolean;
  enabled: boolean;
  lastRun: string | null;
  batchesTotal: number;
  batchesSuccess: number;
  batchesFailed: number;
  activeIntents: number;
  pendingOrders: number;
  queueDepth: number;
  lastTxHash: string | null;
  uptimeMs: number;
  config: {
    batchWindowMs: number;
    maxRetries: number;
    minProfitLovelace: string;
    solverAddress: string;
    network: string;
  };
}

export class SolverEngine {
  private readonly logger;
  private running = false;
  private lucidPromise: Promise<LucidEvolution> | null = null;

  // ── Status tracking ─────────────────────────
  private startedAt: number | null = null;
  private lastRunAt: string | null = null;
  private batchesTotal = 0;
  private batchesSuccess = 0;
  private batchesFailed = 0;
  private lastActiveIntents = 0;
  private lastTxHash: string | null = null;

  /**
   * Per-escrow validator crash counter.
   * Key: "{txHash}#{outputIndex}" — incremented each time the on-chain
   * Plutus script simulation rejects a solo settlement for that specific escrow.
   * After MAX_VALIDATOR_CRASHES solo failures we stop retrying the intent permanently
   * for this process lifetime (avoids infinite loop on structurally bad intents).
   */
  private readonly validatorCrashCounts = new Map<string, number>();
  private static readonly MAX_VALIDATOR_CRASHES = 3;

  /** Get current solver status (thread-safe read) */
  getStatus(): SolverStatus {
    return {
      running: this.running,
      enabled: this.config.enabled,
      lastRun: this.lastRunAt,
      batchesTotal: this.batchesTotal,
      batchesSuccess: this.batchesSuccess,
      batchesFailed: this.batchesFailed,
      activeIntents: this.lastActiveIntents,
      pendingOrders: 0, // populated by admin route from DB
      queueDepth: this.lastActiveIntents,
      lastTxHash: this.lastTxHash,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      config: {
        batchWindowMs: this.config.batchWindowMs,
        maxRetries: this.config.maxRetries,
        minProfitLovelace: this.config.minProfitLovelace.toString(),
        solverAddress: this.config.solverAddress,
        network: this.config.network,
      },
    };
  }

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
        // Register with TxSubmitter singleton so SolverEngine, OrderExecutorCron
        // and ReclaimKeeperCron all submit TXs serially (prevents UTxO contention).
        TxSubmitter.getInstance(180_000, 2_000).setLucid(lucid);
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
    this.startedAt = Date.now();
    this.logger.info(
      { batchWindow: this.config.batchWindowMs },
      'Solver engine started',
    );

    while (this.running) {
      try {
        await this.runIteration();
        this.batchesTotal++;
        this.batchesSuccess++;
        this.lastRunAt = new Date().toISOString();
      } catch (err) {
        this.batchesTotal++;
        this.batchesFailed++;
        this.lastRunAt = new Date().toISOString();
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
    this.lastActiveIntents = chainIntents.length;

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
     // ⚡ AUTO-HEAL: Nếu UTxO đã tồn tại trên chuỗi (Chain) mà DB vẫn là CREATED
      if (dbIntent.status === 'CREATED') {
        this.logger.info(
          { intentId: dbIntent.id, txHash: intent.utxoRef.txHash },
          'Auto-healing: Found valid on-chain UTxO for CREATED intent. Upgrading to ACTIVE.',
        );
        // Chỉ gọi API update xuống Database, không cần modify object dbIntent
        await this.intentRepo.updateStatus(dbIntent.id, 'ACTIVE');
        
      } 
      // Chuyển thành "else if" để nếu nó đã là CREATED ở trên thì không lọt vào đây nữa
      else if (dbIntent.status !== 'ACTIVE' && dbIntent.status !== 'FILLING' && dbIntent.status !== 'PARTIALLY_FILLED') {
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
        this.logger.debug(
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
      // Skip intents whose escrow UTxO has caused repeated validator crashes —
      // they are structurally unsettleable (e.g. minOutput can never be satisfied).
      const escrowKey = `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`;
      if ((this.validatorCrashCounts.get(escrowKey) ?? 0) >= SolverEngine.MAX_VALIDATOR_CRASHES) {
        this.logger.debug(
          { escrowKey, intentId: dbIntent.id },
          'Skipping escrow permanently blacklisted after validator crashes',
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

    this.logger.debug(
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

    // Phase 3b: NettingEngine analysis — cross-match opposing intents to reduce AMM impact.
    // When opposing intents exist (A→B and B→A), NettingEngine computes:
    //   - How much flow cancels out (cross-matched at spot price theoretically)
    //   - The residual net flow that must go through the AMM
    // Due to on-chain pool validator constraints (single-direction redeemer,
    // protocol fee accrual on one side), true cross-matching requires a
    // dedicated Netting redeemer. For now, we split mixed batches into
    // same-direction sub-batches and process each as one TX.
    // The NettingEngine analysis shows the theoretical netting benefit.
    for (const batch of batches) {
      if (this.poolRepo && batch.intents.length > 1) {
        try {
          const pool = await this.poolRepo.findById(batch.poolId);
          if (pool) {
            const poolAssetA = pool.assetAPolicyId
              ? `${pool.assetAPolicyId}.${pool.assetAAssetName}` : '';
            const escrowInfos: EscrowInfo[] = batch.intents.map((intent) => ({
              txHash: intent.utxoRef.txHash,
              outputIndex: intent.utxoRef.outputIndex,
              direction: (intent.inputAsset === poolAssetA ? 'AToB' : 'BToA') as 'AToB' | 'BToA',
              remainingInput: intent.remainingInput > 0n ? intent.remainingInput : intent.inputAmount,
              minOutput: intent.minOutput,
              originalInput: intent.inputAmount,
              ownerAddress: intent.owner,
            }));
            const poolState: PoolState = {
              activeA: pool.reserveA - pool.protocolFeeAccA,
              activeB: pool.reserveB - pool.protocolFeeAccB,
              feeNumerator: BigInt(pool.feeNumerator),
            };
            const plan: BatchPlan = NettingEngine.analyze(escrowInfos, poolState);

            // Compute netting savings ratio
            const grossA = escrowInfos.filter(e => e.direction === 'AToB').reduce((s, e) => s + e.remainingInput, 0n);
            const grossB = escrowInfos.filter(e => e.direction === 'BToA').reduce((s, e) => s + e.remainingInput, 0n);
            const hasOpposing = grossA > 0n && grossB > 0n;

            // Only log at info when there are actually opposing intents (rare & interesting)
            const nettingLogLevel = hasOpposing ? 'info' : 'debug';
            this.logger[nettingLogLevel](
              {
                poolId: batch.poolId,
                intentCount: batch.intents.length,
                aToBCount: escrowInfos.filter(e => e.direction === 'AToB').length,
                bToACount: escrowInfos.filter(e => e.direction === 'BToA').length,
                grossAToB: grossA.toString(),
                grossBToA: grossB.toString(),
                netAToB: plan.netAToB.toString(),
                netBToA: plan.netBToA.toString(),
                completeFills: plan.completeFills,
                partialFills: plan.partialFills,
                ammOutput: plan.ammOutput.toString(),
                hasOpposing,
                nettingSavings: hasOpposing
                  ? `${100 - Number((plan.netAToB + plan.netBToA) * 100n / (grossA + grossB + 1n))}% of flow cross-matched`
                  : 'N/A (single direction)',
              },
              hasOpposing
                ? '⚡ NettingEngine: opposing intents detected — cross-matching analysis'
                : 'NettingEngine analysis (single direction — no netting possible)',
            );

            // Log individual fill allocations (debug — fires per intent per cycle)
            for (const fill of plan.fills) {
              this.logger.debug(
                {
                  escrow: `${fill.escrow.txHash.slice(0, 12)}…#${fill.escrow.outputIndex}`,
                  direction: fill.escrow.direction,
                  inputConsumed: fill.inputConsumed.toString(),
                  outputDelivered: fill.outputDelivered.toString(),
                  isComplete: fill.isComplete,
                  owner: fill.escrow.ownerAddress.slice(0, 20) + '…',
                },
                'NettingEngine fill allocation',
              );
            }
          }
        } catch (err) {
          this.logger.debug({ err, poolId: batch.poolId }, 'NettingEngine analysis failed (non-fatal)');
        }
      }
    }

    // Phase 4: Process each batch.
    // The on-chain pool validator accepts only a single swap direction per TX
    // (protocol fees accrue on one side). For mixed-direction batches, we split
    // into same-direction sub-batches and process each as a single TX.
    // Same-direction intents within a sub-batch are settled atomically.
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

      // Classify intents by direction
      let aToBIntents: typeof batch.intents = [];
      let bToAIntents: typeof batch.intents = [];

      if (this.poolRepo) {
        const pool = await this.poolRepo.findById(batch.poolId);
        if (pool) {
          const poolAssetA = pool.assetAPolicyId
            ? `${pool.assetAPolicyId}.${pool.assetAAssetName}` : '';
          for (const intent of batch.intents) {
            if (intent.inputAsset === poolAssetA) {
              aToBIntents.push(intent);
            } else {
              bToAIntents.push(intent);
            }
          }
        } else {
          // Fallback: treat all as same direction
          aToBIntents = batch.intents;
        }
      } else {
        aToBIntents = batch.intents;
      }

      // Build sub-batches: same-direction intents go together
      const subBatches: Array<{ intents: typeof batch.intents; label: string }> = [];
      if (aToBIntents.length > 0) subBatches.push({ intents: aToBIntents, label: 'AToB' });
      if (bToAIntents.length > 0) subBatches.push({ intents: bToAIntents, label: 'BToA' });

      if (subBatches.length > 1) {
        this.logger.info(
          {
            poolId: batch.poolId,
            aToBCount: aToBIntents.length,
            bToACount: bToAIntents.length,
          },
          '⚡ Mixed-direction batch → splitting into same-direction sub-batches',
        );
      }

      for (const subBatch of subBatches) {
        if (subBatch.intents.length > 1) {
          // ── BATCH SETTLEMENT: multiple same-direction intents in one TX ──
          this.logger.debug(
            { poolId: batch.poolId, direction: subBatch.label, intentCount: subBatch.intents.length },
            'Settling batch of same-direction intents in single TX',
          );

          const subBatchGroup: typeof batch = {
            ...batch,
            intents: subBatch.intents,
            totalInputAmount: subBatch.intents.reduce((s, i) => s + (i.remainingInput > 0n ? i.remainingInput : i.inputAmount), 0n),
            totalOutputAmount: 0n, // Will be computed by buildSettlementTx
          };

          const refs = subBatch.intents.map(i => i.utxoRef);
          this.collector.markProcessing(refs);
          try {
            const anyPartial = subBatch.intents.some(i => {
              const k = `${i.utxoRef.txHash}#${i.utxoRef.outputIndex}`;
              return routes.get(k)?.isPartialFill ?? false;
            });
            await this.settleBatch(subBatchGroup, anyPartial);
            await sleep(2000);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const isValidatorCrash =
              errMsg.includes('validator crashed') || errMsg.includes('exited prematurely');

            // When a multi-intent batch crashes the validator, bisect:
            // settle each intent individually so healthy ones still process
            // and the bad escrow(s) are identified and tracked.
            if (isValidatorCrash && subBatch.intents.length > 1) {
              this.logger.warn(
                { poolId: batch.poolId, direction: subBatch.label, intentCount: subBatch.intents.length },
                'Batch validator crash — bisecting: retrying each intent solo',
              );
              for (const solo of subBatch.intents) {
                const escrowKey = `${solo.utxoRef.txHash}#${solo.utxoRef.outputIndex}`;
                const crashCount = this.validatorCrashCounts.get(escrowKey) ?? 0;
                if (crashCount >= SolverEngine.MAX_VALIDATOR_CRASHES) {
                  this.logger.warn(
                    { escrowKey, crashCount },
                    'Skipping escrow — validator crash limit reached; intent likely structurally unsettleable',
                  );
                  continue;
                }
                const soloBatch: typeof batch = {
                  ...batch,
                  intents: [solo],
                  totalInputAmount: solo.remainingInput > 0n ? solo.remainingInput : solo.inputAmount,
                  totalOutputAmount: 0n,
                };
                // ⚡ VÁ LỖ HỔNG: Kiểm tra lợi nhuận trước khi chạy Solo ⚡
                const soloSurplus = this.batchBuilder.calculateSurplus(soloBatch);
                if (soloSurplus < this.config.minProfitLovelace) {
                  this.logger.warn(
                    { escrowKey, surplus: soloSurplus.toString(), minRequired: this.config.minProfitLovelace.toString() },
                    'Solo intent not profitable enough to settle individually after bisect, skipping',
                  );
                  // Không tính là crash, chỉ là không đủ lời để chạy solo lúc này
                  continue; 
                }
                try {
                  await this.settleBatch(soloBatch, routes.get(escrowKey)?.isPartialFill ?? false);
                  await sleep(2000);
                } catch (soloErr) {
                  const soloMsg = soloErr instanceof Error ? soloErr.message : String(soloErr);
                  const isSoloCrash =
                    soloMsg.includes('validator crashed') || soloMsg.includes('exited prematurely');
                  if (isSoloCrash) {
                    const newCount = crashCount + 1;
                    this.validatorCrashCounts.set(escrowKey, newCount);
                    this.logger.error(
                      { escrowKey, crashCount: newCount, max: SolverEngine.MAX_VALIDATOR_CRASHES },
                      newCount >= SolverEngine.MAX_VALIDATOR_CRASHES
                        ? 'Escrow permanently skipped after repeated validator crashes'
                        : 'Solo validator crash — will retry next iteration',
                    );
                  } else {
                    this.logger.error(
                      { soloErr, poolId: batch.poolId, escrowKey },
                      'Failed to settle solo intent after bisect',
                    );
                  }
                }
              }
            } else {
              this.logger.error(
                { err, poolId: batch.poolId, direction: subBatch.label, intentCount: subBatch.intents.length },
                'Failed to settle sub-batch',
              );
            }
          } finally {
            this.collector.clearProcessing(refs);
          }
        } else {
          // ── SINGLE INTENT ──
          const singleIntent = subBatch.intents[0];
          const intentKey = `${singleIntent.utxoRef.txHash}#${singleIntent.utxoRef.outputIndex}`;
          const route = routes.get(intentKey);
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
                direction: subBatch.label,
                actualInput: actualInput.toString(),
                actualOutput: actualOutput.toString(),
                remainingInput: singleIntent.remainingInput.toString(),
              },
              'Processing partial fill for intent',
            );
          }

          const refs = [singleIntent.utxoRef];
          this.collector.markProcessing(refs);
          // ⚡ VÁ LỖ HỔNG 2: Kiểm tra lợi nhuận cho Single Intent ⚡
          const singleSurplus = this.batchBuilder.calculateSurplus(singleBatch);
          if (singleSurplus < this.config.minProfitLovelace) {
            this.logger.debug(
              { utxoRef: intentKey, surplus: singleSurplus.toString() },
              'Single intent not profitable enough to settle individually, skipping',
            );
            this.collector.clearProcessing(refs); // Nhớ clearProcessing trước khi thoát
            continue;
          }

          try {
            await this.settleBatch(singleBatch, isPartialFill);
            await sleep(2000);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const isValidatorCrash =
              errMsg.includes('validator crashed') || errMsg.includes('exited prematurely');
            const escrowKey = intentKey;
            if (isValidatorCrash) {
              const crashCount = (this.validatorCrashCounts.get(escrowKey) ?? 0) + 1;
              this.validatorCrashCounts.set(escrowKey, crashCount);
              this.logger.error(
                { escrowKey, crashCount, max: SolverEngine.MAX_VALIDATOR_CRASHES, poolId: batch.poolId },
                crashCount >= SolverEngine.MAX_VALIDATOR_CRASHES
                  ? 'Escrow permanently skipped after repeated validator crashes'
                  : 'Solo intent validator crash — will retry next iteration',
              );
            } else {
              this.logger.error(
                { err, poolId: batch.poolId, utxoRef: intentKey },
                'Failed to settle single intent',
              );
            }
          } finally {
            this.collector.clearProcessing(refs);
          }
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

        this.logger.debug(
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
        // Submit via TxSubmitter queue — serial submission prevents UTxO contention
        // between SolverEngine, OrderExecutorCron and ReclaimKeeperCron sharing the same wallet.
        let submittedTxHash: string;
        try {
          submittedTxHash = await TxSubmitter.getInstance(180_000, 2_000).submit({
            label: `settlement pool=${batch.poolId} intents=${batch.intents.length} attempt=${attempt}`,
            signAndSubmit: async () => {
              try {
                return await this.signAndSubmitTx(txResult.unsignedTx);
              } catch (signErr) {
                const signMsg = signErr instanceof Error ? signErr.message : String(signErr);
                // "All inputs are spent" / "already been included": TX already landed on-chain
                // (e.g. a previous retry succeeded). Return known txHash so TxSubmitter
                // proceeds to awaitTx normally instead of treating it as a failure.
                if (
                  signMsg.includes('All inputs are spent') ||
                  signMsg.includes('already been included')
                ) {
                  this.logger.info(
                    { txHash: txResult.txHash, poolId: batch.poolId },
                    'TX already included on-chain — skipping re-submit, awaiting confirmation',
                  );
                  return txResult.txHash;
                }
                // Genuine sign/submit failure — revert FILLING → ACTIVE before propagating
                for (const intent of batch.intents) {
                  const intentId = await this.resolveIntentId(
                    intent.utxoRef.txHash,
                    intent.utxoRef.outputIndex,
                  );
                  if (intentId) {
                    await this.intentRepo.updateStatus(intentId, 'ACTIVE');
                  }
                }
                throw new Error(`TX sign/submit failed: ${signMsg}`);
              }
            },
          });
        } catch (submitErr) {
          const submitMsg = submitErr instanceof Error ? submitErr.message : String(submitErr);
          // TxSubmitter throws "not confirmed within Nms" on awaitTx timeout.
          // IMPORTANT: Do NOT revert to ACTIVE — the TX may still confirm on-chain
          // which would consume the escrow UTxO. Keep FILLING and store txHash.
          if (submitMsg.includes('not confirmed within')) {
            this.logger.warn(
              { txHash: txResult.txHash },
              'Settlement TX not confirmed within 180s — keeping FILLING status (TX may still confirm)',
            );
            for (const intent of batch.intents) {
              const intentId = await this.resolveIntentId(
                intent.utxoRef.txHash,
                intent.utxoRef.outputIndex,
              );
              if (intentId) {
                const dbIntent = await this.intentRepo.findById(intentId);
                if (dbIntent) {
                  dbIntent.markPendingSettlement(txResult.txHash);
                  await this.intentRepo.save(dbIntent);
                }
              }
            }
            return;
          }
          throw submitErr; // propagate to outer retry catch
        }

        // Track last submitted TX hash for admin monitoring
        this.lastTxHash = submittedTxHash;

        this.logger.info(
          { txHash: submittedTxHash, poolId: batch.poolId },
          'Settlement TX confirmed on-chain — updating DB',
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
        const errMsg = err instanceof Error ? err.message : String(err);
        // "validator crashed / exited prematurely" is a Plutus script simulation
        // failure — the tx structure is fundamentally wrong for these inputs.
        // Retrying with the same inputs will always produce the same result.
        // Break immediately to avoid burning all maxRetries slots uselessly.
        const isValidatorCrash =
          errMsg.includes('validator crashed') ||
          errMsg.includes('exited prematurely');

        if (isValidatorCrash) {
          // Revert FILLING → ACTIVE so intents remain processable (bisect will handle them)
          for (const intent of batch.intents) {
            try {
              const intentId = await this.resolveIntentId(
                intent.utxoRef.txHash,
                intent.utxoRef.outputIndex,
              );
              if (intentId) {
                await this.intentRepo.updateStatus(intentId, 'ACTIVE');
              }
            } catch { /* best-effort */ }
          }
          this.logger.error(
            { poolId: batch.poolId, intentCount: batch.intents.length, error: errMsg },
            'Validator simulation crashed — aborting retries (non-retryable)',
          );
          throw err; // propagate immediately; no point retrying
        }

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
// review
// . Thuật toán tìm kiếm nhị phân trong RouteOptimizer.ts
// Vấn đề: Khi một lệnh quá lớn làm trượt giá (Slippage) vượt mức cho phép, làm sao để biết nên khớp bao nhiêu % là tối ưu nhất?

// Cách bạn giải quyết: Bạn dùng Binary Search (Tìm kiếm nhị phân) trong hàm calculateMaxIntentFill (kết hợp AmmMath.ts).

// Đánh giá: Đây là tư duy thuật toán cực kỳ sắc bén. Thay vì hardcode cắt giảm 50% một cách máy móc, bạn để máy tính tự dò dẫm giới hạn cao nhất có thể khớp. Rất ít Junior/Mid-level dev nghĩ ra cách này.

// B. Cơ chế Netting Engine (Khớp lệnh nội bộ)
// Ý tưởng: Gom phe Mua và phe Bán lại, bù trừ cho nhau (Cross-match) và chỉ mang "phần dư" (Net flow) đi giao dịch với AMM Pool.

// Đánh giá: Đây là mô hình của các sàn DEX thế hệ mới (như CowSwap). Dù hiện tại Smart Contract của bạn chưa hỗ trợ gộp 2 chiều vào 1 TX (bạn đã chú thích rất rõ ở dòng 165 SolverEngine.ts), nhưng việc bạn thiết kế sẵn Engine này cho thấy bạn có tầm nhìn xa về việc tối ưu hóa thanh khoản và phí mạng.

// C. Hàng đợi TX (TxSubmitter.ts) chống tranh chấp UTxO
// Vấn đề: Cardano xài mô hình UTxO. Nếu 2 con Bot cùng lấy 1 đồng ADA trong ví Solver để làm phí TX, khi gửi lên mạng, 1 TX sẽ bị lỗi "UTxO already spent" (Tranh chấp).

// Cách bạn giải quyết: Thiết kế mẫu Singleton Pattern tạo ra một hàng đợi (Queue). Các TX phải xếp hàng, TX trước báo confirmed xong thì TX sau mới được nộp.

// Đánh giá: Giải quyết triệt để bài toán Concurrency (Đồng thời) cơ bản trên Cardano.

// 3. Cảnh báo Kỹ thuật (Technical Debt) & Hướng Mở rộng
// Hệ thống hiện tại chạy rất hoàn hảo trên một Server đơn lẻ (như Render Free bạn đang dùng). Tuy nhiên, nếu công ty yêu cầu bạn Scale-up (chạy 3-5 server cùng lúc để tăng tốc độ), kiến trúc này sẽ gặp vấn đề:

// Vấn đề In-Memory State (Lưu trạng thái trong RAM):

// processingSet trong IntentCollector: Chống xử lý trùng lặp lệnh.

// validatorCrashCounts trong SolverEngine: Đếm số lần crash của lệnh độc hại.

// queue trong TxSubmitter: Hàng đợi nộp TX.

// Tại sao lại lỗi nếu Scale? Cả 3 biến trên đều là biến cục bộ (lưu trong RAM của Node.js). Nếu bạn chạy 2 server (Instance A và Instance B), chúng sẽ không biết RAM của nhau. Lệnh độc hại có thể bị Instance A khóa, nhưng Instance B vẫn ngây thơ gắp vào và bị crash. Hai Instance cũng có thể lấy trùng UTxO vì hàng đợi TxSubmitter bị tách rời.

// 👉 Giải pháp (Cách trả lời phỏng vấn):
// "Hiện tại đây là bản Proof-of-Concept nên tôi dùng In-Memory State để xử lý Concurrency và Circuit Breaker. Để triển khai Production Multi-instance, tôi sẽ chuyển toàn bộ cấu trúc này sang Redis: Dùng Redis Set cho processingSet, Redis Hash cho crashCounts và dùng Redis Pub/Sub hoặc BullMQ làm hàng đợi phân tán cho TxSubmitter."

// Tổng Kết
// Dự án SolverNet của bạn là một dự án chất lượng cao. Cấu trúc thư mục Clean Architecture, xử lý lỗi tinh tế, các Helper Math chuẩn xác và chú thích (comment) code cực kỳ rõ ràng, chuyên nghiệp.