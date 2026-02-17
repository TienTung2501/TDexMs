/**
 * Batch Builder
 * Groups compatible intents and builds settlement transactions.
 */
import { getLogger } from '../config/logger.js';
import type { EscrowIntent } from './IntentCollector.js';
import type { SwapRoute } from './RouteOptimizer.js';

export interface BatchGroup {
  poolId: string;
  intents: EscrowIntent[];
  routes: Map<string, SwapRoute>;
  totalInputAmount: bigint;
  totalOutputAmount: bigint;
}

/** Execution budget constraints for Cardano TX */
const MAX_BATCH_SIZE = 15;
const PER_INTENT_CPU = 800_000_000n;
const PER_INTENT_MEM = 400_000n;
const POOL_COST_CPU = 1_500_000_000n;
const POOL_COST_MEM = 800_000n;
const MAX_TX_CPU = 14_000_000_000n;
const MAX_TX_MEM = 10_000_000n;

export class BatchBuilder {
  private readonly logger;

  constructor() {
    this.logger = getLogger().child({ service: 'batch-builder' });
  }

  /** Calculate max batch size based on execution budget */
  maxBatchSize(): number {
    const availableCpu = MAX_TX_CPU - POOL_COST_CPU;
    const availableMem = MAX_TX_MEM - POOL_COST_MEM;

    const byCpu = Number(availableCpu / PER_INTENT_CPU);
    const byMem = Number(availableMem / PER_INTENT_MEM);

    return Math.min(byCpu, byMem, MAX_BATCH_SIZE);
  }

  /** Group intents by their primary pool for batching */
  groupByPool(
    intents: EscrowIntent[],
    routes: Map<string, SwapRoute>,
  ): BatchGroup[] {
    const groups = new Map<string, BatchGroup>();

    for (const intent of intents) {
      const key = `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`;
      const route = routes.get(key);
      if (!route || route.hops.length === 0) continue;

      // Group by the first hop's pool (primary pool)
      const primaryPoolId = route.hops[0]!.poolId;

      if (!groups.has(primaryPoolId)) {
        groups.set(primaryPoolId, {
          poolId: primaryPoolId,
          intents: [],
          routes: new Map(),
          totalInputAmount: 0n,
          totalOutputAmount: 0n,
        });
      }

      const group = groups.get(primaryPoolId)!;
      group.intents.push(intent);
      group.routes.set(key, route);
      group.totalInputAmount += intent.inputAmount;
      group.totalOutputAmount += route.totalOutput;
    }

    // Sort intents within each group by creation time (FIFO fairness)
    // and limit batch size
    const maxSize = this.maxBatchSize();
    const result: BatchGroup[] = [];

    for (const group of groups.values()) {
      // If group is too large, split into sub-batches
      if (group.intents.length <= maxSize) {
        result.push(group);
      } else {
        for (let i = 0; i < group.intents.length; i += maxSize) {
          const batchIntents = group.intents.slice(i, i + maxSize);
          const batchRoutes = new Map<string, SwapRoute>();
          let inputSum = 0n;
          let outputSum = 0n;

          for (const intent of batchIntents) {
            const k = `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`;
            const r = group.routes.get(k);
            if (r) {
              batchRoutes.set(k, r);
              inputSum += intent.inputAmount;
              outputSum += r.totalOutput;
            }
          }

          result.push({
            poolId: group.poolId,
            intents: batchIntents,
            routes: batchRoutes,
            totalInputAmount: inputSum,
            totalOutputAmount: outputSum,
          });
        }
      }
    }

    this.logger.info(
      { groups: result.length, totalIntents: intents.length },
      'Batches built',
    );

    return result;
  }

  /** Calculate estimated surplus (solver profit) for a batch */
  calculateSurplus(group: BatchGroup): bigint {
    let actualOutput = 0n;
    let minRequired = 0n;

    for (const intent of group.intents) {
      const k = `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`;
      const route = group.routes.get(k);
      if (route) {
        actualOutput += route.totalOutput;
      }
      minRequired += intent.minOutput;
    }

    return actualOutput - minRequired;
  }
}
