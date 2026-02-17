# SolverNet DEX — Security Audit Checklist & Deployment Guide

> **Document Version**: 1.0.0  
> **Status**: Phase 1 — Design  
> **Date**: 2026-02-17  
> **Classification**: Internal — Technical Specification

---

## Part A: Security Audit Checklist

### A.1 Smart Contract Security

#### A.1.1 General Validator Safety

| # | Check | Severity | Status |
|---|---|---|---|
| SC-01 | All validators reject by default (fail-safe) | Critical | ☐ |
| SC-02 | No unbounded loops or recursion | Critical | ☐ |
| SC-03 | All datum fields validated on BOTH input and output | Critical | ☐ |
| SC-04 | Transaction validity interval enforced where needed | High | ☐ |
| SC-05 | No implicit trust of tx_info fields without verification | High | ☐ |
| SC-06 | Redeemer variants are exhaustively matched | Medium | ☐ |
| SC-07 | No debug `trace` statements in production | Low | ☐ |
| SC-08 | Script size within budget (< 15KB per validator) | Medium | ☐ |

#### A.1.2 Pool Validator

| # | Check | Severity | Status |
|---|---|---|---|
| PV-01 | Constant product invariant: `Ra' × Rb' ≥ Ra × Rb` | Critical | ☐ |
| PV-02 | Pool NFT must exist in input AND output | Critical | ☐ |
| PV-03 | No value can be extracted without LP token burn or fee collection | Critical | ☐ |
| PV-04 | LP token amount calculated correctly (proportional) | Critical | ☐ |
| PV-05 | First deposit locks MINIMUM_LIQUIDITY (prevents pool drain) | High | ☐ |
| PV-06 | Fee calculation rounds in protocol's favor | High | ☐ |
| PV-07 | Only admin can collect protocol fees | High | ☐ |
| PV-08 | Zero-amount deposits/withdrawals rejected | Medium | ☐ |
| PV-09 | Pool datum fields preserved on swap (only fees change) | High | ☐ |
| PV-10 | No additional tokens added/removed from pool UTxO | High | ☐ |

#### A.1.3 Escrow Validator

| # | Check | Severity | Status |
|---|---|---|---|
| EV-01 | Cancel requires owner signature | Critical | ☐ |
| EV-02 | Fill delivers ≥ min_output to owner address | Critical | ☐ |
| EV-03 | Anti-double-satisfaction (unique output datum tag) | Critical | ☐ |
| EV-04 | Expired intents only reclaimable to owner | High | ☐ |
| EV-05 | Partial fill updates datum correctly | High | ☐ |
| EV-06 | Partial fill enforces minimum fill threshold | Medium | ☐ |
| EV-07 | Intent token burned on complete fill/cancel | High | ☐ |
| EV-08 | Deadline check uses tx validity interval | High | ☐ |
| EV-09 | Remaining value matches datum after partial fill | Critical | ☐ |
| EV-10 | Output goes to EXACT owner address (no substitution) | Critical | ☐ |

#### A.1.4 Minting Policies

| # | Check | Severity | Status |
|---|---|---|---|
| MP-01 | Pool NFT: one-shot mint (consumed UTxO ensures uniqueness) | Critical | ☐ |
| MP-02 | Pool NFT: exactly 1 token minted per invocation | Critical | ☐ |
| MP-03 | LP tokens: forwarding mint validates pool validator is invoked | High | ☐ |
| MP-04 | LP tokens: amount matches pool validator calculation | Critical | ☐ |
| MP-05 | Intent token: exactly 1 per escrow, unique name | High | ☐ |
| MP-06 | All policies: burn logic correctly validates | Medium | ☐ |

#### A.1.5 Factory Validator

| # | Check | Severity | Status |
|---|---|---|---|
| FV-01 | Canonical pair ordering enforced (no duplicate pools) | High | ☐ |
| FV-02 | Factory NFT thread preserved | Critical | ☐ |
| FV-03 | Pool count monotonically increasing | Medium | ☐ |
| FV-04 | Admin-only operations require admin signature | High | ☐ |
| FV-05 | New pool has valid datum at pool validator address | High | ☐ |

