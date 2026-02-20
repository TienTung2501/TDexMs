# 10 – CLI Debug & Admin Scripts

> **Location:** `frontend/scripts/src/`
> **Runtime:** Node.js 20+ via `npx tsx`
> **Config:** `.env` file in `frontend/scripts/` (copy from `.env.example`)

## Overview

The project includes a comprehensive set of CLI scripts for testing, debugging, and administering the DEX protocol on Cardano Preprod testnet. All scripts use Lucid Evolution for on-chain interaction and share a common API client that connects to the deployed backend.

## Prerequisites

```bash
cd frontend/scripts
cp .env.example .env
# Fill in:
#   WALLET_SEED=<your test wallet mnemonic>
#   BLOCKFROST_URL=https://cardano-preprod.blockfrost.io/api/v0
#   BLOCKFROST_PROJECT_ID=<your blockfrost key>
#   API_BASE=https://tdexms.onrender.com  (or http://localhost:4000)
#   NETWORK=Preprod
```

## Script Catalog

### User Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `health.ts` | Check backend health status | `npx tsx src/health.ts` |
| `quote.ts` | Get a swap quote | `npx tsx src/quote.ts --inputAsset=lovelace --outputAsset=<asset> --amount=5000000` |
| `list-pools.ts` | List all liquidity pools | `npx tsx src/list-pools.ts` |
| `create-pool.ts` | **Create a new pool** | `npx tsx src/create-pool.ts --assetB=<policyId.assetName> --amountA=50000000 --amountB=10000` |
| `deposit-liquidity.ts` | Deposit to existing pool | `npx tsx src/deposit-liquidity.ts --poolId=<id> --amountA=5000000 --amountB=100` |
| `withdraw-liquidity.ts` | Withdraw from pool | `npx tsx src/withdraw-liquidity.ts --poolId=<id> --lpTokens=1000` |
| `create-intent.ts` | Submit a swap intent | `npx tsx src/create-intent.ts --inputAsset=lovelace --outputAsset=<asset> --amount=5000000` |
| `cancel-intent.ts` | Cancel a pending intent | `npx tsx src/cancel-intent.ts --intentId=<id>` |
| `list-intents.ts` | List all intents | `npx tsx src/list-intents.ts [--status=PENDING]` |
| `create-order.ts` | Place limit/DCA/stop-loss order | `npx tsx src/create-order.ts --type=LIMIT --inputAsset=lovelace ...` |
| `cancel-order.ts` | Cancel an active order | `npx tsx src/cancel-order.ts --orderId=<id>` |
| `list-orders.ts` | List all orders | `npx tsx src/list-orders.ts [--status=ACTIVE]` |
| `portfolio.ts` | View portfolio for an address | `npx tsx src/portfolio.ts [--address=<addr>]` |
| `submit-tx.ts` | Submit a signed transaction | `npx tsx src/submit-tx.ts --txCbor=<hex>` |
| `mint-test-tokens.ts` | Mint test tokens for testing | `npx tsx src/mint-test-tokens.ts` |

### Admin Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `admin-status.ts` | Protocol dashboard overview | `npx tsx src/admin-status.ts` |
| `admin-collect-fees.ts` | Collect pool fees | `npx tsx src/admin-collect-fees.ts --poolId=<id>` |
| `admin-update-settings.ts` | Update protocol settings | `npx tsx src/admin-update-settings.ts --feeNumerator=30` |
| `admin-trigger-solver.ts` | Force solver run | `npx tsx src/admin-trigger-solver.ts [--dryRun]` |
| `admin-emergency-shutdown.ts` | Emergency freeze | `npx tsx src/admin-emergency-shutdown.ts --confirm` |

### Debug Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `list-escrow-utxos.ts` | Inspect escrow UTXOs | `npx tsx src/list-escrow-utxos.ts --address=<escrow_addr>` |

## Common Workflow

### 1. Initial Setup: Mint tokens & Create pool

```bash
# Mint test tokens (creates ADA-backed test tokens)
npx tsx src/mint-test-tokens.ts

# Create a pool with the minted tokens
npx tsx src/create-pool.ts \
  --assetA=lovelace \
  --assetB=<policyId>.<assetName> \
  --amountA=100000000 \
  --amountB=50000 \
  --fee=30

# Verify the pool was created
npx tsx src/list-pools.ts
```

### 2. Trading: Submit intents

```bash
# Create a swap intent
npx tsx src/create-intent.ts \
  --inputAsset=lovelace \
  --outputAsset=<policyId>.<assetName> \
  --amount=10000000

# Check intent status
npx tsx src/list-intents.ts --status=PENDING

# The solver will automatically match and settle intents
# Force a solver run if needed:
npx tsx src/admin-trigger-solver.ts
```

### 3. Monitoring: Admin dashboard

```bash
# Full protocol overview
npx tsx src/admin-status.ts

# Check escrow UTXOs for debugging
npx tsx src/list-escrow-utxos.ts --address=<escrow_validator_address>
```

### 4. Emergency: Shutdown protocol

```bash
# Preview what will happen
npx tsx src/admin-emergency-shutdown.ts

# Execute shutdown (requires --confirm)
npx tsx src/admin-emergency-shutdown.ts --confirm

# To resume, update settings
npx tsx src/admin-update-settings.ts --solverMode=auto
```

## Shared Library (`shared.ts`)

All scripts import from `shared.ts` which provides:

- **`apiFetch<T>(path, options)`** – HTTP client targeting the backend API
- **`log(label, data)`** – Pretty-printed JSON logging
- **`requireEnv(name)`** – Env var reader with graceful error
- **`parseArgs()`** – CLI argument parser (`--key=value` format)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WALLET_SEED` | Yes | – | Mnemonic seed phrase (24 words) |
| `BLOCKFROST_URL` | Yes | – | Blockfrost API endpoint |
| `BLOCKFROST_PROJECT_ID` | Yes | – | Blockfrost project API key |
| `API_BASE` | No | `https://tdexms.onrender.com` | Backend URL |
| `NETWORK` | No | `Preprod` | Cardano network to use |
| `ESCROW_ADDRESS` | No | – | Escrow validator address for debug scripts |

## Notes

- All TX-signing scripts use `lucid.selectWallet.fromSeed(seed)` – keep `WALLET_SEED` secure
- Admin endpoints (`/admin/*`) may require backend implementation – scripts handle 404 gracefully
- The `--dryRun` flag on admin scripts simulates without submitting to chain
- Pool IDs and Intent IDs can be found via `list-pools.ts` and `list-intents.ts` respectively
