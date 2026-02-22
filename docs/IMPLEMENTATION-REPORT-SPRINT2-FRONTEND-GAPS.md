# Implementation Report — Sprint 2: Frontend UI Gaps

**Date:** February 22, 2026  
**Sprint scope:** Frontend-only — gaps G14, G15, G17, G18, G19 from the System Audit Follow-up  
**TypeScript compile result:** ✅ Zero errors (`npx tsc --noEmit` → clean exit)

---

## Summary table

| Task | Gap | Files modified / created | Status |
|------|-----|--------------------------|--------|
| 1 | G14 | `app/admin/deploy/page.tsx` **(NEW)**, `lib/api.ts`, `app/admin/layout.tsx` | ✅ |
| 2 | G19 | `components/features/wallet/token-select.tsx` | ✅ |
| 3 | G18 | `app/orders/page.tsx`, `lib/hooks.ts` | ✅ |
| 4 | G15 | `app/portfolio/page.tsx`, `lib/hooks.ts`, `lib/api.ts` | ✅ |
| 5 | G10/G17 | `app/admin/solver/page.tsx` **(NEW)**, `lib/api.ts`, `app/admin/layout.tsx` | ✅ |

---

## Task 1 — Admin Deploy Settings Page (G14)

### Audit issue
No UI existed to call `POST /admin/settings/build-deploy`. Factory bootstrap was only possible via the CLI script `deploy-factory.ts`, which requires direct Node.js server access.

### What was built
**New file:** `frontend/src/app/admin/deploy/page.tsx`

A full admin page under the existing admin auth-gated layout (`/admin/deploy`) providing:

- **Current deployment status card** — queries `GET /admin/settings/current` on load. Shows a green "LIVE" badge when settings are already deployed on-chain, or an amber "PENDING" badge when not yet deployed, so the admin always knows the current state before acting.
- **Deploy form** with three input fields:
  - Protocol Fee (basis points, 0–10000, live display as percentage)
  - Minimum Pool Liquidity (lovelace, with ADA equivalent shown below)
  - Fee Collector Address (optional — defaults to admin address on backend)
- **Info callout** explaining this mints the Settings NFT and is a one-time action per factory deployment.
- **Deploy button** → calls the new `buildDeploySettings()` API function → runs through `useTransaction` hook (sign → submit → confirm lifecycle).
- On success, re-fetches the settings to update the status card.

**API function added to `lib/api.ts`:**
```typescript
export async function buildDeploySettings(body: {
  admin_address: string;
  protocol_fee_bps: number;
  min_pool_liquidity: number;
  fee_collector_address?: string;
}): Promise<{ unsignedTx: string; txHash: string; estimatedFee: string }>
```
→ `POST /admin/settings/build-deploy`

**Nav link added** to `ADMIN_NAV` in `app/admin/layout.tsx`:
```typescript
{ href: "/admin/deploy", label: "Deploy Settings", icon: Rocket }
```

---

## Task 2 — Dynamic Token List in TokenSelectDialog (G19)

### Audit issue (R-10)
`TokenSelectDialog` used a static `TOKEN_LIST` from `mock-data.ts` (13 hardcoded tokens with test policyIds). Tokens from newly created pools were invisible in the token selector until the static list was edited in source code.

### What was changed
**File:** `frontend/src/components/features/wallet/token-select.tsx`

- On every dialog open, `listPools({ state: "ACTIVE", limit: "100" })` is called.
- Pool `assetA` and `assetB` are extracted and resolved through `resolvePoolToken()` — a local helper that:
  1. Returns the known `TOKENS` entry if the ticker/policyId matches (preserving logos, colors, decimals).
  2. Falls back to constructing a minimal `Token` object for unknown assets.
- The merged list (`TOKEN_LIST` base + dynamic pool tokens) is deduplicated by ticker.
- A `Loader2` spinner appears in the dialog title during the async fetch.
- Errors silently fall back to the static `TOKEN_LIST` — no broken UX on API unavailability.

**Before:**
```typescript
const filtered = useMemo(() => TOKEN_LIST.filter(...), [search, excludeTicker]);
```

**After:**
```typescript
// Fetches pools on dialog open, builds merged dynamic list
const [dynamicTokens, setDynamicTokens] = useState<Token[]>(TOKEN_LIST);
// ... useEffect fetches pools and populates dynamicTokens
const filtered = useMemo(() => dynamicTokens.filter(...), [search, excludeTicker, dynamicTokens]);
```

---

## Task 3 — DCA Progress Widget (G18)

