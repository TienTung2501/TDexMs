/**
 * Solver Engine — Main orchestrator
 * Runs the continuous loop: collect → validate → route → batch → settle.
 * Uses Blockfrost for chain interaction (replaces Ogmios).
 */
import { getLogger } from '../config/logger.js';
import { IntentCollector } from './IntentCollector.js';
import { RouteOptimizer } from './RouteOptimizer.js';
import { BatchBuilder } from './BatchBuilder.js';
import type { BlockfrostClient } from '../infrastructure/cardano/BlockfrostClient.js';
import type { IIntentRepository } from '../domain/ports/IIntentRepository.js';
import type { ITxBuilder } from '../domain/ports/ITxBuilder.js';
import type { IChainProvider } from '../domain/ports/IChainProvider.js';
import type { WsServer } from '../interface/ws/WsServer.js';

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

  /** Settle a batch with retry on contention */
  private async settleBatch(batch: import('./BatchBuilder.js').BatchGroup): Promise<void> {
    if (!this.txBuilder || !this.chainProvider) {
      this.logger.warn('TxBuilder or ChainProvider not configured — skipping settlement');
      // Still update statuses so intents aren't stuck
      for (const intent of batch.intents) {
        await this.intentRepo.updateStatus(
          `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`,
          'FILLING',
        );
      }
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

        // Update intent statuses to FILLING
        for (const intent of batch.intents) {
          await this.intentRepo.updateStatus(
            `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`,
            'FILLING',
          );
        }

        // Build the settlement transaction
        // The TxBuilder constructs the unsigned TX that spends escrow UTxOs
        // and interacts with the pool validator
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

        // Submit the signed TX via Blockfrost
        // Note: In production, the solver would sign with its own key
        // For now, we submit the unsigned TX (which won't work without signing)
        // The solver needs its own signing key configured
        const submitResult = await this.chainProvider.submitTx(txResult.unsignedTx);

        if (!submitResult.accepted) {
          throw new Error(`TX rejected: ${submitResult.error}`);
        }

        this.logger.info(
          { txHash: submitResult.txHash, poolId: batch.poolId },
          'Settlement TX submitted',
        );

        // Update intent statuses to FILLED
        for (const intent of batch.intents) {
          await this.intentRepo.updateStatus(
            `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`,
            'FILLED',
          );

          // Broadcast intent updates via WebSocket
          this.wsServer.broadcastIntent({
            intentId: `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`,
            status: 'FILLED',
            settlementTxHash: submitResult.txHash,
            timestamp: Date.now(),
          });
        }

        return; // Success
      } catch (err) {
        if (attempt < this.config.maxRetries) {
          this.logger.warn(
            { attempt, err },
            'Settlement failed, retrying...',
          );
          // Refresh pool state and rebuild routes
          await this.optimizer.refreshPools();
          // Random backoff to desync with competing solvers
          await sleep(500 + Math.random() * 2000);
        } else {
          throw err;
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
