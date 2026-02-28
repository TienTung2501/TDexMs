# SolverNet DEX — System Initialization Report

> **Generated from**: Aiken smart contract source code + TxBuilder implementation  
> **Validators**: 8 unique validators (5 spend + 3 minting policies)  
> **Network**: Cardano Preprod (Plutus V3)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Validator Dependency Graph](#2-validator-dependency-graph)
3. [Initialization Flow](#3-initialization-flow)
4. [NFT Lifecycle & Relationships](#4-nft-lifecycle--relationships)
5. [Datum Structures](#5-datum-structures)
6. [Redeemer Reference](#6-redeemer-reference)
7. [FAQ & Troubleshooting](#7-faq--troubleshooting)

---

## 1. Architecture Overview

SolverNet DEX uses 8 Aiken/Plutus V3 validators organized in a dependency chain:

| Validator | Type | Parameters | Purpose |
|-----------|------|-----------|---------|
| `escrow_validator` | Spend | *(none)* | Holds funds for intent-based swaps |
| `pool_validator` | Spend | `admin_vkh` | AMM constant-product pools |
| `factory_validator` | Spend | `pool_validator_hash` | Pool registry, creation gate |
| `settings_validator` | Spend | `settings_nft: AssetClass` | Protocol parameters (fees, limits) |
| `order_validator` | Spend | `intent_policy_id` | Advanced orders (DCA, limit, stop-loss) |
| `intent_token_policy` | Mint | *(none)* | One-shot tokens for intents + factory NFT |
| `lp_token_policy` | Mint | `pool_hash, factory_hash` | LP tokens for liquidity providers |
| `pool_nft_policy` | Mint | `factory_hash, admin_vkh` | Unique NFTs identifying each pool |

### Key Design Patterns

- **Forwarding Mint**: `lp_token_policy` and `pool_nft_policy` delegate validation to `pool_validator`/`factory_validator` — they check that the referenced spend validator is being invoked in the same transaction.
- **One-Shot Mint**: `intent_token_policy` uses a consumed UTxO reference to guarantee uniqueness — each token can only be minted once for a specific UTxO.
- **NFT Continuity**: `factory_validator` and `settings_validator` check that their NFT token continues from input to output, preventing unauthorized datum modifications.

---

## 2. Validator Dependency Graph

```
           admin_vkh (env)           settings_nft (deploy-time)
              │                            │
  ┌───────────┼────────────┐               │
  │           │            │               ▼
  ▼           ▼            │        settings_validator(settings_nft)
escrow    pool_validator   │        Redeemer: UpdateProtocolSettings
(none)    (admin_vkh)      │
  │           │            │
  │    ┌──────┤            ├───► factory_validator(pool_hash)
  │    │      │            │     Redeemer: CreatePool | UpdateSettings
  │    │      │            │          │
  │    │ ┌────┼────────────┤          │
  │    │ │    │            │          │
  │    │ ▼    │            ▼          │
  │  lp_token │      pool_nft_policy  │
  │  (pool,   │      (factory,admin)  │
  │   factory)│      Mint/Burn        │
  │    │      │            │          │
  │    ▼      ▼            ▼          │
  │    └──► pool_validator ◄──────────┘
  │         Redeemer: Swap | Deposit | Withdraw
  │                  | CollectFees | ClosePool
  │
  │  intent_token_policy (no params, one-shot)
  │    Redeemer: MintIntentToken | BurnIntentToken
  │    NOTE: Also mints factory NFT (shared policy)
  │    │
  │    ▼
  │  order_validator(intent_policy_id)
  │    Redeemer: CancelOrder | ExecuteOrder | ReclaimOrder
  │
  └──► escrow_validator (no params)
       Redeemer: Cancel | Fill | Reclaim
```

### Resolution Order

The backend resolves scripts in this order (each step depends on previous):

1. **escrow_validator** — no parameters
2. **intent_token_policy** — no parameters
3. **pool_validator** — needs `admin_vkh` from env
4. **factory_validator** — needs `pool_validator_hash` (from step 3)
5. **lp_token_policy** — needs `pool_hash` + `factory_hash` (steps 3, 4)
6. **pool_nft_policy** — needs `factory_hash` + `admin_vkh` (step 4 + env)
7. **order_validator** — needs `intent_policy_id` (step 2)
8. **settings_validator** — needs `settings_nft` (AssetClass) — **deferred** until after initial deployment

---

## 3. Initialization Flow

### Prerequisites

- Admin wallet with sufficient ADA (≥50 ADA recommended for preprod)
- Blockfrost API key for the target network
- Backend running with `plutus.json` blueprint available
- Test tokens minted (for pool creation)

### Step 1: Deploy Settings

**Script**: `backend/scripts/deploy-settings.ts`  
**API Endpoint**: `POST /v1/admin/deploy-settings` (via frontend) or direct script  
**Validator**: `settings_validator`  
**What happens**:

1. Backend resolves `settings_validator` from blueprint
2. Constructs `SettingsDatum` with initial protocol parameters
3. Pays datum + min ADA to the settings validator address
4. Admin signs and submits the transaction

**Important**: The current `buildDeploySettingsTx` does **NOT** mint a settings NFT. It simply pays the datum to the validator address. The `settings_nft` parameter of the validator is used for future update validation.

```
Admin Wallet ──── pays SettingsDatum + minADA ───► settings_validator_address
                                                   (UTxO with inline datum)
```

**After this step**: The settings UTxO exists on-chain with protocol parameters.

### Step 2: Deploy Factory

**Script**: `backend/scripts/deploy-factory.ts`  
**API Endpoint**: `POST /v1/admin/factory/build-deploy`  
**Validator**: `factory_validator`  
**Minting Policy**: `intent_token_policy` (one-shot)

**What happens**:

1. Backend selects a UTxO from admin wallet for one-shot uniqueness
2. Mints Factory NFT via `intent_token_policy.MintIntentToken`
3. Constructs `FactoryDatum`:
   - `factory_nft`: the newly minted NFT's AssetClass
   - `pool_count`: 0
   - `admin`: admin's verification key hash
   - `settings_utxo`: OutputReference pointing to the settings UTxO from Step 1
4. Pays Factory NFT + FactoryDatum + min ADA to factory validator address
5. Admin signs and submits

```
intent_token_policy ──── mints Factory NFT ──┐
                                              │
Admin Wallet ──── pays FactoryDatum + NFT ───►│──► factory_validator_address
                                                   (UTxO with NFT + datum)
```

**Critical insight**: The Factory NFT uses `intent_token_policy` — the same parameterless policy used for user intent tokens. This is why blockchain explorers (CardanoScan) show multiple mint transactions under one policy ID: they include both the factory NFT mint and subsequent user intent token mints.

**After this step**: The factory is ready to create pools.

### Step 3: Create Pool

**Script**: `backend/scripts/create-pool.ts`  
**API Endpoint**: `POST /v1/pools/create`  
**Factory Redeemer**: `CreatePool { asset_a, asset_b, initial_a, initial_b, fee_numerator }`  
**Minting**: `pool_nft_policy.MintPoolNFT` + `lp_token_policy.MintOrBurnLP`

**What happens**:

1. Backend reads the factory UTxO (finds the Factory NFT)
2. Validates asset pair ordering (canonical: lower policy_id first → asset_a)
3. Invokes `factory_validator` with `CreatePool` redeemer:
   - Consumes factory UTxO
   - Produces new factory UTxO with `pool_count += 1`
   - Factory NFT must continue to output
4. Mints Pool NFT via `pool_nft_policy.MintPoolNFT`
5. Mints initial LP tokens via `lp_token_policy.MintOrBurnLP`
   - Amount = `sqrt(initial_a × initial_b)` (geometric mean)
6. Creates pool UTxO at `pool_validator` address with `PoolDatum`
7. LP tokens sent to admin wallet

```
factory_validator ──── CreatePool redeemer ──┐
  (consume + re-create with pool_count+1)    │
                                              │
pool_nft_policy ──── MintPoolNFT ───────────┤
                                              │
lp_token_policy ──── MintOrBurnLP ──────────┤
                                              │
Admin Wallet ──── initial_a + initial_b ────►│──► pool_validator_address
                                              │    (UTxO with Pool NFT + PoolDatum)
                                              └──► LP tokens → Admin Wallet
```

**After this step**: The pool is live and accepts swaps, deposits, withdrawals.

### Step 4: (Optional) Update Protocol Settings

**Script**: `backend/scripts/update-settings.ts`  
**API Endpoint**: `POST /v1/admin/settings/build-update-global`  
**Settings Redeemer**: `UpdateProtocolSettings`

**What happens**:

1. Consumes current settings UTxO
2. Validates:
   - Settings NFT continues to output
   - Admin authorized via withdrawal credential
   - Version incremented by exactly 1
   - All numeric fields non-negative
3. Produces new settings UTxO with updated parameters

---

## 4. NFT Lifecycle & Relationships

### Factory NFT

| Field | Value |
|-------|-------|
| **Policy** | `intent_token_policy` (parameterless) |
| **Asset Name** | Derived from consumed UTxO at deploy time |
| **Location** | Locked in `factory_validator` UTxO |
| **Purpose** | Authenticates factory UTxO, ensures NFT continuity on updates |
| **Shared Policy** | Same policy as user intent tokens — explains multiple mints |

### Pool NFTs

| Field | Value |
|-------|-------|
| **Policy** | `pool_nft_policy(factory_hash, admin_vkh)` |
| **Asset Name** | Derived from consumed UTxO at pool creation |
| **Location** | Locked in `pool_validator` UTxO |
| **Purpose** | Uniquely identifies each pool, ensures datum integrity |
| **Minting** | `MintPoolNFT { consumed_utxo }` |
| **Burning** | `BurnPoolNFT` (on `ClosePool`) |

### LP Tokens

| Field | Value |
|-------|-------|
| **Policy** | `lp_token_policy(pool_hash, factory_hash)` |
| **Minting** | `MintOrBurnLP { pool_nft, amount }` |
| **Distribution** | Sent to liquidity provider's wallet |
| **Validation** | Must be associated with a valid Pool NFT |

### Intent Tokens

| Field | Value |
|-------|-------|
| **Policy** | `intent_token_policy` (parameterless) |
| **Minting** | `MintIntentToken { consumed_utxo }` — one per intent |
| **Burning** | `BurnIntentToken` — batch burn allowed |
| **Location** | Locked in `escrow_validator` UTxO alongside swap funds |

### Settings NFT

| Field | Value |
|-------|-------|
| **Usage** | Parameter to `settings_validator(settings_nft: AssetClass)` |
| **Status** | Currently NOT minted during `buildDeploySettingsTx` |
| **Impact** | Without NFT, settings UTxO cannot be spent via validator |
| **Note** | The validator address depends on this NFT's AssetClass |

---

## 5. Datum Structures

### SettingsDatum

```aiken
type SettingsDatum {
  admin: ScriptHash,           // Admin credential (script hash)
  protocol_fee_bps: Int,       // Protocol fee 0-10000 basis points
  min_pool_liquidity: Int,     // Minimum initial pool liquidity (lovelace)
  min_intent_size: Int,        // Minimum intent amount (lovelace)
  solver_bond: Int,            // Bond solver must post (lovelace)
  fee_collector: Address,      // Address receiving collected fees
  version: Int,                // Settings version, increments by 1
}
```

### FactoryDatum

```aiken
type FactoryDatum {
  factory_nft: AssetClass,     // NFT locked in this UTxO
  pool_count: Int,             // Number of pools created so far
  admin: VerificationKeyHash,  // Admin who can create pools / update settings
  settings_utxo: OutputReference, // Reference to settings UTxO
}
```

### PoolDatum

```aiken
type PoolDatum {
  pool_nft: AssetClass,        // NFT identifying this pool
  asset_a: AssetClass,         // First asset (canonical ordering)
  asset_b: AssetClass,         // Second asset
  total_lp_tokens: Int,        // Outstanding LP token supply
  fee_numerator: Int,          // Fee rate in basis points
  protocol_fees_a: Int,        // Accumulated protocol fees (asset A)
  protocol_fees_b: Int,        // Accumulated protocol fees (asset B)
  last_root_k: Int,            // sqrt(reserve_a * reserve_b) safety check
}
```

### EscrowDatum

```aiken
type EscrowDatum {
  intent_asset: AssetClass,    // Intent token locked with the escrow
  owner: Address,              // Who can cancel the intent
  from_asset: AssetClass,      // What they're selling
  to_asset: AssetClass,        // What they want
  min_receive: Int,            // Minimum output amount
  deadline: POSIXTime,         // Expiry timestamp for reclaim
}
```

### OrderDatum

```aiken
type OrderDatum {
  intent_token: AssetClass,    // Intent token for this order
  owner: Address,              // Order creator
  from_asset: AssetClass,      // Input asset
  to_asset: AssetClass,        // Output asset
  total_amount: Int,           // Total order size
  filled_amount: Int,          // How much has been filled
  min_price_num: Int,          // Minimum price (numerator)
  min_price_den: Int,          // Minimum price (denominator)
  deadline: POSIXTime,         // Expiry
  order_type: OrderType,       // DCA | LimitOrder | StopLoss
}
```

---

## 6. Redeemer Reference

### Factory Validator

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `CreatePool { asset_a, asset_b, initial_a, initial_b, fee_numerator }` | Create new liquidity pool | Admin signed, canonical asset ordering, factory NFT continues, pool_count increments |
| `UpdateSettings` | Update factory's settings reference | Admin signed, factory NFT continues |

### Settings Validator

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `UpdateProtocolSettings` | Modify protocol parameters | Settings NFT continues, admin authorized via withdrawal, version +1, non-negative fields |

### Pool Validator

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `Swap { direction, min_output }` | Execute AMM swap | Constant product formula, pool NFT continues, fees calculated, slippage check |
| `Deposit { min_lp_tokens }` | Add liquidity | Proportional deposit, LP tokens minted, pool NFT continues |
| `Withdraw { lp_tokens_burned }` | Remove liquidity | LP tokens burned, proportional withdrawal, pool NFT continues |
| `CollectFees` | Admin collects accumulated protocol fees | Admin signed, fees reset to 0, pool NFT continues |
| `ClosePool` | Remove all liquidity and burn pool NFT | Admin signed, LP supply → 0, pool NFT burned |

### Pool NFT Policy

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `MintPoolNFT { consumed_utxo }` | Mint new pool identity NFT | One-shot (UTxO consumed), factory validator invoked in same TX |
| `BurnPoolNFT` | Burn pool NFT on pool closure | Negative quantity check |

### LP Token Policy

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `MintOrBurnLP { pool_nft, amount }` | Mint or burn LP tokens | Pool validator invoked in same TX (forwarding mint pattern) |

### Intent Token Policy

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `MintIntentToken { consumed_utxo }` | Mint unique intent identifier | One-shot (UTxO consumed), exactly 1 minted |
| `BurnIntentToken` | Burn intent tokens (batch) | All quantities negative |

### Escrow Validator

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `Cancel` | Owner cancels their intent | Owner signed, intent token burned |
| `Fill` | Solver fills the intent | Output meets min_receive, intent token burned, deadline not passed |
| `Reclaim` | Permissionless reclaim after deadline | Deadline passed, funds returned to owner |

### Order Validator

| Redeemer | Purpose | Key Checks |
|----------|---------|------------|
| `CancelOrder` | Owner cancels their order | Owner signed, intent token burned |
| `ExecuteOrder` | Executor partially/fully fills order | Price check, filled_amount updated, deadline not passed |
| `ReclaimOrder` | Permissionless reclaim after deadline | Deadline passed, funds returned to owner |

---

## 7. FAQ & Troubleshooting

### Q: Why does the factory show 4 mint transactions on CardanoScan?

**A**: The Factory NFT is minted using `intent_token_policy` — the same parameterless policy used for user intent tokens. CardanoScan groups all mints by policy ID, so you see:
- 1 mint for the Factory NFT (at deploy)
- N mints for user intent tokens (from swaps)

All under the same policy ID. This is by design — `intent_token_policy` has no parameters, making it deterministic.

### Q: Why can't the settings address be derived without env vars?

**A**: The `settings_validator` takes `settings_nft: AssetClass` as a parameter. This AssetClass (policy_id + asset_name) is only known after the NFT is minted/assigned during deployment. Without `SETTINGS_NFT_POLICY_ID` and `SETTINGS_NFT_ASSET_NAME` environment variables, the backend derives the address using empty/default values — which may differ from the actual deployed address.

**Solution**: After deploying settings, record the NFT's policy_id and asset_name, then set `SETTINGS_NFT_POLICY_ID` and `SETTINGS_NFT_ASSET_NAME` in `.env`.

### Q: Why are there 5 spend validators but 8 total?

**A**: The 8 validators break down as:
- **5 Spend validators**: escrow, pool, factory, settings, order
- **3 Minting policies**: intent_token, lp_token, pool_nft

Each spend validator in Aiken generates both a `.spend` and `.else` handler — the `.else` handler serves as a withdrawal validator for admin authorization patterns.

### Q: What's the canonical asset ordering for pools?

**A**: The factory enforces canonical ordering during `CreatePool`:
- **asset_a** must have a lower `(policy_id, asset_name)` pair
- **asset_b** must have a higher pair
- ADA (`""`, `""`) is always asset_a when paired with any token

This prevents duplicate pools with swapped asset positions.

---

## Scripts Reference

| Script | Purpose | Prerequisites |
|--------|---------|---------------|
| `deploy-settings.ts` | Step 1: Deploy SettingsDatum | Backend running |
| `deploy-factory.ts` | Step 2: Deploy Factory + mint Factory NFT | Settings deployed |
| `create-pool.ts` | Step 3: Create AMM pool | Factory deployed |
| `update-settings.ts` | Update protocol parameters | Settings deployed |
| `collect-fees.ts` | Collect accumulated protocol fees | Pools with fees |
| `read-on-chain-state.ts` | Diagnostic: read all on-chain data | Backend running |
| `test-system.ts` | Full end-to-end system test | Backend running |

### Running Scripts

```bash
# Terminal 1 — Start backend
cd backend && pnpm dev

# Terminal 2 — Run scripts
cd backend
pnpm exec tsx scripts/deploy-settings.ts    # Step 1
pnpm exec tsx scripts/deploy-factory.ts     # Step 2
pnpm exec tsx scripts/create-pool.ts        # Step 3

# Diagnostic
pnpm exec tsx scripts/read-on-chain-state.ts

# Full automated test
pnpm exec tsx scripts/test-system.ts
```