#### A.1.6 Known Attack Vectors

| # | Attack | Check | Status |
|---|---|---|---|
| AV-01 | **Double Satisfaction**: Same redeemer satisfies multiple validators | Check unique datum tags per escrow | ☐ |
| AV-02 | **Datum Hijacking**: Attacker changes datum in output | Verify output datum matches expected | ☐ |
| AV-03 | **Pool Drain via Rounding**: Repeated small swaps extract value | Verify rounding always favors pool | ☐ |
| AV-04 | **Flash Loan**: Borrow and return in same TX | No intermediate states in eUTXO model ✓ | ☐ |
| AV-05 | **Sandwich Attack**: MEV front-running | min_output + solver competition | ☐ |
| AV-06 | **Token Duplication**: Mint extra tokens | One-shot policies, quantity checks | ☐ |
| AV-07 | **Governance Attack**: Unauthorized settings change | Multi-sig + timelock (future) | ☐ |
| AV-08 | **Oracle Manipulation**: Feed wrong prices | Protocol uses AMM pools as price source (no external oracle for swaps) | ☐ |

### A.2 Backend Security Checklist

| # | Check | Status |
|---|---|---|
| BE-01 | All API inputs validated with Zod schemas | ☐ |
| BE-02 | Rate limiting on all endpoints | ☐ |
| BE-03 | CORS configured for frontend domain only | ☐ |
| BE-04 | Helmet.js security headers | ☐ |
| BE-05 | SQL injection prevention (Prisma parameterized queries) | ☐ |
| BE-06 | Solver signing key encrypted at rest | ☐ |
| BE-07 | No secrets in source code or environment dumps | ☐ |
| BE-08 | Ogmios/Kupo endpoints on private network | ☐ |
| BE-09 | Structured logging (no PII, no private keys) | ☐ |
| BE-10 | Error responses don't leak internal details | ☐ |
| BE-11 | Dependency audit (`pnpm audit`) — zero critical | ☐ |
| BE-12 | Docker images scanned for vulnerabilities | ☐ |

### A.3 Frontend Security Checklist

| # | Check | Status |
|---|---|---|
| FE-01 | Content Security Policy (CSP) headers | ☐ |
| FE-02 | No private keys or secrets in client bundle | ☐ |
| FE-03 | All TX effects displayed before wallet signature request | ☐ |
| FE-04 | Domain verified in wallet connection | ☐ |
| FE-05 | XSS prevention (React auto-escaping + CSP) | ☐ |
| FE-06 | HTTPS enforced | ☐ |
| FE-07 | Subresource Integrity (SRI) on external scripts | ☐ |

---

## Part B: Deployment Guide

### B.1 Deployment Sequence

```
Phase 0: Infrastructure Setup
  1. Provision servers (3x for HA)
  2. Deploy Cardano Node (preview testnet first)
  3. Deploy Ogmios (connected to node)
  4. Deploy Kupo (connected to node, pattern filter for our scripts)
  5. Deploy PostgreSQL (managed service or containerized)
  6. Verify infrastructure health

Phase 1: Smart Contract Deployment
  1. Build Aiken validators: `aiken build`
  2. Run all Aiken tests: `aiken check`
  3. Deploy reference scripts to testnet
  4. Deploy factory validator with initial settings
  5. Create first test pools
  6. Verify all validators work end-to-end

Phase 2: Backend Deployment
  1. Run database migrations: `prisma migrate deploy`
  2. Deploy API service
  3. Deploy Solver engine (separate process)
  4. Verify health endpoints
  5. Run integration tests against testnet

Phase 3: Frontend Deployment
  1. Build frontend: `next build`
  2. Deploy to Vercel / Cloudflare
  3. Configure environment variables
  4. Verify wallet connection on testnet
  5. Run E2E tests

Phase 4: Mainnet Migration (after audit)
  1. Deploy reference scripts to mainnet
  2. Switch backend to mainnet node
  3. Update frontend environment
  4. Limited beta with whitelisted addresses
  5. Public launch
```

### B.2 Reference Script Deployment

