# SolverNet DEX — Smart Contract Design Document

> **Document Version**: 1.0.0  
> **Status**: Phase 1 — Design  
> **Date**: 2026-02-17  
> **Plutus Version**: V3 (Conway Era)  
> **Language**: Aiken v1.1.x  
> **Classification**: Internal — Technical Specification

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Validator Architecture Overview](#2-validator-architecture-overview)
3. [Validator 1: Factory Validator](#3-validator-1-factory-validator)
4. [Validator 2: Pool Validator](#4-validator-2-pool-validator)
5. [Validator 3: Escrow (Intent) Validator](#5-validator-3-escrow-intent-validator)
6. [Validator 4: Order Validator](#6-validator-4-order-validator)
7. [Minting Policy 1: Pool NFT Policy](#7-minting-policy-1-pool-nft-policy)
8. [Minting Policy 2: LP Token Policy](#8-minting-policy-2-lp-token-policy)
9. [Minting Policy 3: Intent Token Policy](#9-minting-policy-3-intent-token-policy)
10. [Settings Validator (Governance)](#10-settings-validator-governance)
11. [Concurrency Strategy](#11-concurrency-strategy)
12. [Reference Script Strategy](#12-reference-script-strategy)
13. [Security Analysis](#13-security-analysis)
14. [Script Size Budget](#14-script-size-budget)
15. [Testing Strategy](#15-testing-strategy)

---

## 1. Design Philosophy

### 1.1 Core Principles

1. **Minimalism**: Each validator does ONE thing well. Complex logic is decomposed across validators.
2. **Composability**: Validators can be composed in a single transaction (multi-spend).
3. **Determinism**: All validation is deterministic — same inputs always produce same result.
4. **Fail-Safe**: Default behavior is to REJECT. Only explicitly valid conditions pass.
5. **Optimization**: Every byte counts. Use compact datum encodings and avoid redundant checks.

### 1.2 eUTXO Design Patterns Used

| Pattern | Usage | Benefit |
|---|---|---|
| **State Machine** | Pool lifecycle | Predictable state transitions |
| **Beacon Token (NFT)** | Pool identity | Unique, unforgeable pool identification |
| **Thread Token** | Factory state | Continuous state across TXs |
| **Forwarding Minting** | LP tokens | Delegate mint logic to pool validator |
| **Reference Scripts** | All validators | Reduce TX size and fees |
| **Inline Datums** | All UTxOs | Direct datum access without hash lookup |

### 1.3 Naming Conventions

```
Validators:   snake_case (e.g., pool_validator, escrow_validator)
Types:        PascalCase (e.g., PoolDatum, SwapRedeemer)
Functions:    snake_case (e.g., validate_swap, check_output)
Constants:    SCREAMING_SNAKE (via functions returning constants)
```

---

## 2. Validator Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ON-CHAIN VALIDATORS                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  MINTING POLICIES                        │   │
│  │                                                          │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │   │
│  │  │  Pool NFT    │ │  LP Token    │ │  Intent Token    │ │   │
│  │  │  Policy      │ │  Policy      │ │  Policy          │ │   │
│  │  │              │ │              │ │                   │ │   │
│  │  │  1 NFT per   │ │  Mint/Burn   │ │  Auth token for  │ │   │
│  │  │  pool (auth) │ │  on deposit/ │ │  escrow UTxOs    │ │   │
│  │  │              │ │  withdraw    │ │                   │ │   │
│  │  └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘ │   │
│  │         │                │                   │            │   │
│  └─────────┼────────────────┼───────────────────┼────────────┘   │
│            │                │                   │                │
│  ┌─────────▼────────────────▼───────────────────▼────────────┐   │
│  │                  SPENDING VALIDATORS                      │   │
│  │                                                           │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐ │   │
│  │  │   Factory    │ │    Pool      │ │    Escrow         │ │   │
│  │  │  Validator   │ │  Validator   │ │   Validator       │ │   │
│  │  │              │ │              │ │                    │ │   │
│  │  │  Create new  │ │  swap()      │ │  Lock user funds  │ │   │
│  │  │  pools       │ │  deposit()   │ │  with intent      │ │   │
│  │  │              │ │  withdraw()  │ │  params            │ │   │
│  │  │              │ │  update()    │ │                    │ │   │
│  │  │  Stores:     │ │              │ │  cancel() by user │ │   │
│  │  │  Pool        │ │  AMM logic   │ │  fill() by solver │ │   │
│  │  │  registry    │ │  (x*y=k)     │ │                    │ │   │
│  │  └──────────────┘ └──────────────┘ └───────────────────┘ │   │
│  │                                                           │   │
│  │  ┌──────────────┐ ┌──────────────────────────────────────┐│   │
│  │  │   Order      │ │         Settings                     ││   │
│  │  │  Validator   │ │        Validator                     ││   │
│  │  │              │ │                                      ││   │
│  │  │  Limit Order │ │  Protocol parameters                ││   │
│  │  │  DCA Order   │ │  Fee configuration                  ││   │
│  │  │  Stop Loss   │ │  Admin multi-sig                    ││   │
│  │  └──────────────┘ └──────────────────────────────────────┘│   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Validator Dependency Graph

```
Factory Validator
    │
    ├──► Pool NFT Policy (must mint pool NFT)
    ├──► LP Token Policy (initial LP mint)
    └──► Settings Validator (read protocol params)

Pool Validator
    │
    ├──► Pool NFT Policy (verify pool identity)
    ├──► LP Token Policy (mint/burn on deposit/withdraw)
    └──► Settings Validator (fee params)

Escrow Validator
    │
    ├──► Intent Token Policy (auth token)
    └──► Pool Validator (for direct settlement)

Order Validator
    │
    └──► Pool Validator (for order execution)
```

---

## 3. Validator 1: Factory Validator

### 3.1 Purpose
Central registry for all liquidity pools. Manages pool creation and ensures uniqueness of trading pairs.

### 3.2 Datum

```aiken
/// Factory global state — stored at factory UTxO
type FactoryDatum {
  /// NFT identifying this factory UTxO
  factory_nft: AssetClass,
  /// Number of pools created (monotonic counter)
  pool_count: Int,
  /// Admin public key hash (multi-sig in production)
  admin: VerificationKeyHash,
  /// Protocol settings reference
  settings_utxo: OutputReference,
}
```

### 3.3 Redeemer

```aiken
type FactoryRedeemer {
  /// Create a new liquidity pool
  CreatePool {
    asset_a: AssetClass,
    asset_b: AssetClass,
    initial_a: Int,
    initial_b: Int,
    fee_numerator: Int,
  }
  /// Update factory settings (admin only)
  UpdateSettings
}
```

### 3.4 Validation Rules

#### CreatePool
1. ✅ Factory NFT must exist in input AND continue to output
2. ✅ `asset_a < asset_b` (canonical ordering — prevents duplicate pairs)
3. ✅ No existing pool for this pair (checked via pool NFT minting)
4. ✅ Pool NFT is minted (exactly 1 token of pool NFT policy)
5. ✅ LP tokens are minted (initial supply = `√(initial_a × initial_b)`)
6. ✅ Pool UTxO is created with correct datum at pool validator address
7. ✅ `pool_count` incremented by 1 in output datum
8. ✅ Initial liquidity meets minimum threshold (e.g., ≥ 10 ADA equivalent)
9. ✅ Fee numerator within bounds (1-30, i.e., 0.1% to 3%)

#### UpdateSettings
1. ✅ Signed by `admin` key
2. ✅ Factory NFT continues to output
3. ✅ Only `settings_utxo` and `admin` fields can change

---

## 4. Validator 2: Pool Validator

### 4.1 Purpose
Core AMM logic. Manages liquidity deposits, withdrawals, and token swaps using the constant product formula.

### 4.2 Datum

```aiken
/// Pool state — each pool has its own UTxO with this datum
type PoolDatum {
  /// Unique pool identifier (Pool NFT asset class)
  pool_nft: AssetClass,
  /// First asset in the trading pair
  asset_a: AssetClass,
  /// Second asset in the trading pair
  asset_b: AssetClass,
  /// Total LP tokens in circulation
  total_lp_tokens: Int,
  /// Fee numerator (denominator is fixed at 10000)
  /// e.g., 30 = 0.3%
  fee_numerator: Int,
  /// Accumulated protocol fees (asset A)
  protocol_fees_a: Int,
  /// Accumulated protocol fees (asset B)
  protocol_fees_b: Int,
  /// Root K value for manipulation resistance
  /// (√(reserve_a × reserve_b) at last update)
  last_root_k: Int,
}
```

### 4.3 Redeemer

```aiken
type PoolRedeemer {
  /// Execute a token swap
  Swap {
    /// Direction of swap
    direction: SwapDirection,
    /// Minimum output amount (slippage protection, verified on solver side)
    min_output: Int,
  }
  /// Add liquidity to the pool
  Deposit {
    /// Minimum LP tokens expected
    min_lp_tokens: Int,
  }
  /// Remove liquidity from the pool
  Withdraw {
    /// LP tokens being burned
    lp_tokens_burned: Int,
  }
  /// Collect accumulated protocol fees (admin only)
  CollectFees
}

type SwapDirection {
  AToB
  BToA
}
```

### 4.4 Validation Rules

#### Swap

```
                    SWAP VALIDATION
                    
  Input Pool UTxO                Output Pool UTxO
  ┌─────────────────┐           ┌─────────────────┐
  │ Pool NFT: ✓     │           │ Pool NFT: ✓     │
  │ Reserve A: Ra   │──────────►│ Reserve A: Ra'   │
  │ Reserve B: Rb   │   swap    │ Reserve B: Rb'   │
  │ Datum: D        │           │ Datum: D'        │
  └─────────────────┘           └─────────────────┘
  
  Invariant: (Ra' - fee_a) × (Rb' - fee_b) ≥ Ra × Rb
```

1. ✅ Pool NFT exists in input AND continues to output
2. ✅ Pool datum is preserved (only `protocol_fees` may increment)
3. ✅ Constant product invariant holds: `(Ra' - Δfee_a) × (Rb' - Δfee_b) ≥ Ra × Rb`
4. ✅ Fee is correctly calculated: `fee = input_amount × fee_numerator / 10000`
5. ✅ Protocol fee portion is correctly tracked (e.g., 1/6 of LP fee goes to protocol)
6. ✅ Output amount ≥ `min_output` (slippage protection)
7. ✅ Only relevant assets change between input and output pool UTxO
8. ✅ No additional tokens are added to or removed from pool UTxO

#### Deposit

```
  LP wants to deposit proportional amounts of both assets
  
  deposit_ratio = min(Δa / Ra, Δb / Rb)
  lp_minted = total_lp × deposit_ratio
  
  Constraints:
  - Δa / Ra ≈ Δb / Rb (within rounding tolerance)
  - lp_minted ≥ min_lp_tokens
  - LP minting policy mints exactly lp_minted
```

1. ✅ Pool NFT continues to output
2. ✅ Both assets are deposited in correct proportion (± 1 unit rounding)
3. ✅ LP tokens minted equals `floor(total_lp × min(Δa/Ra, Δb/Rb))`
4. ✅ LP minting policy is invoked with correct amount
5. ✅ `total_lp_tokens` in datum updated correctly
6. ✅ lp_minted ≥ `min_lp_tokens`
7. ✅ For first deposit: `lp_minted = √(Δa × Δb) - MINIMUM_LIQUIDITY`
   - MINIMUM_LIQUIDITY (e.g., 1000) is locked forever to prevent pool drain

#### Withdraw

1. ✅ Pool NFT continues to output
2. ✅ LP tokens are burned (verified via minting policy with negative quantity)
3. ✅ Proportional share of each asset is released: `share = lp_burned / total_lp`
4. ✅ `asset_a_out = floor(Ra × share)`, `asset_b_out = floor(Rb × share)`
5. ✅ Remaining reserves match: `Ra' = Ra - asset_a_out`, `Rb' = Rb - asset_b_out`
6. ✅ `total_lp_tokens` decremented correctly in datum
7. ✅ Net reserves after withdrawal are non-negative

#### CollectFees

1. ✅ Signed by protocol admin
2. ✅ Only `protocol_fees_a` and `protocol_fees_b` are zeroed
3. ✅ Correct amounts are removed from pool UTxO value

---

## 5. Validator 3: Escrow (Intent) Validator

### 5.1 Purpose
Holds user funds locked with swap intent parameters. This is the core innovation enabling the intent-based architecture. Each user's intent is a separate UTxO, eliminating concurrency issues.

### 5.2 Datum

```aiken
/// Escrow datum — locked with user funds
type EscrowDatum {
  /// Auth token proving this is a legitimate escrow
  escrow_token: AssetClass,
  /// Owner of the intent (can cancel)
  owner: Address,
  /// Asset being offered (locked in this UTxO)
  input_asset: AssetClass,
  /// Amount being offered
  input_amount: Int,
  /// Asset desired in return
  output_asset: AssetClass,
  /// Minimum acceptable output amount
  min_output: Int,
  /// Deadline (POSIX time in milliseconds)
  /// After this, anyone can reclaim to owner
  deadline: POSIXTime,
  /// Optional: maximum number of partial fills allowed
  max_partial_fills: Int,
  /// Number of fills already executed
  fill_count: Int,
  /// Remaining input amount (for partial fills)
  remaining_input: Int,
}
```

### 5.3 Redeemer

```aiken
type EscrowRedeemer {
  /// Owner cancels the intent and reclaims funds
  Cancel
  /// Solver fills the intent (partially or fully)
  Fill {
    /// Amount of input asset consumed
    input_consumed: Int,
    /// Amount of output asset delivered
    output_delivered: Int,
  }
  /// Reclaim expired intent (anyone can call)
  Reclaim
}
```

### 5.4 Validation Rules

#### Cancel

1. ✅ Transaction is signed by `owner`
2. ✅ Intent token is burned (or sent back to policy UTxO)
3. ✅ Full `input_amount` is returned to `owner` address
4. ✅ No other escrow UTxOs are affected (anti-double-satisfaction)

#### Fill (Complete)

```
  Solver fills entire remaining intent
  
  ┌──────────────────┐         ┌──────────────────┐
  │  Escrow UTxO     │         │  Owner Output    │
  │                  │         │                  │
  │  1000 ADA locked │────────►│  ≥ 500 HOSKY     │
  │  min: 500 HOSKY  │  fill   │  (to owner addr) │
  │  deadline: slot X│         │                  │
  └──────────────────┘         └──────────────────┘
```

1. ✅ Transaction validity range is before `deadline`
2. ✅ `output_delivered ≥ min_output × (input_consumed / input_amount)` (proportional)
3. ✅ Output is paid to `owner` address with correct asset and amount
4. ✅ If full fill: intent token is burned, no continuing UTxO
5. ✅ Input consumed equals `remaining_input` for full fill
6. ✅ **Anti-double-satisfaction**: Output at `owner` address must contain unique datum tag
   matching this specific escrow UTxO's output reference

#### Fill (Partial)

1. ✅ All rules from complete fill PLUS:
2. ✅ `fill_count < max_partial_fills` (prevent grief by micro-fills)
3. ✅ `input_consumed ≥ min_fill_threshold` (e.g., ≥ 10% of remaining)
4. ✅ Continuing UTxO exists at escrow address with updated datum:
   - `remaining_input = previous_remaining - input_consumed`
   - `fill_count = previous_fill_count + 1`
5. ✅ Continuing UTxO has correct remaining value
6. ✅ Intent token continues to the continuing UTxO

#### Reclaim (Expired)

1. ✅ Transaction validity range is AFTER `deadline`
2. ✅ Full remaining amount returned to `owner` address
3. ✅ Intent token is burned

---

## 6. Validator 4: Order Validator

### 6.1 Purpose
Advanced order types (limit orders, DCA, stop-loss) built on top of the intent mechanism. These are long-lived UTxOs that can be partially filled over time.

### 6.2 Datum

```aiken
type OrderDatum {
  /// Order type discriminator
  order_type: OrderType,
  /// Owner address
  owner: Address,
  /// Trading pair
  asset_in: AssetClass,
  asset_out: AssetClass,
  /// Order-specific parameters
  params: OrderParams,
  /// Auth token
  order_token: AssetClass,
}

type OrderType {
  /// Execute when price reaches target
  LimitOrder
  /// Dollar-cost averaging — periodic buys
  DCA
  /// Execute when price drops below threshold
  StopLoss
}

type OrderParams {
  /// For LimitOrder: target price as rational (numerator, denominator)
  target_price: (Int, Int),
  /// For DCA: amount per interval
  amount_per_interval: Int,
  /// For DCA: minimum interval between fills (in slots)
  min_interval: Int,
  /// For DCA: last fill slot
  last_fill_slot: Int,
  /// Total remaining budget
  remaining_budget: Int,
  /// Global deadline
  deadline: POSIXTime,
}
```

### 6.3 Validation Rules

#### LimitOrder Fill
1. ✅ Execution price ≤ `target_price` (for buy) or ≥ `target_price` (for sell)
2. ✅ Output delivered to `owner` address
3. ✅ Order token burned on complete fill

#### DCA Fill
1. ✅ Current slot ≥ `last_fill_slot + min_interval`
2. ✅ Exactly `amount_per_interval` is consumed
3. ✅ Output delivered to `owner` at market rate
4. ✅ Continuing UTxO with updated `last_fill_slot` and `remaining_budget`
5. ✅ If `remaining_budget < amount_per_interval`: final fill, burn token

#### StopLoss Fill
1. ✅ Triggered when price drops below threshold (verified via pool state or oracle)
2. ✅ Full remaining amount converted
3. ✅ Output delivered to `owner`

---

## 7. Minting Policy 1: Pool NFT Policy

### 7.1 Purpose
Ensures each liquidity pool has a unique, unforgeable identity token.

### 7.2 Logic

```aiken
/// Pool NFT Minting Policy
/// 
/// Mint: Exactly 1 token, consumed TX output reference ensures uniqueness
/// Burn: Only when pool is permanently closed (if supported)
fn pool_nft_policy(
  factory_validator_hash: ValidatorHash,
  redeemer: PoolNFTRedeemer,
  ctx: ScriptContext,
) -> Bool {
  // ...
}

type PoolNFTRedeemer {
  /// Mint new pool NFT (during pool creation)
  MintPoolNFT { 
    /// TX output reference consumed to ensure uniqueness
    consumed_utxo: OutputReference 
  }
  /// Burn pool NFT (pool closure — future feature)
  BurnPoolNFT
}
```

### 7.3 Validation Rules

#### Mint
1. ✅ Exactly 1 token minted with this policy
2. ✅ Token name = hash of `consumed_utxo` (ensures global uniqueness)
3. ✅ `consumed_utxo` is actually spent in this transaction
4. ✅ Factory validator is also invoked in this TX (via spending factory UTxO)
5. ✅ Minted NFT goes to the Pool validator address

#### Burn
1. ✅ Signed by protocol admin
2. ✅ Exactly 1 token burned
3. ✅ Pool UTxO value is fully distributed to LP holders

---

## 8. Minting Policy 2: LP Token Policy

### 8.1 Purpose
Manages liquidity provider tokens — minted on deposit, burned on withdrawal. Each pool has its own LP token asset name.

### 8.2 Logic

```aiken
type LPRedeemer {
  /// Mint LP tokens (liquidity deposit)
  MintLP { 
    pool_nft: AssetClass,     // Which pool
    amount: Int,              // Positive: mint, Negative: burn
  }
}
```

### 8.3 Validation Rules (Forwarding Mint Pattern)

The LP token policy delegates ALL validation logic to the Pool Validator:

1. ✅ Pool validator is invoked in the same transaction (pool UTxO is spent/produced)
2. ✅ Pool NFT specified in redeemer exists in a TX input
3. ✅ The amount minted/burned matches what the pool validator datum expects
4. ✅ LP token asset name = Pool NFT asset name (1:1 correspondence)

> **Design Note**: This "forwarding mint" pattern keeps the minting policy tiny (~2KB)
> while reusing the pool validator's comprehensive logic.

---

## 9. Minting Policy 3: Intent Token Policy

### 9.1 Purpose
Authentication tokens for escrow UTxOs. Prevents spoofing of intent UTxOs.

### 9.2 Logic

```aiken
type IntentTokenRedeemer {
  /// Mint intent auth token (user creates intent)
  MintIntentToken { consumed_utxo: OutputReference }
  /// Burn intent auth token (fill or cancel)
  BurnIntentToken
}
```

### 9.3 Validation Rules

#### Mint
1. ✅ Exactly 1 token minted
2. ✅ Token name = hash of `consumed_utxo`
3. ✅ `consumed_utxo` is actually spent
4. ✅ Minted token goes to the Escrow validator address
5. ✅ Datum at escrow UTxO is well-formed

#### Burn
1. ✅ Token exists in a TX input
2. ✅ Exactly 1 token burned

---

## 10. Settings Validator (Governance)

### 10.1 Purpose
Global protocol configuration. Acts as a read-only reference for other validators.

### 10.2 Datum

```aiken
type SettingsDatum {
  /// Protocol admin (multi-sig hash)
  admin: ScriptHash,
  /// Protocol fee percentage (basis points, e.g., 5 = 0.05%)
  protocol_fee_bps: Int,
  /// Minimum pool initial liquidity (in lovelace)
  min_pool_liquidity: Int,
  /// Minimum intent size (in lovelace)
  min_intent_size: Int,
  /// Solver bond requirement (in lovelace) — future
  solver_bond: Int,
  /// Fee collector address
  fee_collector: Address,
  /// Protocol version
  version: Int,
}
```

### 10.3 Redeemer

```aiken
type SettingsRedeemer {
  /// Update protocol parameters
  UpdateSettings
}
```

### 10.4 Validation Rules

1. ✅ Signed by existing `admin` (N-of-M multi-sig)
2. ✅ Settings NFT continues to output
3. ✅ `version` is incremented
4. ✅ `protocol_fee_bps` is within bounds (0-500, i.e., max 5%)
5. ✅ `min_pool_liquidity ≥ 2_000_000` (minimum 2 ADA)

---

## 11. Concurrency Strategy

### 11.1 The Problem

In eUTXO, each UTxO can only be spent once per transaction. If multiple users try to swap against the same pool UTxO simultaneously, all but one transaction will fail.

### 11.2 Multi-Layer Solution

```
┌────────────────────────────────────────────────────────────────┐
│                    CONCURRENCY STRATEGY                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Layer 1: Intent-Based (Primary)                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Users create INDIVIDUAL escrow UTxOs (no contention)    │ │
│  │  Each user's intent is a separate, independent UTxO      │ │
│  │                                                          │ │
│  │  User A ──► EscrowA (own UTxO) ──┐                       │ │
│  │  User B ──► EscrowB (own UTxO) ──┼──► Solver batches     │ │
│  │  User C ──► EscrowC (own UTxO) ──┘    & settles          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Layer 2: Solver Batching                                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Solver aggregates multiple intents into ONE settlement  │ │
│  │  transaction, touching the pool UTxO only ONCE           │ │
│  │                                                          │ │
│  │  Batch TX:                                               │ │
│  │    Inputs:  EscrowA + EscrowB + EscrowC + PoolUTxO      │ │
│  │    Outputs: UserA_out + UserB_out + UserC_out + Pool'    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Layer 3: Pool Splitting (Future — if needed)                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  For extremely high-traffic pairs, pool can be split     │ │
│  │  into N sub-pools that are periodically rebalanced       │ │
│  │                                                          │ │
│  │  Pool_ADA_HOSKY ──► SubPool_1 + SubPool_2 + SubPool_3   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 11.3 Batching Details

| Aspect | Approach |
|---|---|
| **Batch Window** | Solver waits 5-10 seconds to collect intents |
| **Max Batch Size** | ~15-20 intents per TX (execution budget dependent) |
| **Ordering** | Intents sorted by timestamp (FIFO fairness) |
| **Failure Handling** | If batch TX fails, solver retries with smaller batch |
| **Conflict Resolution** | If pool state changed, solver rebuilds with new state |

### 11.4 Why This Eliminates Contention

| Scenario | Traditional AMM | SolverNet |
|---|---|---|
| 100 users swap simultaneously | 99 TX fail (contention on pool UTxO) | 100 intents created independently |
| Pool state changes | All pending TX invalid | Solver adapts, builds new batch |
| Network congestion | TX queue builds up | Intents are durable, processed async |

---

## 12. Reference Script Strategy

### 12.1 Overview

All validators are deployed as **Reference Scripts** (CIP-33) on-chain. Transactions reference them instead of including the full script, saving ~10-15KB per TX.

### 12.2 Deployment UTxOs

```
Reference Script UTxOs (always-locked, never spent):

┌─────────────────────────────────────┐
│  UTxO #1: Pool Validator            │
│  Address: Reference holder addr     │
│  Value: 50 ADA (min UTxO)          │
│  Script: pool_validator.plutus      │
├─────────────────────────────────────┤
│  UTxO #2: Escrow Validator          │
│  Address: Reference holder addr     │
│  Value: 50 ADA (min UTxO)          │
│  Script: escrow_validator.plutus    │
├─────────────────────────────────────┤
│  UTxO #3: Factory Validator         │
│  Address: Reference holder addr     │
│  Value: 50 ADA (min UTxO)          │
│  Script: factory_validator.plutus   │
├─────────────────────────────────────┤
│  UTxO #4: LP Token Policy           │
│  Address: Reference holder addr     │
│  Value: 30 ADA (min UTxO)          │
│  Script: lp_token_policy.plutus     │
├─────────────────────────────────────┤
│  ... (remaining policies)           │
└─────────────────────────────────────┘
```

### 12.3 Version Management

| Version | Strategy |
|---|---|
| **v1 → v2** | Deploy new reference scripts, update factory to point to new validators |
| **Migration** | Existing pools continue with v1 validators, new pools use v2 |
| **Rollback** | Old reference scripts remain on-chain, can switch factory back |

---

## 13. Security Analysis

### 13.1 Threat Model

| # | Threat | Severity | Validator | Mitigation |
|---|---|---|---|---|
| T1 | **Double Satisfaction** | Critical | Escrow | Unique datum tag per escrow output, verified via output reference |
| T2 | **Pool Drain** | Critical | Pool | Constant product invariant check, minimum liquidity lock |
| T3 | **LP Token Inflation** | High | LP Policy | Forwarding mint — only pool validator can authorize |
| T4 | **Intent Theft** | Critical | Escrow | Owner signature required for cancel, output must go to owner |
| T5 | **Sandwich Attack** | High | Escrow | `min_output` enforced on-chain, solver competition |
| T6 | **Flash Loan via Batch** | High | Pool | Batch TX must leave pool in valid state (no intermediate states) |
| T7 | **Rounding Exploit** | Medium | Pool | Round DOWN for user output, round UP for protocol fees |
| T8 | **Expired Intent Theft** | Medium | Escrow | Reclaim sends funds only to `owner` address |
| T9 | **Fake Pool NFT** | High | Pool NFT | One-shot minting from consumed UTxO |
| T10 | **Datum Manipulation** | High | All | Inline datums, output datum fully checked |

### 13.2 Invariant Checks

```
GLOBAL INVARIANTS (enforced across ALL validators):

1. Conservation of Value:
   sum(input_values) = sum(output_values) + fee
   
2. Pool Constant Product:
   Ra' × Rb' ≥ Ra × Rb  (after fee deduction)
   
3. LP Token Supply:
   sum(all_lp_tokens) = pool_datum.total_lp_tokens
   
4. Pool NFT Uniqueness:
   count(pool_nft_tokens_in_existence) = 1 per pool
   
5. Escrow Integrity:
   escrow_output_value ≥ datum.remaining_input (in correct asset)
   
6. Intent Fulfillment:
   output_to_owner ≥ datum.min_output × (consumed / total)
```

### 13.3 Audit Checklist

- [ ] All validators handle the "no-op" case (spending and recreating same UTxO)
- [ ] All datum fields validated on output (not just input)
- [ ] No unbounded loops or recursion
- [ ] All arithmetic checked for overflow (Aiken's Int is arbitrary precision, but check logical bounds)
- [ ] Transaction validity intervals enforced where needed
- [ ] Multi-spend scenarios analyzed (multiple pool/escrow UTxOs in same TX)
- [ ] Minting policies verify correct destination addresses
- [ ] Reference inputs vs. spending inputs clearly distinguished

---

## 14. Script Size Budget

### 14.1 Target Sizes

| Validator | Target Size | Priority |
|---|---|---|
| Pool Validator | < 12 KB | 🔴 Critical (most complex) |
| Escrow Validator | < 8 KB | 🔴 Critical (most used) |
| Factory Validator | < 6 KB | 🟡 Medium |
| Order Validator | < 10 KB | 🟡 Medium |
| Settings Validator | < 3 KB | 🟢 Simple |
| Pool NFT Policy | < 3 KB | 🟢 Simple |
| LP Token Policy | < 2 KB | 🟢 Simple (forwarding) |
| Intent Token Policy | < 2 KB | 🟢 Simple |
| **Total** | **< 46 KB** | |

### 14.2 Optimization Techniques

1. **Shared Utility Functions**: Common checks in library modules
2. **Compact Datum Encoding**: Use integers instead of nested types where possible
3. **Early Exit**: Check cheapest conditions first (fail fast)
4. **Avoid String Operations**: No `trace` in production builds
5. **Inline Small Functions**: Let Aiken compiler inline frequently-used helpers
6. **Reference Scripts**: Amortize script size across all TXs

---

## 15. Testing Strategy

### 15.1 Test Layers

```
┌─────────────────────────────────────────────────┐
│              TESTING PYRAMID                     │
│                                                  │
│                    ╱╲                             │
│                   ╱  ╲         E2E Tests          │
│                  ╱    ╲        (Testnet)           │
│                 ╱──────╲                          │
│                ╱        ╲      Integration Tests  │
│               ╱          ╲     (Emulator)          │
│              ╱────────────╲                       │
│             ╱              ╲   Property Tests     │
│            ╱                ╲  (Aiken native)      │
│           ╱──────────────────╲                    │
│          ╱                    ╲ Unit Tests        │
│         ╱                      ╲(Aiken native)    │
│        ╱────────────────────────╲                 │
└─────────────────────────────────────────────────┘
```

### 15.2 Test Categories

| Category | Tool | What's Tested | Count Target |
|---|---|---|---|
| **Unit** | `aiken check` | Individual validation functions | ~100 tests |
| **Property** | `aiken check` (with fuzzing) | Invariant preservation under random inputs | ~30 properties |
| **Integration** | Lucid + Emulator | Full TX flows (create pool, swap, deposit) | ~40 scenarios |
| **E2E** | Preview Testnet | Real chain interaction with timing | ~15 flows |
| **Security** | Custom harness | Attack scenarios (double-sat, drain, etc.) | ~20 attacks |

### 15.3 Critical Test Scenarios

```
MUST-PASS SCENARIOS:

Pool:
  ✓ swap_preserves_constant_product
  ✓ swap_with_fee_calculated_correctly
  ✓ swap_rejects_below_min_output  
  ✓ deposit_mints_proportional_lp
  ✓ withdraw_burns_lp_returns_proportional
  ✓ first_deposit_locks_minimum_liquidity
  ✓ cannot_drain_pool_via_repeated_small_swaps
  ✓ cannot_deposit_zero_amounts
  ✓ cannot_withdraw_more_than_owned

Escrow:
  ✓ fill_delivers_minimum_output_to_owner
  ✓ partial_fill_continues_with_correct_datum
  ✓ cancel_requires_owner_signature
  ✓ reclaim_only_after_deadline
  ✓ anti_double_satisfaction
  ✓ cannot_fill_expired_intent
  ✓ cannot_steal_from_escrow

Factory:
  ✓ create_pool_pair_uniqueness
  ✓ create_pool_canonical_ordering
  ✓ cannot_create_pool_without_admin

Minting:
  ✓ pool_nft_global_uniqueness
  ✓ lp_mint_only_via_pool_validator
  ✓ intent_token_one_per_escrow
```

---

## Appendix A: Type Reference (Aiken)

```aiken
// === Common Types ===

/// Represents a native token (policy ID + asset name)
/// For ADA: { policy_id: #"", asset_name: #"" }
type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName,
}

/// POSIX timestamp in milliseconds
type POSIXTime = Int

/// Slot number  
type Slot = Int

/// Address type (payment + optional staking)
type Address = cardano/address.Address

/// Transaction hash
type TxHash = Hash<Blake2b_256, Transaction>

/// Output reference (TX hash + output index)
type OutputReference = cardano/transaction.OutputReference
```

## Appendix B: Transaction Execution Budget Estimates

| Operation | CPU (units) | Memory (units) | Est. Fee (ADA) |
|---|---|---|---|
| Create Pool | ~500M | ~2M | ~0.8 |
| Swap (single) | ~200M | ~800K | ~0.3 |
| Swap (batched, 10 intents) | ~2B | ~8M | ~1.5 |
| Deposit Liquidity | ~300M | ~1.2M | ~0.4 |
| Withdraw Liquidity | ~300M | ~1.2M | ~0.4 |
| Create Intent | ~150M | ~600K | ~0.25 |
| Cancel Intent | ~100M | ~400K | ~0.2 |
| Fill Intent (solver) | ~250M | ~1M | ~0.35 |

> **Note**: These are preliminary estimates. Actual values will be determined after implementation and optimization.
