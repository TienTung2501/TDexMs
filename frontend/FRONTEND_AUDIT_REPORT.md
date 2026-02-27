# Frontend Audit Report — SolverNet DEX

**Date:** 2025-06-03  
**Scope:** Complete frontend application (`frontend/src/`)  
**Framework:** Next.js 15 (App Router) + React 19 + Tailwind CSS + shadcn/ui  

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | Blocks intended behavior, causes visible broken UX |
| 🟠 HIGH | 6 | Incorrect data display, wrong calculations |
| 🟡 MEDIUM | 7 | Performance, stale data, minor logic errors |
| 🔵 LOW | 4 | Polish, accessibility, cosmetic |
| **Total** | **20** | |

---

## 🔴 CRITICAL Bugs

### C-1: Order Entry Card is FULLY FUNCTIONAL — Should Be Disabled

**Severity:** 🔴 CRITICAL  
**Location:** `src/components/features/trading/order-entry-card.tsx` (full file, 404 lines)  
**Requirement:** "Form order có thể hiển thị / Các input phải ở trạng thái disabled hoặc read-only / Khi người dùng cố submit → Không gửi request + Hiển thị 'Tính năng chưa sẵn sàng'"

**Current behavior:**
- LIMIT / DCA / STOP_LOSS tabs are fully interactive
- All form inputs (amount, price, slippage, intervals) accept user input
- Submit button calls real `createOrder()` API and sends on-chain transactions
- No disabled state, no read-only mode, no warning message

**Impact:** Users can create advanced orders that the backend/solver may not fully support, leading to locked funds on-chain.

**Fix suggestion:**
1. Wrap all `<Input>` fields with `disabled` or `readOnly` prop
2. Replace the submit `<Button>` `onClick` handler with a toast/alert: "Tính năng chưa sẵn sàng" 
3. Add a visible banner at the top of the card: `<Badge variant="secondary">Coming Soon</Badge>`
4. Disable the cancel order button in `orders/page.tsx` as well

---

### C-2: Infinite Loading Spinner — `useApi` Hook Never Clears `loading` When `enabled=false`

**Severity:** 🔴 CRITICAL  
**Location:** `src/lib/hooks.ts` lines 42-58, the `useApi<T>` generic hook  
**User report:** "Hệ thống thỉnh thoảng hiển thị loading spinner quay liên tục"

**Root cause:**
```typescript
// hooks.ts — useApi
const [loading, setLoading] = useState(true);  // ← initialized TRUE

const fetchData = useCallback(async () => {
  if (options?.enabled === false) return;  // ← returns WITHOUT setting loading=false
  // ...
  setLoading(true);
  // ...
  finally { setLoading(false); }
}, deps);
```

When a hook is called with `enabled: false` (e.g. `usePool(undefined)`, `usePrice(undefined)`, portfolio hooks when wallet disconnected), the `fetchData` callback returns early on line 45. Since `loading` was initialized as `true` on line 42, it **stays `true` forever**.

**Affected hooks (all use `enabled` option):**
- `usePool(poolId)` → `enabled: !!poolId` — spinner when no pool selected
- `usePrice(poolId)` → `enabled: !!poolId` — same
- `useCandles(poolId)` → `enabled: !!poolId` — same
- `usePortfolio(address)` → `enabled: !!address` — spinner when wallet disconnected
- `usePortfolioSummary(address)` → `enabled: !!address` — same
- `usePortfolioOpenOrders(address)` → `enabled: !!address` — same
- `usePortfolioHistory(address)` → `enabled: !!address` — same
- `usePortfolioLiquidity(address)` → `enabled: !!address` — same
- `usePortfolioLpPositions(address)` → `enabled: !!address` — same

**Fix:**
```typescript
const fetchData = useCallback(async () => {
  if (options?.enabled === false) {
    setLoading(false);  // ← ADD THIS
    return;
  }
  // ...rest
}, deps);
```

---

### C-3: Orders Page Cancel/Reclaim Sends Real Transactions — Should Be Disabled

**Severity:** 🔴 CRITICAL  
**Location:** `src/app/orders/page.tsx` lines 350-400 (cancel button), `src/app/portfolio/page.tsx` lines 400-480 (cancel/reclaim actions)  

**Current behavior:**
- The "Advanced Orders" tab in the orders page has a working Cancel button that calls `cancelOrder()` API
- Portfolio page has Cancel and Reclaim buttons for open orders that build and submit real on-chain transactions

**Impact:** If the order feature is supposed to be disabled, users should not be able to interact with order management either.

