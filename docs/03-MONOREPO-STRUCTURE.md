# SolverNet DEX — Monorepo Structure & Project Organization

> **Document Version**: 1.0.0  
> **Status**: Phase 1 — Design  
> **Date**: 2026-02-17  
> **Classification**: Internal — Technical Specification

---

## Table of Contents

1. [Monorepo Strategy](#1-monorepo-strategy)
2. [Complete Directory Structure](#2-complete-directory-structure)
3. [Package: smartcontract (Aiken)](#3-package-smartcontract-aiken)
4. [Package: backend (Node.js/TypeScript)](#4-package-backend-nodejstypescript)
5. [Package: frontend (Next.js)](#5-package-frontend-nextjs)
6. [Package: shared (Common Types & Utils)](#6-package-shared-common-types--utils)
7. [Development Workflow](#7-development-workflow)
8. [Dependency Management](#8-dependency-management)
9. [Configuration Files](#9-configuration-files)

---

## 1. Monorepo Strategy

### 1.1 Tool Selection

| Tool | Role | Justification |
|---|---|---|
| **pnpm workspaces** | Package management | Native workspace support, strict dependency isolation, disk-efficient |
| **Turborepo** | Task orchestration | Incremental builds, task caching, parallel execution, dependency-aware |
| **Aiken CLI** | Smart contract toolchain | Separate from Node ecosystem, invoked via npm scripts |

### 1.2 Package Relationships

```
                    ┌─────────────┐
                    │   shared    │ (Types, Constants, ABIs)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼──────────┐
        │  frontend  │ │backend │ │ smartcontract  │
        │  (Next.js) │ │(Node)  │ │ (Aiken)        │
        └────────────┘ └────────┘ └────────────────┘
              │            │            │
              │            │            │
              └────────────┘            │
                     │                  │
              Uses Lucid/MeshJS    Compiled .plutus
              for TX building      exported to shared
```

### 1.3 Naming Convention

```
@solvernet/frontend      — Next.js application  
@solvernet/backend       — Node.js API + Solver  
@solvernet/shared        — Shared types, ABIs, constants  
smartcontract            — Aiken validators (not an npm package)  
```

---

## 2. Complete Directory Structure

```
decentralize/                              # Repository Root
│
├── .github/                               # GitHub configuration
│   ├── workflows/
│   │   ├── ci.yml                         # Main CI pipeline
│   │   ├── aiken-check.yml                # Aiken-specific CI
│   │   ├── deploy-preview.yml             # Preview deployment
│   │   └── deploy-production.yml          # Production deployment
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│       ├── bug-report.md
│       └── feature-request.md
│
├── docs/                                  # Architecture & design docs
│   ├── 01-ARCHITECTURE-OVERVIEW.md
│   ├── 02-SMART-CONTRACT-DESIGN.md
│   ├── 03-MONOREPO-STRUCTURE.md           # This document
│   ├── 04-API-SPECIFICATION.md
│   ├── 05-FRONTEND-DESIGN-SYSTEM.md
│   ├── 06-DEPLOYMENT-GUIDE.md
│   ├── 07-SECURITY-AUDIT-CHECKLIST.md
│   ├── 08-SOLVER-ALGORITHM.md
│   └── diagrams/
│       ├── system-architecture.mermaid
│       ├── swap-sequence.mermaid
│       └── entity-relationship.mermaid
│
├── smartcontract/                         # [Aiken] Smart Contracts
│   ├── aiken.toml                         # Aiken project config
│   ├── aiken.lock                         # Dependency lock
│   ├── README.md
│   │
│   ├── validators/                        # Validator entry points
│   │   ├── pool_validator.ak              # AMM pool logic
│   │   ├── escrow_validator.ak            # Intent escrow logic
│   │   ├── factory_validator.ak           # Pool creation registry
│   │   ├── order_validator.ak             # Limit/DCA/StopLoss orders
│   │   └── settings_validator.ak          # Protocol governance
│   │
│   ├── lib/                               # Shared libraries
│   │   ├── solvernet/
│   │   │   ├── types.ak                   # Core type definitions
│   │   │   ├── math.ak                    # AMM math (sqrt, proportional calc)
│   │   │   ├── validation.ak              # Common validation helpers
│   │   │   ├── utils.ak                   # Address/Value/Asset utilities
│   │   │   └── constants.ak               # Protocol constants
│   │   └── policies/
│   │       ├── pool_nft_policy.ak         # Pool NFT minting policy
│   │       ├── lp_token_policy.ak         # LP token minting policy
│   │       └── intent_token_policy.ak     # Intent auth token policy
│   │
│   └── build/                             # Build artifacts (gitignored)
│       ├── packages/                      # Downloaded dependencies
│       └── plutus.json                    # CIP-57 Plutus Blueprint
│
├── packages/                              # Node.js packages
│   │
│   ├── shared/                            # @solvernet/shared
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                   # Barrel exports
│   │   │   ├── types/
│   │   │   │   ├── index.ts
│   │   │   │   ├── intent.ts              # SwapIntent, IntentStatus
│   │   │   │   ├── pool.ts                # LiquidityPool, PoolState
│   │   │   │   ├── order.ts               # LimitOrder, DCAOrder
│   │   │   │   ├── transaction.ts         # TxInfo, TxStatus
│   │   │   │   ├── wallet.ts              # WalletState, WalletProvider
│   │   │   │   └── api.ts                 # API request/response types
│   │   │   ├── constants/
│   │   │   │   ├── index.ts
│   │   │   │   ├── protocol.ts            # Fee rates, limits, addresses
│   │   │   │   ├── assets.ts              # Known asset registries
│   │   │   │   └── network.ts             # Mainnet/Testnet configs
│   │   │   ├── plutus/
│   │   │   │   ├── index.ts
│   │   │   │   ├── blueprint.ts           # Auto-generated from plutus.json
│   │   │   │   └── validators.ts          # Validator hashes & script refs
│   │   │   └── utils/
│   │   │       ├── index.ts
│   │   │       ├── format.ts              # ADA formatting, truncate hash
│   │   │       ├── math.ts                # BigInt math helpers
│   │   │       └── validation.ts          # Shared validation schemas (Zod)
│   │   └── vitest.config.ts
│   │
│   ├── backend/                           # @solvernet/backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml             # Local dev (Node + PostgreSQL)
│   │   │
│   │   ├── src/
│   │   │   ├── index.ts                   # Application entry point
│   │   │   ├── server.ts                  # Express server bootstrap
│   │   │   │
│   │   │   ├── config/                    # Configuration
│   │   │   │   ├── index.ts               # Config loader
│   │   │   │   ├── env.ts                 # Environment variables (Zod validated)
│   │   │   │   ├── network.ts             # Cardano network config
│   │   │   │   └── logger.ts              # Pino logger config
│   │   │   │
│   │   │   ├── domain/                    # ── DOMAIN LAYER (Core) ──
│   │   │   │   ├── entities/              # Business entities
│   │   │   │   │   ├── Intent.ts
│   │   │   │   │   ├── Pool.ts
│   │   │   │   │   ├── Order.ts
│   │   │   │   │   └── SwapRoute.ts
│   │   │   │   ├── value-objects/          # Immutable value types
│   │   │   │   │   ├── Asset.ts
│   │   │   │   │   ├── Amount.ts
│   │   │   │   │   ├── Price.ts
│   │   │   │   │   └── Address.ts
│   │   │   │   ├── errors/                # Domain-specific errors
│   │   │   │   │   ├── InsufficientLiquidity.ts
│   │   │   │   │   ├── IntentExpired.ts
│   │   │   │   │   ├── InvalidSwapParams.ts
│   │   │   │   │   └── PoolNotFound.ts
│   │   │   │   └── ports/                 # Interfaces (ports)
│   │   │   │       ├── IIntentRepository.ts
│   │   │   │       ├── IPoolRepository.ts
│   │   │   │       ├── IChainProvider.ts
│   │   │   │       ├── ITxBuilder.ts
│   │   │   │       └── ISolverEngine.ts
│   │   │   │
│   │   │   ├── application/               # ── APPLICATION LAYER ──
│   │   │   │   ├── use-cases/             # Business use cases
│   │   │   │   │   ├── CreateIntent.ts
│   │   │   │   │   ├── CancelIntent.ts
│   │   │   │   │   ├── GetQuote.ts
│   │   │   │   │   ├── CreatePool.ts
│   │   │   │   │   ├── DepositLiquidity.ts
│   │   │   │   │   ├── WithdrawLiquidity.ts
│   │   │   │   │   ├── GetPoolInfo.ts
│   │   │   │   │   ├── GetUserPositions.ts
│   │   │   │   │   ├── CreateOrder.ts
│   │   │   │   │   └── GetTradeHistory.ts
│   │   │   │   ├── services/              # Application services
│   │   │   │   │   ├── QuoteService.ts
│   │   │   │   │   ├── RoutingService.ts
│   │   │   │   │   └── AnalyticsService.ts
│   │   │   │   └── dtos/                  # Data transfer objects
│   │   │   │       ├── QuoteRequest.ts
│   │   │   │       ├── QuoteResponse.ts
│   │   │   │       ├── IntentRequest.ts
│   │   │   │       └── PoolResponse.ts
│   │   │   │
│   │   │   ├── infrastructure/            # ── INFRASTRUCTURE LAYER ──
│   │   │   │   ├── cardano/               # Blockchain interaction
│   │   │   │   │   ├── LucidProvider.ts   # Lucid Evolution setup
│   │   │   │   │   ├── OgmiosClient.ts    # Ogmios WebSocket client
│   │   │   │   │   ├── KupoClient.ts      # Kupo HTTP client
│   │   │   │   │   ├── TxBuilder.ts       # Transaction construction
│   │   │   │   │   └── ChainSync.ts       # Real-time chain sync
│   │   │   │   ├── database/              # Database
│   │   │   │   │   ├── prisma/
│   │   │   │   │   │   ├── schema.prisma  # Database schema
│   │   │   │   │   │   └── migrations/    # SQL migrations
│   │   │   │   │   ├── IntentRepository.ts
│   │   │   │   │   ├── PoolRepository.ts
│   │   │   │   │   └── OrderRepository.ts
│   │   │   │   ├── cache/                 # Caching
│   │   │   │   │   └── PoolStateCache.ts  # In-memory pool state
│   │   │   │   └── monitoring/            # Observability
│   │   │   │       ├── metrics.ts         # Prometheus metrics
│   │   │   │       └── health.ts          # Health check endpoints
│   │   │   │
│   │   │   ├── interface/                 # ── INTERFACE LAYER ──
│   │   │   │   ├── http/                  # REST API
│   │   │   │   │   ├── routes/
│   │   │   │   │   │   ├── index.ts       # Route registry
│   │   │   │   │   │   ├── intent.routes.ts
│   │   │   │   │   │   ├── pool.routes.ts
│   │   │   │   │   │   ├── quote.routes.ts
│   │   │   │   │   │   ├── order.routes.ts
│   │   │   │   │   │   └── health.routes.ts
│   │   │   │   │   ├── controllers/
│   │   │   │   │   │   ├── IntentController.ts
│   │   │   │   │   │   ├── PoolController.ts
│   │   │   │   │   │   ├── QuoteController.ts
│   │   │   │   │   │   └── OrderController.ts
│   │   │   │   │   ├── middleware/
│   │   │   │   │   │   ├── error-handler.ts
│   │   │   │   │   │   ├── rate-limiter.ts
│   │   │   │   │   │   ├── validation.ts
│   │   │   │   │   │   └── cors.ts
│   │   │   │   │   └── validators/        # Request validation (Zod)
│   │   │   │   │       ├── intent.schema.ts
│   │   │   │   │       ├── pool.schema.ts
│   │   │   │   │       └── quote.schema.ts
│   │   │   │   └── websocket/             # WebSocket API
│   │   │   │       ├── IntentStream.ts    # Real-time intent updates
│   │   │   │       └── PriceStream.ts     # Real-time price feed
│   │   │   │
│   │   │   └── solver/                    # ── SOLVER ENGINE ──
│   │   │       ├── SolverEngine.ts        # Main solver loop
│   │   │       ├── IntentCollector.ts     # Collect pending intents from chain
│   │   │       ├── RouteOptimizer.ts      # Find optimal execution route
│   │   │       ├── BatchBuilder.ts        # Build batch settlement TX
│   │   │       ├── ProfitCalculator.ts    # Solver profit/gas calculation
│   │   │       └── strategies/            # Pluggable solving strategies
│   │   │           ├── DirectSwap.ts      # Simple pool swap
│   │   │           ├── MultiHop.ts        # Route through multiple pools
│   │   │           └── Arbitrage.ts       # Cross-pool arbitrage
│   │   │
│   │   ├── test/
│   │   │   ├── unit/
│   │   │   │   ├── domain/
│   │   │   │   │   ├── Intent.test.ts
│   │   │   │   │   └── Pool.test.ts
│   │   │   │   ├── application/
│   │   │   │   │   ├── CreateIntent.test.ts
│   │   │   │   │   └── GetQuote.test.ts
│   │   │   │   └── solver/
│   │   │   │       ├── RouteOptimizer.test.ts
│   │   │   │       └── BatchBuilder.test.ts
│   │   │   ├── integration/
│   │   │   │   ├── api/
│   │   │   │   │   ├── intent.api.test.ts
│   │   │   │   │   └── pool.api.test.ts
│   │   │   │   └── cardano/
│   │   │   │       ├── pool-creation.test.ts
│   │   │   │       ├── swap-flow.test.ts
│   │   │   │       └── intent-lifecycle.test.ts
│   │   │   ├── fixtures/
│   │   │   │   ├── pools.ts
│   │   │   │   ├── intents.ts
│   │   │   │   └── utxos.ts
│   │   │   └── helpers/
│   │   │       ├── emulator.ts            # Lucid emulator setup
│   │   │       └── factory.ts             # Test data factory
│   │   │
│   │   ├── prisma/                        # Prisma schema (symlink or copy)
│   │   └── vitest.config.ts
│   │
│   └── frontend/                          # @solvernet/frontend
│       ├── package.json
│       ├── next.config.mjs
│       ├── tsconfig.json
│       ├── postcss.config.mjs
│       ├── components.json                # shadcn/ui config
│       ├── .env.example
│       ├── .env.local
│       │
│       ├── app/                           # Next.js App Router
│       │   ├── globals.css                # CSS variables, theme tokens
│       │   ├── layout.tsx                 # Root layout (providers, header, footer)
│       │   ├── page.tsx                   # Landing page
│       │   ├── loading.tsx                # Global loading state
│       │   ├── error.tsx                  # Global error boundary
│       │   ├── not-found.tsx              # 404 page
│       │   │
│       │   ├── (marketing)/               # Marketing pages (public)
│       │   │   ├── layout.tsx
│       │   │   ├── about/
│       │   │   │   └── page.tsx
│       │   │   ├── docs/
│       │   │   │   └── page.tsx
│       │   │   └── team/
│       │   │       └── page.tsx
│       │   │
│       │   ├── (app)/                     # Protected app pages
│       │   │   ├── layout.tsx             # App shell with sidebar
│       │   │   ├── swap/                  # Core DEX swap interface
│       │   │   │   └── page.tsx
│       │   │   ├── pools/                 # Liquidity pools listing
│       │   │   │   ├── page.tsx
│       │   │   │   └── [id]/             # Pool detail
│       │   │   │       └── page.tsx
│       │   │   ├── pool/
│       │   │   │   └── create/           # Create new pool
│       │   │   │       └── page.tsx
│       │   │   ├── portfolio/             # User positions & history
│       │   │   │   └── page.tsx
│       │   │   ├── orders/                # Active orders (limit, DCA)
│       │   │   │   └── page.tsx
│       │   │   ├── analytics/             # Protocol analytics
│       │   │   │   └── page.tsx
│       │   │   └── intents/               # Intent history & status
│       │   │       └── page.tsx
│       │   │
│       │   └── api/                       # API routes (if needed for SSR)
│       │       └── og/                    # OG image generation
│       │           └── route.tsx
│       │
│       ├── components/
│       │   ├── ui/                        # shadcn/ui primitives (reuse from existing)
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── dropdown-menu.tsx
│       │   │   ├── input.tsx
│       │   │   ├── select.tsx
│       │   │   ├── tabs.tsx
│       │   │   ├── toast.tsx
│       │   │   ├── skeleton.tsx
│       │   │   └── ... (40+ components)
│       │   │
│       │   ├── layout/                    # Layout components
│       │   │   ├── header.tsx             # Navigation header
│       │   │   ├── footer.tsx             # Site footer
│       │   │   ├── sidebar.tsx            # App sidebar (pools, portfolio)
│       │   │   └── mobile-nav.tsx         # Mobile navigation
│       │   │
│       │   ├── swap/                      # Swap feature components
│       │   │   ├── swap-card.tsx           # Main swap interface card
│       │   │   ├── token-select.tsx        # Token picker modal
│       │   │   ├── swap-settings.tsx       # Slippage & deadline settings
│       │   │   ├── swap-route-display.tsx  # Route visualization
│       │   │   ├── swap-confirmation.tsx   # TX preview & confirm dialog
│       │   │   ├── swap-history.tsx        # Recent swaps list
│       │   │   └── price-impact.tsx        # Price impact indicator
│       │   │
│       │   ├── pools/                     # Pool feature components
│       │   │   ├── pool-list.tsx           # Pool listing with search/filter
│       │   │   ├── pool-card.tsx           # Individual pool card
│       │   │   ├── pool-detail.tsx         # Pool detail view
│       │   │   ├── add-liquidity.tsx       # Deposit form
│       │   │   ├── remove-liquidity.tsx    # Withdrawal form
│       │   │   ├── pool-stats.tsx          # TVL, volume, fees stats
│       │   │   └── create-pool-wizard.tsx  # Multi-step pool creation
│       │   │
│       │   ├── orders/                    # Order feature components
│       │   │   ├── limit-order-form.tsx
│       │   │   ├── dca-order-form.tsx
│       │   │   ├── active-orders.tsx
│       │   │   └── order-history.tsx
│       │   │
│       │   ├── portfolio/                 # Portfolio feature components
│       │   │   ├── positions-table.tsx
│       │   │   ├── transaction-history.tsx
│       │   │   ├── pnl-summary.tsx
│       │   │   └── position-detail.tsx
│       │   │
│       │   ├── charts/                    # Chart components (reuse from existing)
│       │   │   ├── price-chart.tsx         # TradingView-style OHLC
│       │   │   ├── tvl-chart.tsx           # TVL over time
│       │   │   ├── volume-chart.tsx        # Trading volume bars
│       │   │   ├── pool-composition.tsx    # Donut chart
│       │   │   └── performance-chart.tsx   # P&L line chart
│       │   │
│       │   ├── wallet/                    # Wallet components
│       │   │   ├── wallet-connect.tsx      # CIP-30 connect flow
│       │   │   ├── wallet-info.tsx         # Connected wallet display
│       │   │   ├── wallet-menu.tsx         # Wallet dropdown menu
│       │   │   └── network-badge.tsx       # Network indicator
│       │   │
│       │   └── common/                    # Shared components
│       │       ├── token-icon.tsx          # Token logo display
│       │       ├── token-amount.tsx        # Formatted token amount
│       │       ├── ada-amount.tsx          # ADA with ₳ symbol
│       │       ├── tx-hash-link.tsx        # Clickable TX hash
│       │       ├── address-display.tsx     # Truncated address
│       │       ├── countdown-timer.tsx     # Intent expiry countdown
│       │       └── copy-button.tsx         # Copy to clipboard
│       │
│       ├── contexts/                      # React Context providers
│       │   ├── wallet-context.tsx          # CIP-30 wallet state
│       │   ├── network-context.tsx         # Mainnet/Testnet switching
│       │   └── toast-context.tsx           # Toast notifications
│       │
│       ├── hooks/                         # Custom React hooks
│       │   ├── use-wallet.ts              # Wallet connection hook
│       │   ├── use-pools.ts               # Pool data fetching
│       │   ├── use-swap-quote.ts          # Real-time quote hook
│       │   ├── use-intent-status.ts       # Intent status polling
│       │   ├── use-user-positions.ts      # Portfolio positions
│       │   ├── use-token-balance.ts       # Token balance query
│       │   ├── use-tx-builder.ts          # TX construction hook
│       │   ├── use-price-feed.ts          # WebSocket price stream
│       │   └── use-mobile.ts              # Responsive breakpoint
│       │
│       ├── lib/                           # Utility libraries
│       │   ├── utils.ts                   # cn() helper
│       │   ├── api-client.ts              # Backend API client (fetch wrapper)
│       │   ├── cardano/
│       │   │   ├── lucid.ts               # Lucid instance setup
│       │   │   ├── wallet-api.ts          # CIP-30 wallet adapter
│       │   │   ├── tx-builder.ts          # Frontend TX construction
│       │   │   └── asset-registry.ts      # Token metadata registry
│       │   ├── formatters.ts              # Number, date, address formatting
│       │   └── constants.ts               # Frontend-specific constants
│       │
│       ├── styles/
│       │   └── globals.css                # Additional global styles
│       │
│       └── public/
│           ├── tokens/                    # Token logo images
│           │   ├── ada.svg
│           │   ├── hosky.png
│           │   └── ...
│           ├── og-image.png               # Open Graph image
│           └── favicon.ico
│
├── scripts/                               # Development & deployment scripts
│   ├── setup.sh                           # Initial project setup
│   ├── deploy-reference-scripts.ts        # Deploy validators to chain
│   ├── seed-testnet.ts                    # Seed testnet with test pools
│   ├── generate-plutus-types.ts           # Generate TS types from plutus.json
│   └── sync-blueprint.ts                  # Sync Aiken blueprint to shared pkg
│
├── docker/                                # Docker configurations
│   ├── docker-compose.dev.yml             # Full dev stack
│   ├── docker-compose.infra.yml           # Cardano Node + Ogmios + Kupo
│   ├── cardano-node/
│   │   └── Dockerfile
│   └── backend/
│       └── Dockerfile
│
├── .gitignore
├── .prettierrc
├── .eslintrc.js                           # Root ESLint config
├── turbo.json                             # Turborepo configuration
├── pnpm-workspace.yaml                    # pnpm workspace config
├── package.json                           # Root package.json
├── tsconfig.base.json                     # Shared TypeScript config
├── README.md                              # Project README
├── CHANGELOG.md
├── LICENSE
└── CONTRIBUTING.md
```

---

## 3. Package: smartcontract (Aiken)

### 3.1 Module Organization

```
smartcontract/
├── aiken.toml
├── validators/
│   ├── pool_validator.ak        # ENTRY: Pool spending validator
│   ├── escrow_validator.ak      # ENTRY: Intent escrow validator
│   ├── factory_validator.ak     # ENTRY: Factory registry validator
│   ├── order_validator.ak       # ENTRY: Advanced orders validator
│   └── settings_validator.ak    # ENTRY: Protocol settings validator
└── lib/
    ├── solvernet/
    │   ├── types.ak             # All shared types (Datum, Redeemer, etc.)
    │   ├── math.ak              # sqrt, proportional_calc, fee_calc
    │   ├── validation.ak        # check_output, check_signer, check_deadline
    │   ├── utils.ak             # value_of, has_nft, find_output_by_address
    │   └── constants.ak         # PROTOCOL_FEE_DENOM, MIN_LIQUIDITY, etc.
    └── policies/
        ├── pool_nft_policy.ak   # ENTRY: Pool NFT minting
        ├── lp_token_policy.ak   # ENTRY: LP token minting (forwarding)
        └── intent_token_policy.ak # ENTRY: Intent auth token minting
```

### 3.2 Build Artifacts

After `aiken build`, the output is:

```
smartcontract/build/
├── plutus.json                  # CIP-57 Plutus Blueprint
│                                 # Contains:
│                                 #   - Compiled UPLC for each validator
│                                 #   - Parameter schemas
│                                 #   - Datum/Redeemer schemas
│                                 #   - Hash values
└── packages/                    # Downloaded Aiken dependencies
```

The `plutus.json` blueprint is the source of truth for:
- Validator script hashes
- Datum/Redeemer JSON schemas
- Script addresses
- TypeScript type generation

### 3.3 Integration with Node Packages

```
Flow: Aiken → plutus.json → TypeScript types

1. `aiken build` produces plutus.json
2. `scripts/generate-plutus-types.ts` reads plutus.json
3. Generates TypeScript interfaces in packages/shared/src/plutus/
4. Backend and Frontend import from @solvernet/shared
```

---

## 4. Package: backend (Node.js/TypeScript)

### 4.1 Clean Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERFACE LAYER                           │
│  HTTP Controllers, WebSocket Handlers, Route Definitions    │
│  Dependencies: Express, ws, Zod                             │
├─────────────────────────────────────────────────────────────┤
│                    APPLICATION LAYER                         │
│  Use Cases, Application Services, DTOs                      │
│  Dependencies: Domain layer only                            │
├─────────────────────────────────────────────────────────────┤
│                    DOMAIN LAYER (Core)                       │
│  Entities, Value Objects, Domain Errors, Port Interfaces    │
│  Dependencies: NONE (pure TypeScript)                       │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE LAYER                      │
│  Repository Implementations, Cardano Clients, Cache, DB     │
│  Dependencies: Lucid, Prisma, Ogmios client, etc.          │
└─────────────────────────────────────────────────────────────┘

Dependency Rule: Inner layers NEVER import from outer layers.
                 All dependencies point INWARD.
```

### 4.2 Dependency Injection

```typescript
// src/index.ts — Composition Root
import { Container } from './container';

const container = new Container();

// Domain ports → Infrastructure adapters
container.register('IPoolRepository', PoolRepository);
container.register('IIntentRepository', IntentRepository);
container.register('IChainProvider', LucidProvider);
container.register('ITxBuilder', TxBuilder);

// Application use cases
container.register('CreateIntent', CreateIntent);
container.register('GetQuote', GetQuote);

// Interface controllers
container.register('IntentController', IntentController);
container.register('PoolController', PoolController);

// Start server
const server = container.resolve('Server');
server.start();
```

### 4.3 Key Dependencies

| Package | Purpose | Layer |
|---|---|---|
| `@lucid-evolution/lucid` | TX building, chain interaction | Infrastructure |
| `@lucid-evolution/provider` | Ogmios + Kupo provider | Infrastructure |
| `prisma` / `@prisma/client` | Database ORM | Infrastructure |
| `express` | HTTP server | Interface |
| `ws` | WebSocket server | Interface |
| `zod` | Request validation | Interface |
| `pino` | Structured logging | Cross-cutting |
| `prom-client` | Prometheus metrics | Infrastructure |
| `vitest` | Testing | Dev |
| `tsx` | Development runtime | Dev |

---

## 5. Package: frontend (Next.js)

### 5.1 Reuse Strategy from Existing Frontend

The existing `frontend-etf-factory-protocol` provides:

| Reusable | Action |
|---|---|
| **40+ shadcn/ui components** | Copy directly to `packages/frontend/components/ui/` |
| **Theme system** (CSS variables, dark mode) | Adapt colors for DEX branding |
| **Layout pattern** (header, footer, shell) | Reuse structure, update navigation |
| **Chart components** (Recharts, lightweight-charts) | Adapt for DEX data (pools, prices) |
| **Responsive hooks** (`use-mobile`) | Copy directly |
| **Toast system** (Sonner) | Copy directly |
| **Card hover effects** | Copy directly |
| **Loading/skeleton patterns** | Copy directly |

| Must Replace | Action |
|---|---|
| **Mock wallet context** | Replace with real CIP-30 integration |
| **Mock data generators** | Replace with API calls to backend |
| **ETF business logic** | Replace with DEX swap/pool/order logic |
| **Navigation structure** | Redesign for DEX UX |

### 5.2 Page Structure & Route Groups

```
app/
├── (marketing)/     # Public pages: landing, about, docs
│   └── layout.tsx   # Clean layout without app sidebar
│
├── (app)/           # DEX application pages
│   └── layout.tsx   # App layout with sidebar, wallet required
│
└── api/             # API routes (minimal, mostly proxy)
```

### 5.3 State Management Strategy

| State Type | Solution | Scope |
|---|---|---|
| **Server State** | TanStack Query (React Query) | API data caching & sync |
| **Wallet State** | React Context + CIP-30 | Global, persisted |
| **UI State** | React `useState`/`useReducer` | Component-local |
| **Form State** | React Hook Form + Zod | Per-form |
| **URL State** | Next.js `searchParams` | Shareable filters |
| **Real-time Data** | WebSocket + TanStack Query | Prices, intent status |

### 5.4 Data Fetching Pattern

```typescript
// hooks/use-pools.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LiquidityPool } from '@solvernet/shared';

export function usePools() {
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => apiClient.get<LiquidityPool[]>('/pools'),
    refetchInterval: 15_000, // Refresh every 15s
    staleTime: 10_000,
  });
}

// hooks/use-swap-quote.ts
export function useSwapQuote(params: QuoteParams) {
  return useQuery({
    queryKey: ['quote', params],
    queryFn: () => apiClient.post('/quote', params),
    enabled: !!params.inputAmount && params.inputAmount > 0n,
    refetchInterval: 5_000, // Quotes refresh every 5s
  });
}
```

---

## 6. Package: shared (Common Types & Utils)

### 6.1 Purpose

Single source of truth for types, constants, and utility functions shared between frontend and backend.

### 6.2 Key Exports

```typescript
// packages/shared/src/index.ts

// Types
export type { SwapIntent, IntentStatus } from './types/intent';
export type { LiquidityPool, PoolState } from './types/pool';
export type { LimitOrder, DCAOrder } from './types/order';
export type { QuoteRequest, QuoteResponse } from './types/api';

// Constants
export { PROTOCOL_FEE_BPS, MIN_POOL_LIQUIDITY } from './constants/protocol';
export { KNOWN_ASSETS, ADA_ASSET } from './constants/assets';
export { NETWORK_CONFIG } from './constants/network';

// Plutus artifacts
export { VALIDATOR_HASHES, SCRIPT_ADDRESSES } from './plutus/validators';

// Utils
export { formatAda, truncateHash } from './utils/format';
export { intentSchema, quoteSchema } from './utils/validation';
```

### 6.3 Plutus Blueprint Integration

```typescript
// packages/shared/src/plutus/blueprint.ts
// AUTO-GENERATED from smartcontract/build/plutus.json
// DO NOT EDIT MANUALLY — run `pnpm generate:plutus-types`

export const PLUTUS_BLUEPRINT = {
  preamble: {
    title: "solvernet/protocol",
    version: "0.1.0",
    plutusVersion: "v3",
  },
  validators: [
    {
      title: "pool_validator.pool",
      hash: "abc123...",
      datum: { /* JSON Schema */ },
      redeemer: { /* JSON Schema */ },
    },
    // ... other validators
  ],
} as const;
```

---

## 7. Development Workflow

### 7.1 Getting Started

```bash
# 1. Clone & install
git clone <repo>
cd decentralize
pnpm install

# 2. Setup infrastructure (Docker)
docker compose -f docker/docker-compose.infra.yml up -d
# Starts: cardano-node (preview), ogmios, kupo

# 3. Build smart contracts
cd smartcontract
aiken build
aiken check  # Run tests
cd ..

# 4. Generate TypeScript types from Plutus blueprint
pnpm generate:plutus-types

# 5. Start development servers
pnpm dev  # Starts both frontend and backend via Turborepo
```

### 7.2 Turborepo Task Graph

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "persistent": true,
      "cache": false
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    },
    "generate:plutus-types": {
      "inputs": ["../../smartcontract/build/plutus.json"],
      "outputs": ["src/plutus/**"]
    }
  }
}
```

### 7.3 Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all dev servers (Turbo) |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm type-check` | TypeScript type checking |
| `pnpm generate:plutus-types` | Generate TS from Plutus Blueprint |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Prisma Studio |

### 7.3.1 CLI Debug & Admin Scripts

Located in `frontend/scripts/src/`, run via `npx tsx`. See [10-CLI-DEBUG-ADMIN-SCRIPTS.md](10-CLI-DEBUG-ADMIN-SCRIPTS.md) for full reference.

**User scripts:** `health`, `quote`, `list-pools`, `create-pool`, `deposit-liquidity`, `withdraw-liquidity`, `create-intent`, `cancel-intent`, `list-intents`, `create-order`, `cancel-order`, `list-orders`, `portfolio`, `submit-tx`, `mint-test-tokens`

**Admin scripts:** `admin-status`, `admin-collect-fees`, `admin-update-settings`, `admin-trigger-solver`, `admin-emergency-shutdown`

**Debug scripts:** `list-escrow-utxos`

### 7.4 Git Workflow

```
main ─────────────────────────────────────────────►
  │                                    │
  ├── develop ─────────────────────────┤
  │     │        │         │           │
  │     ├── feature/pool-validator     │
  │     ├── feature/swap-ui            │
  │     └── feature/solver-engine      │
  │                                    │
  └── release/v0.1.0 ─────────────────┘
```

| Branch | Purpose | Deploy |
|---|---|---|
| `main` | Production-ready code | Mainnet |
| `develop` | Integration branch | Preview Testnet |
| `feature/*` | Individual features | PR preview |
| `release/*` | Release candidates | Pre-prod Testnet |
| `hotfix/*` | Emergency fixes | Mainnet (fast-track) |

---

## 8. Dependency Management

### 8.1 pnpm Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

### 8.2 Root package.json

```jsonc
{
  "name": "solvernet-dex",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "generate:plutus-types": "turbo generate:plutus-types --filter=@solvernet/shared",
    "db:migrate": "pnpm --filter @solvernet/backend exec prisma migrate dev",
    "db:studio": "pnpm --filter @solvernet/backend exec prisma studio",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.x",
    "typescript": "^5.x",
    "prettier": "^3.x",
    "eslint": "^9.x"
  }
}
```

### 8.3 Dependency Matrix

| Dependency | shared | backend | frontend |
|---|---|---|---|
| TypeScript | ✅ | ✅ | ✅ |
| Zod | ✅ | ✅ | ✅ |
| @lucid-evolution/lucid | | ✅ | ✅ |
| Express | | ✅ | |
| Prisma | | ✅ | |
| Next.js | | | ✅ |
| React | | | ✅ |
| TanStack Query | | | ✅ |
| Recharts | | | ✅ |
| shadcn/ui (Radix) | | | ✅ |
| Vitest | ✅ | ✅ | |
| @solvernet/shared | | ✅ | ✅ |

---

## 9. Configuration Files

### 9.1 TypeScript Base Config

```jsonc
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 9.2 ESLint Config

```javascript
// .eslintrc.js (root)
module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['node_modules', 'dist', '.next', 'build'],
};
```

### 9.3 Docker Compose (Development Infrastructure)

```yaml
# docker/docker-compose.infra.yml
version: '3.8'

services:
  cardano-node:
    image: ghcr.io/intersectmbo/cardano-node:10.0.0
    volumes:
      - cardano-data:/data
      - ./cardano-node/config:/config
    environment:
      NETWORK: preview
    ports:
      - "3001:3001"  # Node socket (mapped via socat)

  ogmios:
    image: cardanosolutions/ogmios:latest
    depends_on:
      - cardano-node
    ports:
      - "1337:1337"  # WebSocket API
    command: >
      --host 0.0.0.0
      --node-socket /ipc/node.socket
      --node-config /config/config.json

  kupo:
    image: cardanosolutions/kupo:latest
    depends_on:
      - cardano-node
    ports:
      - "1442:1442"  # HTTP API
    command: >
      --host 0.0.0.0
      --node-socket /ipc/node.socket
      --node-config /config/config.json
      --since origin
      --match "*"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: solvernet
      POSTGRES_PASSWORD: solvernet_dev
      POSTGRES_DB: solvernet
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  cardano-data:
  postgres-data:
```

---

## Appendix: Migration Strategy from Existing Frontend

### Phase 1: Infrastructure Setup
1. Create monorepo structure with pnpm workspaces + Turborepo
2. Move `smartcontract/` to root level (already done)
3. Bootstrap `packages/shared/`, `packages/backend/`, `packages/frontend/`

### Phase 2: Frontend Migration
1. Copy `components/ui/` from existing frontend → `packages/frontend/components/ui/`
2. Copy theme CSS variables → `packages/frontend/app/globals.css`
3. Copy layout components (header, footer) → adapt navigation
4. Copy chart components → adapt for DEX data
5. Replace mock wallet with CIP-30 integration
6. Replace mock data with TanStack Query + API client

### Phase 3: New Development
1. Build swap interface (new)
2. Build pool management (new)
3. Build order system (new)
4. Build portfolio/analytics (adapt from existing dashboard)

### Component Mapping (Old → New)

| Existing Component | New Component | Action |
|---|---|---|
| `components/ui/*` | `components/ui/*` | Direct copy |
| `components/layout/header.tsx` | `components/layout/header.tsx` | Adapt navigation |
| `components/layout/footer.tsx` | `components/layout/footer.tsx` | Adapt links |
| `components/wallet/wallet-modal.tsx` | `components/wallet/wallet-connect.tsx` | Rewrite (CIP-30) |
| `components/baskets/mint-modal.tsx` | `components/swap/swap-confirmation.tsx` | Redesign |
| `components/charts/TokenDetailChart.tsx` | `components/charts/price-chart.tsx` | Adapt data source |
| `components/charts/allocation-donut-chart.tsx` | `components/charts/pool-composition.tsx` | Adapt |
| `contexts/wallet.tsx` | `contexts/wallet-context.tsx` | Rewrite (CIP-30) |
| `hooks/use-toast.ts` | `hooks/use-toast.ts` | Direct copy |
| `hooks/use-mobile.ts` | `hooks/use-mobile.ts` | Direct copy |
| `lib/utils.ts` | `lib/utils.ts` | Direct copy |
| `app/explore/page.tsx` | `app/(app)/pools/page.tsx` | Adapt for pools |
| `app/dashboard/page.tsx` | `app/(app)/portfolio/page.tsx` | Adapt for positions |
| `app/create/page.tsx` | `app/(app)/pool/create/page.tsx` | Adapt for pool creation |