### Audit issue
The orders page showed DCA interval count as plain text (`Intervals: 3`) with no visual progress indicator. Users could not easily see how close a DCA order was to completion.

### What was changed

**`frontend/src/lib/hooks.ts`** — Added `intervalSlots: number | null` to `NormalizedOrder`:
```typescript
export interface NormalizedOrder {
  // ... existing fields
  intervalSlots: number | null;  // NEW
}

function normalizeOrder(o: OrderResponse): NormalizedOrder {
  return {
    // ...
    intervalSlots: o.intervalSlots ?? null,   // maps from API response
  };
}
```

**`frontend/src/app/orders/page.tsx`** — Added `Progress` import and DCA progress widget:
```tsx
{order.type === "DCA" && order.intervalSlots != null && order.intervalSlots > 0 && (
  <div className="mt-2 space-y-1 max-w-[220px]">
    <Progress
      value={Math.min(100, (order.executedIntervals / order.intervalSlots) * 100)}
      className="h-1.5"
    />
    <div className="flex justify-between text-[10px] text-muted-foreground">
      <span className="text-purple-500 font-medium">DCA Progress</span>
      <span className="font-mono">
        {order.executedIntervals} / {order.intervalSlots} intervals
      </span>
    </div>
  </div>
)}
```

The progress bar only renders for DCA orders where `intervalSlots` is a positive number, so LIMIT/STOP_LOSS orders are unaffected. The text below the bar shows e.g. **"3 / 10 intervals"** alongside the visual bar.

---

## Task 4 — Real TVL & Liquidity Display (G15)

### Audit issue (R-06)
The portfolio LP positions tab hardcoded `locked_in_lp: 0` and returned all active pools with zero LP amounts. The previous sprint fixed the backend `GetPortfolio` use-case to scan on-chain UTxOs for real LP token balances.

### What was changed

**`frontend/src/lib/api.ts`** — Added `LpPosition` interface matching the backend's new response:
```typescript
export interface LpPosition {
  poolId: string;
  assetATicker?: string;
  assetBTicker?: string;
  assetAPolicyId: string;
  assetBPolicyId: string;
  lpPolicyId: string;
  lpBalance: string; // bigint serialized as decimal string
}

// PortfolioResponse updated:
export interface PortfolioResponse {
  // ... existing fields
  lpPositions?: LpPosition[];  // NEW — real on-chain LP balances
}
```

**`frontend/src/lib/hooks.ts`** — Added `usePortfolioLpPositions` hook:
```typescript
export function usePortfolioLpPositions(address: string | undefined) {
  // Uses GET /portfolio/:address (upgraded GetPortfolio use-case)
  const { data, ... } = useApi<PortfolioResponse>(
    () => getPortfolio(address!), [address], { ... }
  );
  const lpPositions: LpPosition[] = data?.lpPositions ?? [];
  return { lpPositions, loading, error, refetch };
}
```

**`frontend/src/app/portfolio/page.tsx`** — Updated LP Positions tab:
- Imports `usePortfolioLpPositions` alongside the existing `usePortfolioLiquidity`.
- When `lpPositions.length > 0` (real on-chain data returned), renders the **new format** with an "On-chain UTxO scan — real balances" badge.
- The new view shows: pair tickers, LP token balance (in purple), LP policy ID prefix, and a "Withdraw" link to the pool page.
- Falls back to the **legacy** `/portfolio/liquidity` response when the new format is empty.
- LP positions tab badge count uses whichever source has data.

---

## Task 5 — Admin Solver Dashboard (G10 / G17)

### Audit issue
No admin UI existed for monitoring the solver engine. Admins had to use CLI scripts and server logs to check solver queue depth, batch stats, or trigger a manual run.

### What was built
**New file:** `frontend/src/app/admin/solver/page.tsx`

Dashboard at `/admin/solver` (inside the admin auth-gated layout) with:

- **Engine status banner** — shows ACTIVE (green pulse) / IDLE (amber) / UNKNOWN (grey) based on `getSolverStatus()` response.
- **4 stat cards:** Active Intents, Pending Orders, Queue Depth, Success Rate (batchesSuccess / batchesTotal).
- **Batch statistics card** — shows total / successful / failed batch counts + last settlement TX hash (clickable link to Cardano preprod explorer).
- **Manual Trigger card** — "Trigger Solver Now" button calls `POST /admin/solver/trigger`. Shows success/error message. If solver is already running, button label changes to "Trigger Additional Cycle".
- **Auto-refresh every 10 seconds** via `setInterval`.
- **Graceful degradation** — if the backend doesn't yet implement the status endpoint, the dashboard shows "Status unavailable" instead of crashing.