**Fix:** Disable `cancelOrder()` calls in orders page; keep `cancelIntent()` functional since intents/swaps are supported.

---

## 🟠 HIGH Severity Bugs

### H-1: Pool Reserves Displayed in Raw Base Units (Lovelace)

**Severity:** 🟠 HIGH  
**Location:** 
- `src/app/pools/page.tsx` lines 188-191
- `src/app/pools/[id]/page.tsx` price ratio calculation
- `src/components/features/liquidity/liquidity-form.tsx` withdrawal estimate

**Current behavior:**
```tsx
// pools/page.tsx
{formatCompact(pool.reserveA)} {pool.assetA.ticker}
// A pool with 100 ADA shows "100.00M" because reserveA = 100_000_000 (lovelace)
```

`normalizePool()` in hooks.ts does `reserveA: Number(p.reserveA)` without dividing by `10^decimals`. The `formatCompact()` function doesn't do unit conversion.

**Affected displays:**
- Pool list: reserves column
- Pool detail: reserve bars
- Liquidity form: proportional auto-calculation, withdrawal estimate
- Pool detail: price ratio

**Fix:** Convert reserves to human-readable units in `normalizePool()`:
```typescript
reserveA: Number(p.reserveA) / Math.pow(10, assetA.decimals),
reserveB: Number(p.reserveB) / Math.pow(10, assetB.decimals),
```

---

### H-2: Intent/Trade Amounts Displayed in Base Units

**Severity:** 🟠 HIGH  
**Location:**
- `src/app/analytics/page.tsx` lines 200-215 (Recent Activity section)
- `src/components/features/trading/recent-trades-table.tsx` lines 100-120
- `src/components/features/trading/trading-footer.tsx` lines 200-250
- `src/app/orders/page.tsx` intent amounts

**Current behavior:**
```tsx
// analytics/page.tsx
{trade.inputAmount.toLocaleString()}  // Shows "100,000,000" instead of "100"
{(trade.actualOutput ?? trade.minOutput).toLocaleString()}
```

`NormalizedIntent.inputAmount` is `Number(i.inputAmount)` where API returns base units. No decimal conversion occurs.

**Fix:** Add decimals lookup when normalizing intents:
```typescript
inputAmount: Number(i.inputAmount) / Math.pow(10, resolveToken(policyId, assetName).decimals),
```

---

### H-3: Division by Zero in Pool Detail Price Ratio

**Severity:** 🟠 HIGH  
**Location:** `src/app/pools/[id]/page.tsx` — price display section  

**Current behavior:**
```tsx
(pool.reserveB / pool.reserveA).toFixed(4)
```

If `pool.reserveA === 0` (empty or newly created pool), this produces `Infinity` or `NaN` displayed on the page.

**Fix:**
```tsx
pool.reserveA > 0 ? (pool.reserveB / pool.reserveA).toFixed(4) : "—"
```

---

### H-4: Wrong Explorer URL — Mainnet Instead of Preprod

**Severity:** 🟠 HIGH  
**Location:** `src/components/features/trading/recent-trades-table.tsx` line 130  