```typescript
// scripts/deploy-reference-scripts.ts

import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import blueprint from '../smartcontract/build/plutus.json';

async function deployReferenceScripts() {
  const lucid = await Lucid.new(
    new Blockfrost(BLOCKFROST_URL, BLOCKFROST_KEY),
    'Preview'
  );
  
  lucid.selectWallet.fromPrivateKey(DEPLOY_KEY);
  
  const validators = [
    { name: 'pool_validator', script: blueprint.validators[0].compiledCode },
    { name: 'escrow_validator', script: blueprint.validators[1].compiledCode },
    { name: 'factory_validator', script: blueprint.validators[2].compiledCode },
    // ... other validators
  ];
  
  for (const validator of validators) {
    const tx = await lucid
      .newTx()
      .pay.ToAddressWithData(
        REFERENCE_HOLDER_ADDRESS,
        { kind: 'inline', value: Data.void() },
        { lovelace: 50_000_000n },  // 50 ADA min-UTxO
        { type: 'PlutusV3', script: validator.script }
      )
      .complete();
    
    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();
    
    console.log(`${validator.name} deployed: ${txHash}`);
    
    // Wait for confirmation
    await lucid.awaitTx(txHash);
  }
}
```

### B.3 Environment Variables

```bash
# packages/backend/.env.example

# ── Network ──
NETWORK=preview                          # preview | preprod | mainnet
CARDANO_NODE_SOCKET=/ipc/node.socket

# ── Ogmios ──
OGMIOS_HOST=localhost
OGMIOS_PORT=1337

# ── Kupo ──
KUPO_HOST=localhost
KUPO_PORT=1442

# ── Database ──
DATABASE_URL=postgresql://solvernet:password@localhost:5432/solvernet

# ── Solver ──
SOLVER_SIGNING_KEY=encrypted:xxxxx       # Encrypted via SOPS/Vault
SOLVER_BATCH_WINDOW_MS=5000
SOLVER_MAX_BATCH_SIZE=15

# ── API ──
PORT=3001
CORS_ORIGIN=https://app.solvernet.io
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# ── Reference Scripts ──
POOL_VALIDATOR_REF=txhash#0
ESCROW_VALIDATOR_REF=txhash#1
FACTORY_VALIDATOR_REF=txhash#2
SETTINGS_UTXO_REF=txhash#3

# ── Monitoring ──
LOG_LEVEL=info
METRICS_PORT=9090
```

```bash
# packages/frontend/.env.example

# ── API ──
NEXT_PUBLIC_API_URL=https://api.solvernet.io/v1
NEXT_PUBLIC_WS_URL=wss://api.solvernet.io/v1/ws

# ── Network ──
NEXT_PUBLIC_NETWORK=preview              # preview | preprod | mainnet
NEXT_PUBLIC_EXPLORER_URL=https://preview.cardanoscan.io

# ── Feature Flags ──
NEXT_PUBLIC_ENABLE_LIMIT_ORDERS=false
NEXT_PUBLIC_ENABLE_DCA=false
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

### B.4 Kupo Pattern Configuration

```bash
# Only index UTxOs relevant to our protocol (saves storage)

kupo \
  --host 0.0.0.0 \
  --node-socket /ipc/node.socket \
  --node-config /config/config.json \
  --since origin \
  --match "${POOL_VALIDATOR_HASH}/*" \        # Pool UTxOs
  --match "${ESCROW_VALIDATOR_HASH}/*" \      # Intent escrows
  --match "${FACTORY_VALIDATOR_HASH}/*" \     # Factory state
  --match "${SETTINGS_VALIDATOR_HASH}/*" \    # Settings
  --match "${REFERENCE_HOLDER_ADDRESS}/*"     # Reference scripts
```

### B.5 Health Check Verification

```bash
# After deployment, verify all services:

# 1. Cardano Node
curl -s http://localhost:1337/health | jq .

# 2. Ogmios
wscat -c ws://localhost:1337 -x '{"jsonrpc":"2.0","method":"queryNetwork/tip"}'

# 3. Kupo
curl -s http://localhost:1442/health | jq .

