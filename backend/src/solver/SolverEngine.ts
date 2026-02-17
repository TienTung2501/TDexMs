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
import type { WsServer } from '../interface/ws/WsServer.js';

export interface SolverConfig {
  batchWindowMs: number;
  maxRetries: number;
  minProfitLovelace: bigint;
  enabled: boolean;
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
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // In full implementation:
        // 1. Build settlement TX via TxBuilder
        // 2. Sign with solver key
        // 3. Submit via Blockfrost
        // 4. Update intent statuses in DB
        // 5. Broadcast WS updates

        this.logger.info(
          {
            poolId: batch.poolId,
            intentCount: batch.intents.length,
            totalInput: batch.totalInputAmount.toString(),
            attempt,
          },
          'Settlement batch ready (TX builder pending deployment)',
        );

        // Update intent statuses to FILLING
        for (const intent of batch.intents) {
          await this.intentRepo.updateStatus(
            `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`,
            'FILLING',
          );
        }

        // TODO: Build and submit TX when validators are deployed
        // const txResult = await this.txBuilder.buildSettlementTx({...});
        // const submitResult = await this.blockfrost.submitTx(txResult.cbor);

        // Broadcast intent updates via WebSocket
        for (const intent of batch.intents) {
          this.wsServer.broadcastIntent({
            intentId: `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`,
            status: 'FILLING',
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