**Current:**
```tsx
href={`https://cardanoscan.io/transaction/${trade.escrowTxHash}`}
```

**Should be:**
```tsx
href={`https://preprod.cardanoscan.io/transaction/${trade.escrowTxHash}`}
```

Note: `trading-footer.tsx` correctly uses `preprod.cardanoscan.io`. This inconsistency means some TX links point to mainnet (where the TX doesn't exist).

---

### H-5: Liquidity Form Withdrawal Estimate Has Wrong Divisor

**Severity:** 🟠 HIGH  
**Location:** `src/components/features/liquidity/liquidity-form.tsx` lines 235-245  

**Current:**
```tsx
~{formatCompact((pool.reserveA * parseFloat(withdrawPercent)) / 100 / 10)}
```

The `/ 10` divisor is unexplained and produces incorrect estimates. Additionally, `pool.reserveA` is in base units, so the display shows enormous raw numbers.

**Fix:** Remove `/ 10` and properly convert from base units:
```tsx
~{formatCompact((pool.reserveA * parseFloat(withdrawPercent)) / 100)}
// + ensure reserveA is in human units (see H-1 fix)
```

---

### H-6: Liquidity Deposit Ratio Ignores Decimal Differences

**Severity:** 🟠 HIGH  
**Location:** `src/components/features/liquidity/liquidity-form.tsx` lines 33-40  

**Current:**
```typescript
const ratio = pool.reserveB / pool.reserveA;
setAmountB((parseFloat(val) * ratio).toFixed(2));
```

When assets have different decimals (ADA=6, tBTC=8), the raw reserve ratio is off by a factor of `10^(decimals_A - decimals_B)`. The user enters human amounts, but the calculation uses base-unit reserves.

**Fix:** Account for decimal difference:
```typescript
const decimalFactor = Math.pow(10, pool.assetB.decimals - pool.assetA.decimals);
const ratio = (pool.reserveB / pool.reserveA) / decimalFactor;
```
Or better: fix after H-1 when reserves are already in human units.

---

## 🟡 MEDIUM Severity Bugs

### M-1: Main Trading Page Loads ALL Intents & Orders Globally

**Severity:** 🟡 MEDIUM  
**Location:** `src/app/page.tsx` lines 42-44  

```tsx
const { intents } = useIntents({});       // ALL intents, no address filter
const { orders } = useOrders({});         // ALL orders, no address filter
```

Every visit to the trading page fetches all intents and orders from the backend. With growth, this causes:
- Unnecessary bandwidth (could be thousands of entries)
- Slow initial render
- Backend load

**Fix:** For the main page's orderbook/recent trades, use a pool-specific filter or limit. For the user's own positions in the footer, filter by connected wallet address.

---

### M-2: `refetchInterval` Continues When Tab Is Hidden

**Severity:** 🟡 MEDIUM  
**Location:** `src/lib/hooks.ts` lines 63-67  

```typescript
useEffect(() => {
  if (!options?.refetchInterval) return;
  const id = setInterval(fetchData, options.refetchInterval);
  return () => clearInterval(id);
}, [fetchData, options?.refetchInterval]);
```

Five different intervals (10s, 15s, 15s, 30s, 30s) fire continuously even when the browser tab is inactive. This wastes bandwidth and causes unnecessary backend load.

**Fix:** Use `document.visibilityState` check:
```typescript
const id = setInterval(() => {
  if (document.visibilityState === 'visible') fetchData();
}, options.refetchInterval);
```

---

### M-3: `useApi` Stale Closure Risk — `fetcher` Not in Deps

**Severity:** 🟡 MEDIUM  
**Location:** `src/lib/hooks.ts` lines 48-57  

```typescript
const fetchData = useCallback(async () => {
  // uses `fetcher` from closure
  const result = await fetcher();
  // ...
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, deps);  // `deps` doesn't include `fetcher`
```

The `fetcher` function is recreated on every render (it's an inline closure), but `fetchData` only updates when `deps` change. If `fetcher` captures props/state that changed but aren't in `deps`, the old `fetcher` runs with stale values.

In practice, `deps` usually matches the relevant dependencies. But the eslint-disable comment masks this and breaks the standard pattern for `useCallback`.

---

### M-4: Portfolio Page Loads All Tabs Data Simultaneously

**Severity:** 🟡 MEDIUM  
**Location:** `src/app/portfolio/page.tsx` lines 40-80  

```tsx
const { summary, loading: summaryLoading } = usePortfolioSummary(address);
const { openOrders, loading: ordersLoading } = usePortfolioOpenOrders(address);
const { history, loading: historyLoading } = usePortfolioHistory(address, historyFilter);
const { positions, loading: lpLoading } = usePortfolioLiquidity(address);
const { lpPositions, loading: newLpLoading } = usePortfolioLpPositions(address);
```

Five API calls fire simultaneously on page load, even if the user only views one tab. Each also has a 15-30s refetch interval.

**Fix:** Load tab-specific data only when the tab is active, or use lazy initialization.

---

### M-5: Pseudo-Orderbook Uses Hardcoded ADA/USD Rate

**Severity:** 🟡 MEDIUM  
**Location:** `src/components/features/trading/pseudo-orderbook.tsx` line 213  

```tsx
≈ ${currentPrice > 0 ? (currentPrice * 0.35).toFixed(2) : "—"}
```

The `0.35` is a hardcoded ADA/USD conversion factor. ADA price fluctuates and this value becomes stale immediately.

**Fix:** Either remove the USD estimate, or fetch a live ADA/USD price from the backend analytics endpoint.

---

### M-6: WebSocket `onMessage` Stale Closure

**Severity:** 🟡 MEDIUM  
**Location:** `src/lib/hooks.ts` lines 370-398 (useWebSocket)  

```typescript
useEffect(() => {
  const ws = createWsConnection();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    onMessage?.(msg.type, msg.data);  // captured in closure
  };
  return () => ws.close();
}, [JSON.stringify(channels)]);  // onMessage NOT in deps
```

If `onMessage` changes (e.g., its internal closures reference updated state), the WebSocket handler still calls the old version. The eslint-disable hides this.

**Fix:** Use a `useRef` to always hold the latest `onMessage`:
```typescript
const onMessageRef = useRef(onMessage);
onMessageRef.current = onMessage;
// In ws.onmessage: onMessageRef.current?.(msg.type, msg.data);
```

---

### M-7: Intent `deadline` Display May Be Incorrect

**Severity:** 🟡 MEDIUM  
**Location:** `src/app/orders/page.tsx`, `src/components/features/trading/trading-footer.tsx`  

```tsx
new Date(intent.deadline).toLocaleDateString()
```

If `deadline` is a Unix timestamp (number or numeric string), `new Date("1750000000")` does NOT parse correctly — it needs `new Date(Number(deadline))` or `new Date(deadline * 1000)` for seconds-based timestamps. The display may show "Invalid Date".

---

## 🔵 LOW Severity Bugs

### L-1: Admin Navigation Link Visible to All Users

**Severity:** 🔵 LOW  
**Location:** `src/components/layout/header.tsx` line 25  

```typescript
const NAV_ITEMS = [
  // ...
  { href: "/admin", label: "Admin", icon: Shield },
];
```

The Admin link shows in the main navigation for all users. While the admin layout has proper auth checks (wallet-based), exposing the link invites unnecessary traffic and looks unprofessional.

**Fix:** Conditionally render the Admin link only when the user is a known admin, or hide it behind a feature flag.

---

### L-2: `formatAmount` Has Inconsistent Behavior for `number` vs `bigint`

**Severity:** 🔵 LOW  
**Location:** `src/lib/utils.ts` lines 10-15  

```typescript
export function formatAmount(amount: bigint | number, decimals: number = 2): string {
  const n = typeof amount === "number" ? amount : Number(amount) / Math.pow(10, decimals);
```

- `bigint` input: divides by `10^decimals` (converts from base units)
- `number` input: formats raw value (NO conversion)

This asymmetry is confusing and could lead to bugs when switching between types.

---

### L-3: No Form Validation Feedback for Liquidity Withdrawal > 100%

**Severity:** 🔵 LOW  
**Location:** `src/components/features/liquidity/liquidity-form.tsx`  

User can type `150` in the withdrawal percentage field. Though `min={0} max={100}` is set, these only enforce in native browser validation (not applicable to all input methods). No visual error message is shown.

---

### L-4: TxToastContainer Mounted Multiple Times

**Severity:** 🔵 LOW  
**Location:** Multiple components each render their own `<TxToastContainer />`  

- `page.tsx` (main) — via SwapCard
- `swap-card.tsx`
- `order-entry-card.tsx`
- `trading-footer.tsx`
- `liquidity-form.tsx`
- `portfolio/page.tsx`
- `pools/create/page.tsx`

Each `useTransaction()` call creates its own toast stack. If two components trigger transactions simultaneously, toasts from one won't show in the other's container. Consider a single global toast provider.

---

## ✅ What Works Well

| Area | Assessment |
|------|-----------|
| **Navigation & Routing** | All routes work correctly. Active state highlighting is consistent. Mobile hamburger menu functions properly. |
| **Wallet Connection** | CIP-30 integration is solid. Auto-reconnect from localStorage works. Balance parsing handles both ADA and native tokens. |
| **Error Handling** | Global `error.tsx` boundary catches unhandled errors. Admin layout has proper auth flow (loading → unauthorized → authorized). |
| **Theme Toggle** | Dark/light mode works via next-themes with proper system preference detection. |
| **Transaction Flow** | `useTransaction` hook provides clean lifecycle: build → sign → submit → confirm with toast notifications. |
| **Search & Filter** | Pool search, sort (TVL/Volume/APY), and filter work correctly on the pools listing page. |
| **Chart Component** | lightweight-charts integration with candlestick + volume is well-implemented with proper cleanup on unmount. |
| **Admin Auth** | Proper wallet-based admin verification with loading, unauthorized, and authorized states. |
| **WebSocket** | Real-time trade subscriptions with connection indicator (WiFi icon). |

---

## Recommended Fix Priority

| Priority | Bug IDs | Effort |
|----------|---------|--------|
| **P0 — Fix immediately** | C-1, C-2, C-3 | ~2h |
| **P1 — Fix before demo** | H-1, H-2, H-3, H-4, H-5, H-6 | ~3h |
| **P2 — Fix soon** | M-1, M-2, M-5, M-7 | ~2h |
| **P3 — Backlog** | M-3, M-4, M-6, L-1, L-2, L-3, L-4 | ~3h |
