# SolverNet DEX — Solver Algorithm & Concurrency Design

> **Document Version**: 1.0.0  
> **Status**: Phase 1 — Design  
> **Date**: 2026-02-17  
> **Classification**: Internal — Technical Specification

---

## Table of Contents

1. [Solver Architecture Overview](#1-solver-architecture-overview)
2. [Intent Processing Pipeline](#2-intent-processing-pipeline)
3. [Route Optimization Algorithm](#3-route-optimization-algorithm)
4. [Batch Settlement Strategy](#4-batch-settlement-strategy)
5. [Concurrency Deep Dive](#5-concurrency-deep-dive)
6. [Solver Economics](#6-solver-economics)
7. [Failure Recovery](#7-failure-recovery)
8. [Monitoring & Observability](#8-monitoring--observability)

---

## 1. Solver Architecture Overview

### 1.1 What is a Solver?

A **Solver** is an off-chain service that:
1. **Monitors** the Cardano blockchain for new swap intents (escrow UTxOs)
2. **Finds** optimal execution routes across available liquidity pools
3. **Builds** settlement transactions that fulfill one or more intents
4. **Submits** those transactions to the Cardano network
5. **Earns** a fee for successful settlements

### 1.2 Solver Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     SOLVER ENGINE                          │
│                                                            │
│  ┌──────────────┐                                          │
│  │   Intent     │  Collect active intents from chain       │
│  │  Collector   │  (via Kupo pattern matching)             │
│  └──────┬───────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────┐                                          │
│  │   Intent     │  Filter valid, unexpired intents         │
│  │  Validator   │  Check profitability                     │
│  └──────┬───────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────┐                                          │
│  │    Route     │  Find optimal execution path             │
│  │  Optimizer   │  (direct, multi-hop, split)              │
│  └──────┬───────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────┐                                          │
│  │   Batch      │  Group compatible intents into           │
│  │  Builder     │  settlement transactions                 │
│  └──────┬───────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────┐                                          │
│  │    TX        │  Build Cardano TX with Lucid             │
│  │  Constructor │  (spend escrows + pools + outputs)       │
│  └──────┬───────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌──────────────┐                                          │
│  │  Submitter   │  Sign with solver key & submit           │
│  │              │  (via Ogmios submit endpoint)            │
│  └──────────────┘                                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Intent Processing Pipeline

### 2.1 Main Loop

```typescript
// solver/SolverEngine.ts (pseudocode)

class SolverEngine {
  private readonly BATCH_WINDOW_MS = 5000;  // 5 second batch window
  private readonly MAX_BATCH_SIZE = 15;     // Max intents per TX
  
  async start(): Promise<void> {
    logger.info('Solver engine started');
    
    while (true) {
      try {
        // Phase 1: Collect
        const intents = await this.collector.getActiveIntents();
        
        // Phase 2: Filter
        const validIntents = this.filterValid(intents);
        
        if (validIntents.length === 0) {
          await sleep(this.BATCH_WINDOW_MS);
          continue;
        }
        
        // Phase 3: Group by pool
        const groups = this.groupByPool(validIntents);
        
        // Phase 4: For each pool group, build batch TX
        for (const [poolId, poolIntents] of groups) {
          const batch = poolIntents.slice(0, this.MAX_BATCH_SIZE);
          
          // Phase 5: Optimize routes
          const routes = await this.optimizer.findRoutes(batch);
          
          // Phase 6: Build settlement TX
          const tx = await this.txConstructor.buildSettlement(batch, routes);
          
          // Phase 7: Submit
          const txHash = await this.submitter.submit(tx);
          
          logger.info({ txHash, intentCount: batch.length }, 'Batch settled');
        }
        
        await sleep(this.BATCH_WINDOW_MS);
        
      } catch (error) {
        logger.error(error, 'Solver iteration failed');
        await sleep(this.BATCH_WINDOW_MS * 2); // Back off on error
      }
    }
  }
}
```

### 2.2 Intent Collection (via Kupo)

```typescript
// solver/IntentCollector.ts

class IntentCollector {
  private readonly kupo: KupoClient;
  private readonly escrowScriptHash: string;
  
  async getActiveIntents(): Promise<EscrowIntent[]> {
    // Query Kupo for all UTxOs at the escrow validator address
    const utxos = await this.kupo.getUtxosByAddress(
      this.escrowAddress,
      { unspent: true }
    );
    
    return utxos
      .map(utxo => this.parseEscrowDatum(utxo))
      .filter(intent => intent !== null)
      .filter(intent => !this.isExpired(intent))
      .filter(intent => !this.isAlreadyProcessing(intent));
  }
  
  private parseEscrowDatum(utxo: UTxO): EscrowIntent | null {
    try {
      const datum = Data.from(utxo.datum!) as EscrowDatum;
      return {
        utxoRef: { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
        owner: datum.owner,
        inputAsset: datum.input_asset,
        inputAmount: datum.input_amount,
        outputAsset: datum.output_asset,
        minOutput: datum.min_output,
        deadline: datum.deadline,
        escrowToken: datum.escrow_token,
        remainingInput: datum.remaining_input,
      };
    } catch {
      return null; // Invalid datum, skip
    }
  }
}
```

---

## 3. Route Optimization Algorithm

### 3.1 Route Types

```
Type 1: DIRECT SWAP
  Intent: ADA → HOSKY
  Route:  ADA ─[Pool_ADA/HOSKY]─► HOSKY
  
Type 2: MULTI-HOP (2 hops)
  Intent: HOSKY → MELD
  Route:  HOSKY ─[Pool_ADA/HOSKY]─► ADA ─[Pool_ADA/MELD]─► MELD
  
Type 3: MULTI-HOP (3 hops max)
  Intent: DJED → INDY
  Route:  DJED ─[Pool_ADA/DJED]─► ADA ─[Pool_ADA/INDY]─► INDY

Type 4: SPLIT ROUTE
  Intent: 1000 ADA → HOSKY (large)
  Route:  500 ADA ─[Pool_1]─► HOSKY
          500 ADA ─[Pool_2]─► HOSKY
  (reduces price impact on large trades)
```

### 3.2 Route Finding Algorithm

```typescript
// solver/RouteOptimizer.ts

class RouteOptimizer {
  private pools: Map<string, PoolState>;  // Live pool states from indexer
  
  findBestRoute(intent: EscrowIntent): SwapRoute {
    const candidates: SwapRoute[] = [];
    
    // Strategy 1: Direct swap
    const directPool = this.findDirectPool(
      intent.inputAsset, 
      intent.outputAsset
    );
    if (directPool) {
      const output = this.calculateOutput(
        directPool, 
        intent.inputAmount
      );
      candidates.push({
        type: 'direct',
        hops: [{ pool: directPool, amountIn: intent.inputAmount, amountOut: output }],
        totalOutput: output,
        totalFee: this.calculateFee(directPool, intent.inputAmount),
      });
    }
    
    // Strategy 2: Multi-hop via ADA
    if (!this.isADA(intent.inputAsset) && !this.isADA(intent.outputAsset)) {
      const hop1Pool = this.findDirectPool(intent.inputAsset, ADA);
      const hop2Pool = this.findDirectPool(ADA, intent.outputAsset);
      
      if (hop1Pool && hop2Pool) {
        const midAmount = this.calculateOutput(hop1Pool, intent.inputAmount);
        const finalAmount = this.calculateOutput(hop2Pool, midAmount);
        candidates.push({
          type: 'multi-hop',
          hops: [
            { pool: hop1Pool, amountIn: intent.inputAmount, amountOut: midAmount },
            { pool: hop2Pool, amountIn: midAmount, amountOut: finalAmount },
          ],
          totalOutput: finalAmount,
          totalFee: this.calculateFee(hop1Pool, intent.inputAmount) 
                  + this.calculateFee(hop2Pool, midAmount),
        });
      }
    }
    
    // Strategy 3: Split across multiple pools (for large trades)
    // ... (split routing for reduced price impact)
    
    // Select best route (highest output)
    candidates.sort((a, b) => Number(b.totalOutput - a.totalOutput));
    
    const best = candidates[0];
    if (!best || best.totalOutput < intent.minOutput) {
      throw new InsufficientOutputError(intent, best?.totalOutput);
    }
    
    return best;
  }
  
  // Constant product formula: y = (Rb × Δa × (1 - fee)) / (Ra + Δa × (1 - fee))
  private calculateOutput(pool: PoolState, inputAmount: bigint): bigint {
    const feeMultiplier = 10000n - BigInt(pool.feeNumerator);
    const inputWithFee = inputAmount * feeMultiplier;
    const numerator = pool.reserveB * inputWithFee;
    const denominator = pool.reserveA * 10000n + inputWithFee;
    return numerator / denominator;
  }
}
```

### 3.3 Price Impact Calculation

```typescript
// Price impact = 1 - (actual_rate / spot_rate)
function calculatePriceImpact(
  pool: PoolState, 
  inputAmount: bigint
): number {
  const spotRate = Number(pool.reserveB) / Number(pool.reserveA);
  const outputAmount = calculateOutput(pool, inputAmount);
  const executionRate = Number(outputAmount) / Number(inputAmount);
  
  return 1 - (executionRate / spotRate);
}
```

---

## 4. Batch Settlement Strategy

### 4.1 Batch Construction

```
BATCH SETTLEMENT TRANSACTION

Inputs:
  ┌─────────────────────┐
  │ Escrow UTxO #1      │  (User A: 100 ADA → HOSKY, min 4.9B)
  │ Escrow UTxO #2      │  (User B: 50 ADA → HOSKY, min 2.4B)
  │ Escrow UTxO #3      │  (User C: 200 ADA → HOSKY, min 9.8B)
  │ Pool UTxO           │  (ADA/HOSKY pool, current state)
  │ Solver UTxO         │  (Solver's ADA for TX fees)
  └─────────────────────┘

Reference Inputs:
  ┌─────────────────────┐
  │ Escrow Validator Ref │  (Reference script)
  │ Pool Validator Ref   │  (Reference script)
  │ Settings UTxO        │  (Protocol parameters)
  └─────────────────────┘

Outputs:
  ┌─────────────────────┐
  │ User A Output       │  (≥ 4.9B HOSKY to User A address)
  │ User B Output       │  (≥ 2.4B HOSKY to User B address)
  │ User C Output       │  (≥ 9.8B HOSKY to User C address)
  │ Updated Pool UTxO   │  (New reserves: Ra' = Ra + 350 ADA, Rb' = Rb - 17.1B HOSKY)
  │ Solver Change       │  (Solver's change + earned fees)
  └─────────────────────┘

Minting:
  ┌─────────────────────┐
  │ Burn Intent Token #1│  
  │ Burn Intent Token #2│  
  │ Burn Intent Token #3│  
  └─────────────────────┘
```

### 4.2 Batch Sizing

```typescript
// Execution budget constraints determine max batch size

interface ExecutionBudget {
  cpu: bigint;    // Max: 14,000,000,000 (14B) per TX
  memory: bigint; // Max: 10,000,000 (10M) per TX
}

// Estimated cost per intent in batch:
const PER_INTENT_COST = {
  cpu: 800_000_000n,     // ~800M CPU units per escrow validation
  memory: 400_000n,       // ~400K memory per escrow validation
};

// Pool validation cost (fixed, once per batch):
const POOL_COST = {
  cpu: 1_500_000_000n,   // ~1.5B CPU units for pool constant product check
  memory: 800_000n,       // ~800K memory
};

// Max batch size calculation:
function maxBatchSize(budget: ExecutionBudget): number {
  const availableCpu = budget.cpu - POOL_COST.cpu;
  const availableMem = budget.memory - POOL_COST.memory;
  
  const byCpu = Number(availableCpu / PER_INTENT_COST.cpu);
  const byMem = Number(availableMem / PER_INTENT_COST.memory);
  
  return Math.min(byCpu, byMem, 20); // Hard cap at 20
  // Expected: ~15 intents per batch
}
```

### 4.3 Intent Ordering in Batch

```
Ordering Strategy: FIFO with Size Optimization

1. Sort intents by creation time (oldest first — fairness)
2. Group by swap direction (AtoB vs BtoA — can be netted)
3. Net opposite directions (reduces pool impact):
   
   User A: 100 ADA → HOSKY (buy)
   User D: 5B HOSKY → ADA  (sell)
   
   Net: Only 100 ADA - equivalent_from_sell needs to go through pool
   
4. Apply remaining net flow to pool
5. Distribute outputs proportionally
```

---

## 5. Concurrency Deep Dive

### 5.1 The eUTXO Concurrency Challenge

```
PROBLEM: Traditional AMM on eUTXO

  Time T₀: Pool has reserves (Ra=1000, Rb=50000)
  
  User A builds TX: Swap 10 ADA → HOSKY (consuming Pool UTxO at T₀)
  User B builds TX: Swap 20 ADA → HOSKY (consuming SAME Pool UTxO at T₀)
  
  Both TXs reference the SAME Pool UTxO input.
  
  Only ONE can succeed. The other FAILS with:
  "UTxO already consumed in block"
  
  RESULT: 50% failure rate under load → terrible UX
```

### 5.2 SolverNet's Solution: Intent Separation

```
SOLUTION: Separate user actions from pool interactions

  Time T₀:
  User A creates Escrow UTxO_A: "I have 10 ADA, want ≥490 HOSKY"
  User B creates Escrow UTxO_B: "I have 20 ADA, want ≥980 HOSKY"
  
  ✅ NO CONTENTION — each user creates their OWN UTxO
  
  Time T₁ (5 seconds later):
  Solver collects both intents, builds ONE batch TX:
    Input:  UTxO_A + UTxO_B + Pool UTxO
    Output: User_A(490 HOSKY) + User_B(980 HOSKY) + Pool'
  
  ✅ Pool UTxO consumed only ONCE per batch
  ✅ 100% success rate for user intent creation
  ✅ Solver handles pool contention (can retry if needed)
```

### 5.3 Contention Scenarios & Mitigation

| Scenario | Probability | Impact | Mitigation |
|---|---|---|---|
| **Two solvers, same pool** | Medium | One TX fails | Solver retries with fresh pool state |
| **User cancels during settlement** | Low | Settlement TX fails | Solver excludes and rebuilds |
| **Pool state changes between read and submit** | Medium | Settlement TX may fail | Solver monitors mempool, builds just-in-time |
| **Two users create intents simultaneously** | Zero | No issue | Each user has own UTxO |
| **High frequency intent creation** | N/A | No issue | Users never touch pool UTxO |

### 5.4 Solver Contention Resolution

```typescript
// When our batch TX fails due to pool contention:

async submitWithRetry(tx: Transaction, maxRetries = 3): Promise<TxHash> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.ogmios.submitTx(tx.toCBOR());
    } catch (error) {
      if (isUtxoConflictError(error) && attempt < maxRetries) {
        logger.warn({ attempt }, 'Pool UTxO conflict, rebuilding...');
        
        // 1. Refresh pool state from chain
        const freshPoolState = await this.kupo.getPoolUtxo(poolId);
        
        // 2. Recalculate outputs with new reserves
        const newRoutes = this.optimizer.findRoutes(intents, freshPoolState);
        
        // 3. Rebuild TX
        tx = await this.txConstructor.buildSettlement(intents, newRoutes);
        
        // 4. Random backoff to avoid sync with other solvers
        await sleep(500 + Math.random() * 2000);
        
        continue;
      }
      throw error;
    }
  }
  throw new MaxRetriesExceeded();
}
```

---

## 6. Solver Economics

### 6.1 Revenue Model

```
Solver Revenue = Intent Surplus + Protocol Incentive

Intent Surplus:
  User requests: 100 ADA → min 4,900,000,000 HOSKY
  Solver delivers: 100 ADA → 5,010,000,000 HOSKY (actual output)
  Surplus: 110,000,000 HOSKY (solver keeps this)

Protocol Incentive (Phase 2):
  Protocol treasury allocates rewards to active solvers
  Based on: volume settled, fill rate, response time
```

### 6.2 Solver Cost Structure

| Cost Item | Per Batch | Notes |
|---|---|---|
| **TX Fee** | ~0.5-2.0 ADA | Depends on batch size |
| **Collateral** | 5 ADA (returned) | Required for script execution |
| **Infrastructure** | Fixed monthly | Server + node + storage |
| **Capital** | Variable | ADA for TX fees and collateral |

### 6.3 Profitability Example

```
Batch: 10 intents, total volume 500 ADA → HOSKY

Revenue:
  Average surplus per intent: 0.05 ADA equivalent → 0.50 ADA
  
Costs:
  TX fee: ~1.5 ADA
  
Net Profit: -1.0 ADA (loss on small batches!)

Break-even: Need ~30 intents per batch or higher surplus
(Protocol incentive subsidy covers initial phase)
```

---

## 7. Failure Recovery

### 7.1 Failure Modes

```
┌────────────────────────────────────────────────────────────┐
│                   FAILURE RECOVERY MATRIX                    │
├──────────────────────┬────────────┬────────────────────────┤
│ Failure Mode         │ Impact     │ Recovery               │
├──────────────────────┼────────────┼────────────────────────┤
│ Solver crashes       │ Medium     │ Auto-restart, intents  │
│                      │            │ remain on chain        │
├──────────────────────┼────────────┼────────────────────────┤
│ Pool UTxO contention │ Low        │ Retry with fresh state │
├──────────────────────┼────────────┼────────────────────────┤
│ Ogmios disconnect    │ Medium     │ Reconnect with backoff │
├──────────────────────┼────────────┼────────────────────────┤
│ Cardano node down    │ High       │ Wait for node recovery │
│                      │            │ Intents have deadlines │
├──────────────────────┼────────────┼────────────────────────┤
│ Database failure     │ Medium     │ Rebuild state from     │
│                      │            │ chain (Kupo)           │
├──────────────────────┼────────────┼────────────────────────┤
│ Invalid intent datum │ None       │ Skip (filter out)      │
├──────────────────────┼────────────┼────────────────────────┤
│ Execution budget     │ Low        │ Reduce batch size      │
│ exceeded             │            │                        │
└──────────────────────┴────────────┴────────────────────────┘
```

### 7.2 Circuit Breaker

```typescript
class SolverCircuitBreaker {
  private failures = 0;
  private readonly threshold = 5;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new CircuitOpenError();
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      setTimeout(() => { this.state = 'HALF_OPEN'; }, 30_000);
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
}
```

---

## 8. Monitoring & Observability

### 8.1 Key Metrics

| Metric | Type | Alert Threshold |
|---|---|---|
| `solver_intents_pending` | Gauge | > 50 (backlog building) |
| `solver_intents_filled_total` | Counter | — |
| `solver_batch_size` | Histogram | — |
| `solver_settlement_latency_ms` | Histogram | p95 > 60000 |
| `solver_tx_failures_total` | Counter | > 10/hour |
| `solver_profit_ada` | Gauge | < 0 (losing money) |
| `solver_pool_state_age_ms` | Gauge | > 30000 (stale data) |
| `solver_active_routes` | Gauge | — |
| `ogmios_connection_status` | Gauge | 0 (disconnected) |
| `kupo_sync_progress` | Gauge | < 99.9% |

### 8.2 Structured Logging

```typescript
// Every solver action produces structured JSON log

// Intent collected
logger.info({
  event: 'intent_collected',
  intentRef: 'txHash#outputIndex',
  owner: 'addr1...',
  inputAsset: 'lovelace',
  inputAmount: '100000000',
  outputAsset: 'HOSKY',
  minOutput: '4900000000',
  deadline: 1740000000,
});

// Batch settled
logger.info({
  event: 'batch_settled',
  txHash: 'abc123...',
  intentCount: 10,
  totalInputAda: '500000000',
  totalSlippage: '0.15%',
  solverProfit: '500000',
  executionTimeMs: 1250,
  poolId: 'pool-nft-hash',
  attempt: 1,
});

// Settlement failed
logger.error({
  event: 'settlement_failed',
  error: 'UTxO conflict',
  intentCount: 10,
  poolId: 'pool-nft-hash',
  attempt: 2,
  willRetry: true,
});
```