# 4. Backend API
curl -s http://localhost:3001/v1/health | jq .

# 5. Frontend
curl -s https://app.solvernet.io -o /dev/null -w "%{http_code}"
```

---

## Part C: Development Milestones & Roadmap

### C.1 Phase Breakdown

```
╔══════════════════════════════════════════════════════════════╗
║                  DEVELOPMENT ROADMAP                        ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Phase 1: Foundation (Weeks 1-4)                             ║
║  ├── Monorepo setup & CI/CD                                  ║
║  ├── Aiken: types.ak, math.ak, constants.ak                 ║
║  ├── Aiken: pool_validator.ak (core AMM logic)               ║
║  ├── Aiken: pool_nft_policy.ak, lp_token_policy.ak          ║
║  ├── Backend: domain layer (entities, value objects)          ║
║  ├── Backend: Ogmios/Kupo clients                            ║
║  ├── Frontend: wallet CIP-30 integration                     ║
║  └── Docker infrastructure setup                             ║
║                                                              ║
║  Phase 2: Core DEX (Weeks 5-8)                               ║
║  ├── Aiken: escrow_validator.ak (intent logic)               ║
║  ├── Aiken: factory_validator.ak                             ║
║  ├── Aiken: intent_token_policy.ak                           ║
║  ├── Aiken: comprehensive test suite                         ║
║  ├── Backend: intent API + pool API                          ║
║  ├── Backend: TX builder (pool creation, deposit, withdraw)  ║
║  ├── Frontend: swap UI, pool listing, pool detail            ║
║  └── Integration: testnet E2E flow                           ║
║                                                              ║
║  Phase 3: Solver & Settlement (Weeks 9-12)                   ║
║  ├── Backend: Solver engine (collect, route, batch, settle)  ║
║  ├── Backend: route optimizer (direct, multi-hop)            ║
║  ├── Backend: batch builder & TX constructor                 ║
║  ├── Frontend: intent status tracking, portfolio             ║
║  ├── Frontend: price charts, analytics                       ║
║  ├── Integration: solver E2E on testnet                      ║
║  └── Performance tuning (batch sizing, timing)               ║
║                                                              ║
║  Phase 4: Advanced Features (Weeks 13-16)                    ║
║  ├── Aiken: order_validator.ak (limit, DCA, stop-loss)       ║
║  ├── Aiken: settings_validator.ak (governance)               ║
║  ├── Backend: order API, WebSocket streams                   ║
║  ├── Frontend: order UI (limit, DCA)                         ║
║  ├── Frontend: advanced analytics dashboard                  ║
║  ├── Security: internal audit, fix findings                  ║
║  └── Pre-production deployment (preprod testnet)             ║
║                                                              ║
║  Phase 5: Launch (Weeks 17-20)                               ║
║  ├── External security audit                                 ║
║  ├── Audit remediation                                       ║
║  ├── Mainnet deployment                                      ║
║  ├── Beta testing (whitelisted users)                        ║
║  ├── Documentation & user guides                             ║
║  └── Public launch                                           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### C.2 Definition of Done (per Phase)

| Phase | Deliverables | Quality Gate |
|---|---|---|
| Phase 1 | Pool AMM on testnet | Aiken tests pass, pool creation E2E works |
| Phase 2 | Core swap flow E2E | User can create intent → solver fills → tokens received |
| Phase 3 | Automated solver | Solver runs continuously, fills intents within 60s |
| Phase 4 | Advanced orders | Limit orders, DCA, governance, all on testnet |
| Phase 5 | Mainnet launch | Audit complete, monitoring live, beta tested |

### C.3 Success Metrics

| Metric | Phase 3 Target | Phase 5 Target |
|---|---|---|
| **Intent Fill Rate** | > 95% | > 99% |
| **Avg Settlement Time** | < 60s | < 30s |
| **TX Success Rate** | > 90% | > 98% |
| **API Uptime** | 99% | 99.9% |
| **UI Lighthouse Score** | > 80 | > 90 |
| **Test Coverage (Aiken)** | > 80% | > 95% |
| **Test Coverage (Backend)** | > 70% | > 85% |