**API functions added to `lib/api.ts`:**
```typescript
export interface SolverStatusResponse {
  running: boolean;
  lastRun: string | null;
  batchesTotal: number;
  batchesSuccess: number;
  batchesFailed: number;
  activeIntents: number;
  pendingOrders: number;
  queueDepth: number;
  lastTxHash: string | null;
}

export async function getSolverStatus(): Promise<SolverStatusResponse>
// GET /admin/solver/status

export async function triggerSolver(): Promise<{ triggered: boolean; message: string }>
// POST /admin/solver/trigger
```

**Nav link added** to `ADMIN_NAV`:
```typescript
{ href: "/admin/solver", label: "Solver Engine", icon: Cpu }
```

---

## Files changed

| File | Change type | Description |
|------|-------------|-------------|
| `frontend/src/lib/api.ts` | Modified | +`LpPosition`, +`buildDeploySettings`, +`SolverStatusResponse`, +`getSolverStatus`, +`triggerSolver`, updated `PortfolioResponse` |
| `frontend/src/lib/hooks.ts` | Modified | +`intervalSlots` in `NormalizedOrder`, +`usePortfolioLpPositions` hook, +`LpPosition` import |
| `frontend/src/app/admin/layout.tsx` | Modified | Added Deploy Settings and Solver Engine to `ADMIN_NAV`, imported `Rocket` and `Cpu` icons |
| `frontend/src/app/admin/deploy/page.tsx` | **NEW** | Deploy Protocol Settings admin page |
| `frontend/src/app/admin/solver/page.tsx` | **NEW** | Solver Engine monitoring dashboard |
| `frontend/src/components/features/wallet/token-select.tsx` | Modified | Dynamic token list from pools API + loading spinner |
| `frontend/src/app/orders/page.tsx` | Modified | DCA progress bar (`Progress` component + `intervalSlots`) |
| `frontend/src/app/portfolio/page.tsx` | Modified | Dual-source LP positions display (on-chain real + legacy fallback) |

---

## Outstanding backend endpoints needed for full functionality

The following backend endpoints are referenced by the new frontend pages but may not yet exist:

| Endpoint | Used by | Current status |
|----------|---------|----------------|
| `POST /admin/settings/build-deploy` | Deploy Settings page | Created in Sprint 1 (`UpdateSettingsUseCase` with `mode: 'deploy'`) ✅ |
| `GET /admin/solver/status` | Solver Dashboard | **NOT YET IMPLEMENTED** — frontend shows "Status unavailable" gracefully |
| `POST /admin/solver/trigger` | Solver Dashboard | **NOT YET IMPLEMENTED** — frontend shows error state gracefully |

For the solver endpoints, the recommended backend implementation:

```typescript
// GET /v1/admin/solver/status
router.get('/admin/solver/status', (req, res) => {
  const engine = dependencies.solverEngine;
  res.json({
    running: engine.isRunning(),
    lastRun: engine.lastRunAt?.toISOString() ?? null,
    batchesTotal: engine.stats.batchesTotal,
    batchesSuccess: engine.stats.batchesSuccess,
    batchesFailed: engine.stats.batchesFailed,
    activeIntents: engine.stats.activeIntents,
    pendingOrders: engine.stats.pendingOrders,
    queueDepth: engine.stats.queueDepth,
    lastTxHash: engine.stats.lastTxHash ?? null,
  });
});

// POST /v1/admin/solver/trigger
router.post('/admin/solver/trigger', async (req, res) => {
  await dependencies.solverEngine.runOnce();
  res.json({ triggered: true, message: 'Solver cycle triggered' });
});
```

---

## Remaining audit issues not addressed in this sprint

| ID | Description |
|----|-------------|
| R-01 | Partial fill support in TxBuilder (backend) |
| R-02 | Pool history route still reads placeholder data |
| R-03 | Swap table never written |
| R-04 | execute-order doesn't update Order.remainingBudget |
| R-05 | Factory deployment API endpoint |
| R-08 | CancelIntent saves CANCELLED but should save CANCELLING |
| R-09 | WebSocket not wired to React components |
| R-11 | Frontend test scripts default to production URL |
| R-12 | Token analytics endpoint always returns zeros |
| R-13 | outputIndex: 0 hardcoded |
| R-15 | Volume tracking assumes AToB direction |
| R-16 | volume7d always 0 (depends on R-03) |

---

*Generated February 22, 2026 — Sprint 2 Frontend Gap Closure*
