# SolverNet DEX — Architecture Overview

> **Document Version**: 1.1.0  
> **Status**: Phase 2 — Implementation Complete  
> **Author**: Solutions Architecture Team  
> **Date**: 2026-02-17  
> **Classification**: Internal — Technical Design Document

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Context & Goals](#2-system-context--goals)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Component Interaction Model](#4-component-interaction-model)
5. [Infrastructure Layer](#5-infrastructure-layer)
6. [Data Flow Architecture](#6-data-flow-architecture)
7. [Security Architecture](#7-security-architecture)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Technology Decisions Record](#10-technology-decisions-record)

---

## 1. Executive Summary

**SolverNet** is an **Intent-Based Decentralized Exchange (DEX)** built on the Cardano blockchain, leveraging the eUTXO model for deterministic and composable trading. Unlike traditional AMM-based DEX designs, SolverNet employs a **Solver-based architecture** where users submit declarative trade intents, and a network of competing Solvers find optimal execution paths across multiple liquidity sources.

### Key Differentiators

| Feature | Traditional AMM DEX | SolverNet |
|---|---|---|
| **Execution Model** | User interacts directly with pool | User submits intent → Solver executes |
| **Price Discovery** | Single pool curve | Aggregation across sources |
| **MEV Protection** | Minimal | Solver competition + batch settlement |
| **Concurrency** | UTxO contention on pool | Intent UTxOs are user-scoped (no contention) |
| **Slippage** | User bears all | Solver guarantees minimum output |

### Protocol Components

```
┌─────────────────────────────────────────────────────────┐
│                     SolverNet Protocol                  │
├──────────────┬──────────────────┬────────────────────────┤
│  Intent Layer │  Solver Layer    │  Settlement Layer      │
│  (User Intents)│  (Off-chain)    │  (On-chain Validators) │
├──────────────┼──────────────────┼────────────────────────┤
│  • Swap       │  • Route Finding │  • Escrow Validator    │
│  • Limit Order│  • Aggregation   │  • Pool Validator      │
│  • DCA        │  • MEV Protection│  • LP Minting Policy   │
│  • Partial Fill│ • Batch Building│  • Factory Validator   │
└──────────────┴──────────────────┴────────────────────────┘
```

---

## 2. System Context & Goals

### 2.1 Business Goals

1. **Optimal Execution**: Users always get the best price across available liquidity
2. **Zero Concurrency Issues**: Eliminate UTxO contention via intent-based design
3. **MEV Resistance**: Solver competition and batch auctions prevent sandwich attacks
4. **Capital Efficiency**: Concentrated liquidity pools with configurable tick ranges
5. **Composability**: On-chain primitives that other protocols can build upon

### 2.2 Technical Goals

1. **Minimal Script Size**: Aiken validators optimized for < 15KB each (Plutus V3)
2. **Low Transaction Fees**: Batch multiple intents per transaction to amortize fees
3. **Deterministic Execution**: Leverage eUTXO model for predictable outcomes
4. **High Availability**: Backend services with 99.9% uptime target
5. **CIP Compliance**: Adhere to CIP-25 (NFT Metadata), CIP-30 (Wallet API), CIP-68 (Rich Token Metadata), CIP-57 (Plutus Blueprint)

### 2.3 Cardano-Specific Constraints

| Constraint | Impact | Mitigation |
|---|---|---|
| **eUTXO Model** | Each UTxO can only be consumed once per TX | Intent-based: each user has own UTxO |
| **Script Size Limit** | ~16KB per script (recommended) | Aiken optimization + reference scripts |
| **Execution Budget** | CPU & Memory limits per TX | Batch sizing calibration |
| **Block Time** | ~20 seconds average | Async intent submission + status polling |
| **Datum Size** | Affects min-ADA-per-UTxO | Compact datum encoding |

---

## 3. High-Level Architecture

### 3.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            USER LAYER                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Next.js Frontend (SPA)                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │   │
│  │  │  Swap UI  │  │ Pool UI  │  │Portfolio │  │ Analytics  │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │   │
│  │       │              │              │               │        │   │
│  │  ┌────┴──────────────┴──────────────┴───────────────┴────┐   │   │
│  │  │            Transaction Builder (Lucid/MeshJS)         │   │   │
│  │  └────────────────────────┬──────────────────────────────┘   │   │
│  │                           │  CIP-30 Wallet API               │   │
│  └───────────────────────────┼──────────────────────────────────┘   │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                     BACKEND SERVICE LAYER                           │
│                              │                                      │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                  API Gateway (Express.js)                    │   │
│  │              Rate Limiting • Auth • CORS • Logging           │   │
│  └──────┬──────────────┬──────────────┬─────────────────────────┘   │
│         │              │              │                              │
│  ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼─────────┐                   │
│  │ Intent      │ │  Solver    │ │  Indexer     │                    │
│  │ Service     │ │  Engine    │ │  Service     │                    │
│  │             │ │            │ │              │                    │
│  │ • Validate  │ │ • Route    │ │ • Sync UTxOs │                    │
│  │ • Submit    │ │ • Optimize │ │ • Track Pools│                    │
│  │ • Track     │ │ • Build TX │ │ • Events     │                    │
│  └──────┬──────┘ └─────┬──────┘ └────┬─────────┘                   │
│         │              │              │                              │
│  ┌──────▼──────────────▼──────────────▼─────────────────────────┐   │
│  │              Transaction Orchestrator                        │   │
│  │         Lucid Evolution • TX Building • Signing              │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                    BLOCKCHAIN INFRASTRUCTURE                        │
│                              │                                      │
│  ┌──────────┐  ┌─────────────▼──────────┐  ┌────────────────────┐  │
│  │          │  │                        │  │                    │  │
│  │  Kupo    │◄─┤    Ogmios (WebSocket)  │  │  Cardano Node      │  │
│  │ (Indexer)│  │    (Chain Sync API)    │──┤  (Mainnet/Testnet) │  │
│  │          │  │                        │  │                    │  │
│  └──────────┘  └────────────────────────┘  └────────────────────┘  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      ON-CHAIN LAYER (Plutus V3)                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Escrow     │  │    Pool      │  │    Factory              │  │
│  │  Validator   │  │  Validator   │  │   Validator             │  │
│  │              │  │              │  │                          │  │
│  │  Hold user   │  │  AMM logic   │  │  Pool creation          │  │
│  │  intents     │  │  (x*y=k)     │  │  & registry             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  LP Token    │  │   Order      │  │   Settings              │  │
│  │  Minting     │  │  Validator   │  │   Validator             │  │
│  │  Policy      │  │              │  │                          │  │
│  │              │  │  Limit/DCA   │  │  Protocol params        │  │
│  │  Mint/Burn   │  │  orders      │  │  & governance           │  │
│  │  LP tokens   │  │              │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Layer Responsibilities

| Layer | Responsibility | Technology |
|---|---|---|
| **User Layer** | UI/UX, wallet connection, TX preview | Next.js 16, React 19, shadcn/ui, Lucid |
| **Backend Service** | Intent processing, solver logic, chain indexing | Node.js (TypeScript), Express, Lucid Evolution |
| **Infrastructure** | Chain data access, TX submission | Ogmios, Kupo, Cardano Node |
| **On-Chain** | TX validation, fund escrow, pool logic | Aiken (Plutus V3) |

---

## 4. Component Interaction Model

### 4.1 Swap Flow (Happy Path)

```
    User                Frontend           Backend              Chain
     │                    │                  │                    │
     │  1. Select swap    │                  │                    │
     │  (ADA → HOSKY)     │                  │                    │
     │───────────────────►│                  │                    │
     │                    │  2. GET /quote   │                    │
     │                    │─────────────────►│                    │
     │                    │                  │  3. Query pools    │
     │                    │                  │  (via Kupo)        │
     │                    │                  │───────────────────►│
     │                    │                  │◄───────────────────│
     │                    │  4. Quote +      │                    │
     │                    │     route info   │                    │
     │                    │◄─────────────────│                    │
     │  5. Review &       │                  │                    │
     │     confirm        │                  │                    │
     │───────────────────►│                  │                    │
     │                    │  6. POST /intent │                    │
     │                    │  (build intent)  │                    │
     │                    │─────────────────►│                    │
     │                    │                  │  7. Build TX       │
     │                    │                  │  (escrow UTxO)     │
     │                    │  8. Unsigned TX  │                    │
     │                    │◄─────────────────│                    │
     │  9. Sign TX        │                  │                    │
     │  (CIP-30 Wallet)   │                  │                    │
     │◄──────────────────►│                  │                    │
     │                    │  10. Submit      │                    │
     │                    │  signed TX       │                    │
     │                    │─────────────────►│                    │
     │                    │                  │ 11. Submit to node │
     │                    │                  │───────────────────►│
     │                    │                  │                    │
     │                    │                  │ 12. Solver picks   │
     │                    │                  │     up intent      │
     │                    │                  │     from chain     │
     │                    │                  │                    │
     │                    │                  │ 13. Solver builds  │
     │                    │                  │     settlement TX  │
     │                    │                  │───────────────────►│
     │                    │                  │◄───────────────────│
     │                    │                  │                    │
     │  14. Poll status   │  15. Check TX   │                    │
     │───────────────────►│─────────────────►│                    │
     │                    │  16. Confirmed!  │                    │
     │◄──────────────────────────────────────│                    │
     │                                       │                    │
```

### 4.2 Liquidity Provision Flow

```
    LP Provider          Frontend           Backend              Chain
     │                    │                  │                    │
     │  1. Select pool    │                  │                    │
     │  (ADA/HOSKY)       │                  │                    │
     │───────────────────►│                  │                    │
     │                    │  2. GET /pool    │                    │
     │                    │  /pool-info      │                    │
     │                    │─────────────────►│                    │
     │                    │  3. Pool state   │                    │
     │                    │◄─────────────────│                    │
     │                    │                  │                    │
     │  4. Input amounts  │                  │                    │
     │  (1000 ADA +       │                  │                    │
     │   500M HOSKY)      │                  │                    │
     │───────────────────►│                  │                    │
     │                    │  5. POST         │                    │
     │                    │  /pool/deposit   │                    │
     │                    │─────────────────►│                    │
     │                    │                  │  6. Build TX       │
     │                    │                  │  (deposit to pool  │
     │                    │                  │   + mint LP tokens)│
     │                    │  7. Unsigned TX  │                    │
     │                    │◄─────────────────│                    │
     │  8. Sign & Submit  │                  │                    │
     │◄──────────────────►│─────────────────►│───────────────────►│
     │                    │                  │                    │
     │  9. LP tokens      │                  │                    │
     │     received       │                  │                    │
     │◄──────────────────────────────────────│◄───────────────────│
     │                                       │                    │
```

### 4.3 Component Communication Matrix

| From → To | Protocol | Format | Auth |
|---|---|---|---|
| Frontend → Backend API | HTTPS (REST) | JSON | Optional JWT + API Key |
| Frontend → Wallet | CIP-30 (browser) | CBOR/Hex | User approval |
| Backend → Ogmios | WebSocket | JSON-WSP | None (private network) |
| Backend → Kupo | HTTP | JSON | None (private network) |
| Backend → Cardano Node | via Ogmios | N2C protocol | None |
| Solver → Chain | TX Submission | CBOR | Solver wallet key |

---

## 5. Infrastructure Layer

### 5.1 Cardano Infrastructure Stack

```
┌────────────────────────────────────────┐
│          Application Services          │
│  (Backend API, Solver Engine, Indexer) │
└──────────┬────────────┬────────────────┘
           │            │
    ┌──────▼──────┐ ┌───▼──────────┐
    │   Ogmios    │ │    Kupo      │
    │ (WebSocket  │ │  (Chain      │
    │  Gateway)   │ │   Indexer)   │
    │             │ │              │
    │ • Chain Sync│ │ • UTxO Index │
    │ • TX Submit │ │ • Pattern    │
    │ • State     │ │   Matching   │
    │   Query     │ │ • Datum Cache│
    └──────┬──────┘ └───┬──────────┘
           │            │
    ┌──────▼────────────▼──────────┐
    │        Cardano Node          │
    │    (cardano-node v10.x)      │
    │                              │
    │ • Consensus (Ouroboros)      │
    │ • Ledger (Babbage/Conway)    │
    │ • Networking (N2N, N2C)     │
    │ • Mempool Management        │
    └──────────────────────────────┘
```

### 5.2 Infrastructure Requirements

| Component | Resource | Mainnet | Preview Testnet |
|---|---|---|---|
| **Cardano Node** | Storage | ~180 GB | ~15 GB |
| | RAM | 24 GB | 8 GB |
| | CPU | 4 cores | 2 cores |
| **Ogmios** | RAM | 512 MB | 256 MB |
| **Kupo** | Storage | ~50 GB (pattern-filtered) | ~5 GB |
| | RAM | 4 GB | 1 GB |
| **Backend API** | RAM | 2 GB | 512 MB |
| **Solver Engine** | RAM | 4 GB | 1 GB |
| | CPU | 4 cores (compute-heavy) | 2 cores |

### 5.3 Why Ogmios + Kupo?

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **Blockfrost** | Zero infra, easy API | Centralized, rate limits, latency | ❌ Not suitable for solver |
| **Koios** | Open, community-run | Still centralized (3rd party) | ❌ Not for production |
| **Ogmios + Kupo** | Self-hosted, low latency, full control | Requires infra management | ✅ **Selected** |
| **Scrolls + Oura** | Flexible event pipeline | More complex setup | 🔄 Future consideration |

---

## 6. Data Flow Architecture

### 6.1 Intent Lifecycle State Machine

```
                    ┌─────────┐
                    │ CREATED │ (User submits intent off-chain)
                    └────┬────┘
                         │ Build & sign escrow TX
                         ▼
                    ┌─────────┐
                    │ PENDING │ (Escrow TX in mempool)
                    └────┬────┘
                         │ TX confirmed on-chain
                         ▼
                    ┌─────────┐
                    │ ACTIVE  │ (Escrow UTxO on-chain, solver can pick up)
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌─────────┐
        │ MATCHED  │ │EXPIRED │ │CANCELLED│
        │(Solver   │ │(Deadline│ │(User    │
        │ found)   │ │ passed) │ │ cancels)│
        └────┬─────┘ └────────┘ └─────────┘
             │
             ▼
        ┌──────────┐
        │ SETTLING │ (Settlement TX in mempool)
        └────┬─────┘
             │
             ▼
        ┌──────────┐
        │ FILLED   │ (Settlement confirmed, user received tokens)
        └──────────┘
```

### 6.2 Data Models

#### Core Entities

```typescript
// Intent (off-chain representation)
interface SwapIntent {
  id: string;                    // UUID
  creator: Address;              // User's wallet address
  inputAsset: Asset;             // e.g., { policyId: "", assetName: "", amount: 1000000n }
  outputAsset: Asset;            // e.g., { policyId: "abc...", assetName: "HOSKY", amount: 0n }
  minOutput: bigint;             // Minimum acceptable output (slippage protection)
  deadline: POSIXTime;           // Expiry timestamp (slot-based)
  status: IntentStatus;
  escrowTxHash?: TxHash;         // TX that created escrow UTxO
  settlementTxHash?: TxHash;     // TX that settled the intent
  createdAt: Date;
  updatedAt: Date;
}

// Liquidity Pool (on-chain state mirror)
interface LiquidityPool {
  id: string;                    // Pool NFT policy ID + asset name
  assetA: Asset;                 // First token in pair
  assetB: Asset;                 // Second token in pair
  reserveA: bigint;              // Current reserve of asset A
  reserveB: bigint;              // Current reserve of asset B
  lpTokenPolicy: PolicyId;       // LP token minting policy
  totalLpTokens: bigint;         // Total LP tokens in circulation
  feeNumerator: number;          // e.g., 3 (for 0.3%)
  feeDenominator: number;        // e.g., 1000
  poolUtxo: UTxO;                // Current pool UTxO reference
}

// User Position
interface LPPosition {
  poolId: string;
  lpTokenAmount: bigint;
  sharePercentage: number;
  valueInAda: bigint;
  unrealizedPnL: bigint;
  depositTxHash: TxHash;
}
```

### 6.3 Backend Data Store

```
┌─────────────────────────────────────────┐
│          PostgreSQL Database            │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │   intents    │  │  pools          │  │
│  │             │  │                 │  │
│  │  id          │  │  id             │  │
│  │  creator     │  │  asset_a_policy │  │
│  │  input_asset │  │  asset_a_name   │  │
│  │  output_asset│  │  asset_b_policy │  │
│  │  min_output  │  │  asset_b_name   │  │
│  │  deadline    │  │  reserve_a      │  │
│  │  status      │  │  reserve_b      │  │
│  │  escrow_txh  │  │  lp_policy      │  │
│  │  settle_txh  │  │  fee_num        │  │
│  │  created_at  │  │  fee_denom      │  │
│  └─────────────┘  │  pool_utxo_ref  │  │
│                    └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ transactions │  │  solver_stats   │  │
│  │             │  │                 │  │
│  │  tx_hash     │  │  solver_addr    │  │
│  │  type        │  │  intents_filled │  │
│  │  pool_id     │  │  volume_ada     │  │
│  │  amount_in   │  │  success_rate   │  │
│  │  amount_out  │  │  avg_fulfillment│  │
│  │  fee_paid    │  │  stake_amount   │  │
│  │  block_no    │  │  last_active    │  │
│  │  slot        │  │                 │  │
│  └─────────────┘  └─────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Smart Contract Security

| Threat | Description | Mitigation |
|---|---|---|
| **Double Satisfaction** | Validator satisfied by unintended UTxO | Unique datum tag per intent + output validation |
| **Datum Hijacking** | Attacker modifies datum in spending TX | Inline datums + datum hash verification |
| **Unauthorized Spending** | Non-owner tries to cancel/spend intent | Signature verification in validator |
| **Oracle Manipulation** | Feeding wrong prices to solver | Multiple oracle sources + TWAP validation |
| **Infinite Mint** | Minting LP tokens without deposit | Minting policy linked to pool validator |
| **Rounding Exploit** | Small trades exploiting integer math | Minimum trade size + proper rounding (always in protocol's favor) |
| **Time-based Attack** | Manipulating validity ranges | Strict slot-based deadlines + reasonable ranges |

### 7.2 Backend Security

| Layer | Measure |
|---|---|
| **API Gateway** | Rate limiting (100 req/min per IP), CORS whitelist, Helmet.js headers |
| **Input Validation** | Zod schema validation on all endpoints |
| **Solver Keys** | HSM or encrypted key storage, never in environment variables |
| **Database** | Parameterized queries (Prisma ORM), connection pooling |
| **Monitoring** | Structured logging, anomaly detection on trade patterns |
| **Infrastructure** | Private network for Ogmios/Kupo, VPN access only |

### 7.3 Frontend Security

| Measure | Implementation |
|---|---|
| **TX Preview** | Display all TX effects before wallet signing |
| **Phishing Protection** | Domain verification, CSP headers |
| **No Private Keys** | All signing via CIP-30 wallet interface |
| **Input Sanitization** | Client + server validation |

---

## 8. Deployment Architecture

### 8.1 Current Production Deployment (Phase 2)

| Service | Platform | URL / Access |
|---|---|---|
| **Backend API** | Render (Docker, Free Tier) | `https://tdexms.onrender.com` |
| **Frontend** | Vercel (Auto-deploy) | Vercel project URL |
| **Database** | Supabase PostgreSQL (Free Tier) | Connection string in Render env |
| **Cache** | Upstash Redis (Serverless) | Connection via `UPSTASH_REDIS_*` env |
| **Blockchain** | Blockfrost (Preprod API) | 50K requests/day free |
| **Keep-alive** | UptimeRobot | Pings `/v1/health` every 5 min |

```
┌──────────────────────────────────────────────────────────┐
│                 CURRENT DEPLOYMENT                       │
├──────────┬──────────────────────────────────────────────┤
│ Frontend │  Vercel CDN (Next.js 16, auto-deploy)        │
│          │  ↓ NEXT_PUBLIC_API_URL                       │
├──────────┼──────────────────────────────────────────────┤
│ Backend  │  Render Docker (node:20-alpine)              │
│          │  Express + Prisma + Solver Engine             │
│          │  ↓ DATABASE_URL    ↓ BLOCKFROST_API_KEY      │
├──────────┼──────────────────────────────────────────────┤
│ Database │  Supabase PostgreSQL (Preprod)                │
│ Cache    │  Upstash Redis (Serverless)                  │
│ Chain    │  Blockfrost API (Cardano Preprod)             │
├──────────┼──────────────────────────────────────────────┤
│ Monitor  │  UptimeRobot → GET /v1/health (5 min)       │
└──────────┴──────────────────────────────────────────────┘
```

### 8.2 Environment Strategy

```
┌──────────────────────────────────────────────────────────┐
│                    ENVIRONMENTS                          │
├──────────┬──────────────┬──────────────┬─────────────────┤
│   Local  │    Preview   │   Staging    │   Production    │
│          │   (Testnet)  │  (Pre-prod)  │   (Mainnet)     │
├──────────┼──────────────┼──────────────┼─────────────────┤
│ pnpm dev │ Vercel       │ Render +     │ Render +        │
│ (backend │ Preview      │ Vercel       │ Vercel          │
│  +front) │              │ (Preprod)    │ (Mainnet)       │
│          │              │              │                 │
│ Blockfrost│ Blockfrost  │ Blockfrost   │ Blockfrost/     │
│ Preprod  │ Preprod      │ Preprod      │ Ogmios+Kupo    │
│          │              │              │                 │
│ Supabase │ Supabase     │ Supabase     │ PostgreSQL      │
│ (shared) │ (shared)     │ (dedicated)  │ (HA cluster)    │
└──────────┴──────────────┴──────────────┴─────────────────┘
```

### 8.3 CI/CD Pipeline

```
  Push to branch
       │
       ▼
  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  Lint &  │───►│  Unit    │───►│ Integr.  │───►│  E2E     │
  │  Format  │    │  Tests   │    │  Tests   │    │  Tests   │
  └─────────┘    └──────────┘    └──────────┘    └──────────┘
       │              │               │               │
       │         Aiken check    Aiken test      Testnet deploy
       │         TS compile     + property      + Puppeteer
       │         ESLint         tests           flow tests
       │                                              │
       ▼                                              ▼
  ┌──────────────────────────────────────────────────────┐
  │              Deploy to Target Environment            │
  │  Render: auto-deploy on push (Docker build)          │
  │  Vercel: auto-deploy on push (Next.js build)         │
  └──────────────────────────────────────────────────────┘
```

---

## 9. Non-Functional Requirements

### 9.1 Performance

| Metric | Target | Measurement |
|---|---|---|
| **Quote Response** | < 200ms (p95) | API latency |
| **Intent Submission** | < 500ms (p95) | API + TX build time |
| **Settlement Time** | < 60s after confirmation | Solver processing |
| **Frontend Load** | < 2s (LCP) | Lighthouse |
| **Frontend Interaction** | < 100ms (INP) | Core Web Vitals |

### 9.2 Scalability

| Component | Strategy |
|---|---|
| **Backend API** | Horizontal scaling (stateless, behind load balancer) |
| **Solver Engine** | Multiple solver instances competing |
| **Database** | Read replicas for query load |
| **Indexer** | Event-driven sync with Kupo patterns |
| **Frontend** | Static generation + ISR (Next.js) |

### 9.3 Availability

| Tier | Target | Components |
|---|---|---|
| **Critical** | 99.9% | Backend API, Database |
| **High** | 99.5% | Solver Engine, Indexer |
| **Best Effort** | 99% | Frontend (CDN-backed) |
| **External** | N/A | Cardano Node (blockchain uptime) |

### 9.4 Observability

```
┌─────────────────────────────────────────┐
│           Observability Stack           │
├─────────────┬───────────┬───────────────┤
│   Metrics   │   Logs    │   Traces      │
│ (Prometheus)│ (Pino +   │ (OpenTelemetry│
│             │  Loki)    │  + Jaeger)    │
├─────────────┼───────────┼───────────────┤
│ • API rates │ • Request │ • TX lifecycle│
│ • TX times  │   logs    │ • Intent flow │
│ • Pool TVL  │ • Errors  │ • Solver route│
│ • Solver    │ • Chain   │   finding     │
│   success%  │   events  │               │
└─────────────┴───────────┴───────────────┘
          │
          ▼
    ┌──────────┐
    │ Grafana  │ (Dashboards & Alerts)
    └──────────┘
```

---

## 10. Technology Decisions Record

### TDR-001: Intent-Based vs Pure AMM

| | Decision |
|---|---|
| **Status** | ✅ Accepted |
| **Context** | Cardano's eUTXO creates concurrency issues with traditional AMM pools (single UTxO contention) |
| **Decision** | Adopt intent-based architecture where user intents are separate UTxOs, solved by off-chain solvers |
| **Rationale** | Eliminates contention (each user = own UTxO), enables MEV protection, supports aggregation |
| **Consequences** | Requires solver infrastructure, slightly longer settlement time |

### TDR-002: Aiken over PlutusTx/Plutarch

| | Decision |
|---|---|
| **Status** | ✅ Accepted |
| **Context** | Need optimized Plutus V3 validators with minimal script size |
| **Decision** | Use Aiken as primary smart contract language |
| **Rationale** | Better optimization (smaller scripts), Rust-like syntax, built-in testing, active ecosystem |
| **Consequences** | Team needs Aiken expertise, limited to Aiken stdlib |

### TDR-003: Blockfrost API (replacing self-hosted Ogmios + Kupo)

| | Decision |
|---|---|
| **Status** | ✅ Accepted (updated for Phase 2) |
| **Context** | Self-hosted Ogmios + Kupo requires ~32 GB RAM and ~120 GB disk; not feasible for free-tier deployment |
| **Decision** | Use Blockfrost API for chain interaction (Preprod network) |
| **Rationale** | 50K free requests/day, zero infrastructure, paired with Upstash Redis cache to reduce calls by ~60-70% |
| **Consequences** | Rate limited (10 req/s), vendor dependency; can migrate to self-hosted Ogmios+Kupo for mainnet |
| **Original Plan** | Self-host Ogmios + Kupo for sub-10ms query latency and full UTxO index |

### TDR-004: Lucid Evolution for TX Building

| | Decision |
|---|---|
| **Status** | ✅ Accepted |
| **Context** | Need TypeScript library for building and submitting Cardano transactions |
| **Decision** | Use Lucid Evolution (v2+) for both backend and frontend TX construction |
| **Rationale** | Unified API, Plutus V3 support, Ogmios/Kupo provider, active maintenance |
| **Consequences** | Single dependency for on/off-chain interaction |

### TDR-005: PostgreSQL for Off-Chain State

| | Decision |
|---|---|
| **Status** | ✅ Accepted |
| **Context** | Need durable storage for intent tracking, pool state cache, analytics |
| **Decision** | PostgreSQL with Prisma ORM |
| **Rationale** | ACID compliance, JSON support for flexible schemas, mature tooling |
| **Consequences** | Database management, migration strategy needed |

---

## Appendix A: CIP Compliance Matrix

| CIP | Title | Relevance | Status |
|---|---|---|---|
| **CIP-25** | NFT Metadata Standard | Pool identity NFTs | 🔄 Planned |
| **CIP-30** | Cardano dApp-Wallet Web Bridge | Wallet connection & TX signing | ✅ Required |
| **CIP-57** | Plutus Blueprint | Validator interface documentation | ✅ Required |
| **CIP-68** | Datum Metadata Standard | Rich metadata for LP tokens | 🔄 Planned |
| **CIP-112** | Observe Script Purpose (Plutus V3) | Staking rewards validator | 🔄 Consider |

## Appendix B: Glossary

| Term | Definition |
|---|---|
| **Intent** | A declarative description of a desired trade (e.g., "swap X ADA for ≥ Y HOSKY") |
| **Solver** | An off-chain agent that finds optimal execution paths for intents |
| **Escrow** | On-chain UTxO holding user funds locked with intent parameters |
| **Settlement** | The on-chain transaction that fulfills an intent and delivers tokens |
| **eUTXO** | Extended Unspent Transaction Output — Cardano's ledger model |
| **Datum** | Data attached to a UTxO, used by validators for logic |
| **Redeemer** | Data provided when spending a UTxO, triggering validator logic |
| **Reference Script** | On-chain stored validator that can be referenced (not included) in TXs |
| **LP Token** | Liquidity Provider token representing shares in a pool |
| **TVL** | Total Value Locked in the protocol |
| **NAV** | Net Asset Value of a pool or position |
| **TWAP** | Time-Weighted Average Price |
| **MEV** | Maximal Extractable Value (front-running, sandwich attacks) |
