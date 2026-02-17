# SolverNet DEX — Frontend Design System

> **Document Version**: 1.0.0  
> **Status**: Phase 1 — Design  
> **Date**: 2026-02-17  
> **Classification**: Internal — Technical Specification

---

## Table of Contents

1. [Design System Overview](#1-design-system-overview)
2. [Branding & Color System](#2-branding--color-system)
3. [Typography](#3-typography)
4. [Component Library](#4-component-library)
5. [Page Layout Patterns](#5-page-layout-patterns)
6. [DEX-Specific UI Components](#6-dex-specific-ui-components)
7. [Wallet Integration (CIP-30)](#7-wallet-integration-cip-30)
8. [State Management Architecture](#8-state-management-architecture)
9. [Data Fetching Strategy](#9-data-fetching-strategy)
10. [Responsive Design](#10-responsive-design)
11. [Accessibility](#11-accessibility)
12. [Performance Budget](#12-performance-budget)

---

## 1. Design System Overview

### 1.1 Foundation

The design system is built on the existing Basket.Finance frontend, adapted for DEX:

| Foundation | Technology | Source |
|---|---|---|
| **Component Library** | shadcn/ui (New York style) | Existing frontend |
| **Styling** | Tailwind CSS v4 + CSS Variables | Existing frontend |
| **Icons** | Lucide React | Existing frontend |
| **Charts** | Recharts + lightweight-charts | Existing frontend |
| **Theming** | next-themes (dark mode default) | Existing frontend |
| **Animation** | tailwindcss-animate | Existing frontend |

### 1.2 Design Principles

1. **Speed First**: Swap interface must feel instant — no unnecessary loading states
2. **Trust Through Transparency**: Show all TX details before signing
3. **Progressive Disclosure**: Simple swap by default, advanced features accessible
4. **Consistency**: All interactive elements follow the same patterns
5. **Dark-First**: Optimized for dark mode (default for crypto/DeFi users)

---

## 2. Branding & Color System

### 2.1 Brand Colors

```css
:root {
  /* Primary — Protocol brand color (teal/emerald) */
  --primary: 158 64% 52%;          /* hsl(158, 64%, 52%) — #3DD68C */
  --primary-foreground: 0 0% 100%; /* White text on primary */
  
  /* Semantic colors */
  --success: 142 71% 45%;          /* Green — TX confirmed */
  --warning: 38 92% 50%;           /* Amber — slippage warning */
  --destructive: 0 72% 60%;        /* Red  — errors, price impact */
  --info: 217 91% 60%;             /* Blue — informational */
}

.dark {
  /* Dark theme surfaces */
  --background: 0 0% 5%;           /* Near black */
  --card: 0 0% 8%;                 /* Card surfaces */
  --popover: 0 0% 10%;             /* Elevated surfaces */
  --muted: 0 0% 15%;               /* Muted backgrounds */
  --border: 0 0% 15%;              /* Subtle borders */
  
  /* Text hierarchy */
  --foreground: 0 0% 95%;          /* Primary text */
  --muted-foreground: 0 0% 55%;    /* Secondary text */
}
```

### 2.2 Semantic Color Usage

| Context | Color | Usage |
|---|---|---|
| **Positive** | `--success` | Price up, profit, TX confirmed |
| **Negative** | `--destructive` | Price down, loss, high price impact |
| **Neutral** | `--muted-foreground` | Labels, timestamps, secondary info |
| **Interactive** | `--primary` | Buttons, links, active states |
| **Warning** | `--warning` | High slippage, low liquidity |
| **Information** | `--info` | Tips, help text |

### 2.3 Chart Colors

```css
:root {
  --chart-1: 158 64% 52%;   /* Primary — Pool A */
  --chart-2: 217 91% 60%;   /* Blue — Pool B */
  --chart-3: 38 92% 50%;    /* Amber — Volume */
  --chart-4: 280 65% 60%;   /* Purple — Fees */
  --chart-5: 0 72% 60%;     /* Red — Negative */
  
  /* Candlestick */
  --candle-up: 142 71% 45%;    /* Green wick/body */
  --candle-down: 0 72% 51%;   /* Red wick/body */
}
```

---

## 3. Typography

### 3.1 Font Stack

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});
```

### 3.2 Type Scale

| Level | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| **Display** | 3rem (48px) | 700 | 1.1 | Hero headlines |
| **H1** | 2.25rem (36px) | 700 | 1.2 | Page titles |
| **H2** | 1.875rem (30px) | 600 | 1.25 | Section headers |
| **H3** | 1.5rem (24px) | 600 | 1.3 | Card titles |
| **H4** | 1.25rem (20px) | 600 | 1.4 | Sub-sections |
| **Body** | 1rem (16px) | 400 | 1.5 | Default text |
| **Body SM** | 0.875rem (14px) | 400 | 1.5 | Table content |
| **Caption** | 0.75rem (12px) | 500 | 1.4 | Labels, timestamps |
| **Mono** | 0.875rem (14px) | 400 | 1.4 | Addresses, hashes, amounts |

### 3.3 Number Formatting

```typescript
// Token amounts: always use fixed decimals matching token
formatAmount(1234567890n, 6) → "1,234.567890"   // ADA
formatAmount(5000000000n, 0) → "5,000,000,000"  // HOSKY

// Abbreviated large numbers
formatCompact(1234567890n, 6) → "1.23K"
formatCompact(50000000000000n, 6) → "50.00M"

// Percentages
formatPercent(0.0534) → "+5.34%"   // Green if positive
formatPercent(-0.0212) → "-2.12%"  // Red if negative

// ADA with symbol
formatAda(2500000n) → "₳2.50"
```

---

## 4. Component Library

### 4.1 Reused Components from Existing Frontend

| Component | Path | Modifications |
|---|---|---|
| `Button` | `ui/button.tsx` | Add `"trade"` variant (green, larger) |
| `Card` | `ui/card.tsx` | Keep hover-lift effect |
| `Dialog` | `ui/dialog.tsx` | As-is |
| `Input` | `ui/input.tsx` | Add number input mode |
| `Select` | `ui/select.tsx` | As-is |
| `Tabs` | `ui/tabs.tsx` | As-is |
| `Table` | `ui/table.tsx` | Add sortable column headers |
| `Skeleton` | `ui/skeleton.tsx` | As-is |
| `Badge` | `ui/badge.tsx` | Add status variants |
| `Toast/Sonner` | `ui/sonner.tsx` | Add TX status toast variants |
| `Tooltip` | `ui/tooltip.tsx` | As-is |
| `Sheet` | `ui/sheet.tsx` | For mobile filters |
| `Separator` | `ui/separator.tsx` | As-is |

### 4.2 New DEX-Specific Components

| Component | Purpose |
|---|---|
| `TokenSelect` | Searchable token picker (modal with balances) |
| `SwapCard` | Main swap interface widget |
| `PriceImpact` | Visual indicator with color-coded severity |
| `TxStatus` | Real-time transaction status tracker |
| `PoolCard` | Pool listing card with stats |
| `LiquidityForm` | Add/Remove liquidity form |
| `RouteDisplay` | Swap route visualization |
| `IntentTimer` | Countdown to intent deadline |
| `TokenIcon` | Token logo with fallback |
| `AddressDisplay` | Truncated address with copy |

---

## 5. Page Layout Patterns

### 5.1 Root Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header (sticky)                                        │
│  ┌─────┐ ┌──────────────────────────────┐ ┌──────────┐ │
│  │ Logo│ │  Nav: Swap | Pools | Portfolio│ │  Wallet  │ │
│  └─────┘ └──────────────────────────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    Page Content                         │
│                   (min-h-screen)                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Footer                                                 │
│  Links | Social | Built on Cardano                      │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Swap Page Layout

```
┌─────────────────────────────────────────────────────────┐
│                     Swap Page                           │
│                                                         │
│  ┌─────────────────────┐  ┌──────────────────────────┐ │
│  │                     │  │                          │ │
│  │    Price Chart      │  │     Swap Card            │ │
│  │    (lightweight     │  │     ┌──────────────┐     │ │
│  │     charts OHLC)    │  │     │ From: 100 ADA│     │ │
│  │                     │  │     │    ↕↕↕       │     │ │
│  │                     │  │     │ To: ~5B HOSKY│     │ │
│  │                     │  │     ├──────────────┤     │ │
│  │                     │  │     │Rate: 1:50M   │     │ │
│  │                     │  │     │Impact: 0.12% │     │ │
│  │                     │  │     │Fee: 0.3%     │     │ │
│  │                     │  │     ├──────────────┤     │ │
│  │                     │  │     │ [Swap Now]   │     │ │
│  │                     │  │     └──────────────┘     │ │
│  │                     │  │                          │ │
│  └─────────────────────┘  └──────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Recent Trades / Open Orders (tabbed)            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Pools Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Pools                                   [+ Create Pool]│
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Search: [________________] Filter: [All ▾]      │   │
│  │         Sort: [TVL ▾]                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ ADA/HOSKY│ │ ADA/DJED │ │ ADA/MELD │ │ ADA/MIN  │  │
│  │ TVL: 50M │ │ TVL: 30M │ │ TVL: 20M │ │ TVL: 15M │  │
│  │ APY: 12% │ │ APY: 8%  │ │ APY: 15% │ │ APY: 10% │  │
│  │ Vol: 5M  │ │ Vol: 3M  │ │ Vol: 2M  │ │ Vol: 1M  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ ...more  │ │  pools   │ │          │               │
│  └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────┘
```

### 5.4 Portfolio Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Portfolio                                              │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Summary Cards                                   │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │   │
│  │  │Total   │ │P&L     │ │Open    │ │Active  │    │   │
│  │  │Value   │ │+₳5,000 │ │Intents │ │Orders  │    │   │
│  │  │₳150K   │ │+3.45%  │ │  2     │ │  1     │    │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌────────────────────┐ ┌────────────────────────────┐  │
│  │ Performance Chart  │ │ Positions Table            │  │
│  │ (line chart, P&L)  │ │ Pool | Value | P&L | Share│  │
│  │                    │ │ ─────┼───────┼─────┼──────│  │
│  │                    │ │ A/H  │ ₳14K  │+3.7%│ 2%   │  │
│  │                    │ │ A/D  │ ₳8K   │+1.2%│ 0.5% │  │
│  └────────────────────┘ └────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Transaction History (sortable table)            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 6. DEX-Specific UI Components

### 6.1 Swap Card Component

```
┌──────────────────────────────────┐
│  Swap          ⚙️ Settings       │
├──────────────────────────────────┤
│                                  │
│  You pay                         │
│  ┌────────────────────────────┐  │
│  │ [Token: ADA ▾]   [100.00] │  │
│  │ Balance: 1,500 ADA  [MAX] │  │
│  └────────────────────────────┘  │
│                                  │
│          [ ⇅ Switch ]            │
│                                  │
│  You receive                     │
│  ┌────────────────────────────┐  │
│  │ [Token: HOSKY ▾] [~5.0B]  │  │
│  │ Balance: 0 HOSKY          │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Rate: 1 ADA = 50M HOSKY   │  │
│  │ Price Impact: 0.12%  🟢   │  │
│  │ Min Received: 4.975B      │  │
│  │ Network Fee: ~₳0.25       │  │
│  │ Route: ADA → HOSKY (direct)│ │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │       🟢 Swap Now          │  │
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

### 6.2 Token Picker

```
┌──────────────────────────────────┐
│  Select a Token              ✕   │
├──────────────────────────────────┤
│  🔍 [Search name or paste addr] │
│                                  │
│  Popular:                        │
│  [ADA] [HOSKY] [DJED] [MELD]   │
│                                  │
│  ─────────────────────────────── │
│                                  │
│  🪙 ADA          ₳1,500.00      │
│  🪙 HOSKY        10,000,000,000 │
│  🪙 DJED         2,500.00       │
│  🪙 MELD         15,000.00      │
│  🪙 INDY         500.00         │
│  🪙 MIN          8,000.00       │
│                                  │
│  ─────────────────────────────── │
│  Manage Token Lists ↗           │
└──────────────────────────────────┘
```

### 6.3 Transaction Status Toast

```
┌────────────────────────────────────────────┐
│  ○ Building Transaction...                 │  → spinner
│  ● Waiting for wallet signature...         │  → pulse
│  ● Submitting to network...                │  → spinner
│  ● Waiting for confirmation...             │  → spinner
│  ✅ Swap confirmed!                         │  → checkmark
│     100 ADA → 5,000,000,000 HOSKY          │
│     [View on Explorer ↗]                   │
└────────────────────────────────────────────┘
```

### 6.4 Price Impact Indicator

| Impact Range | Color | Icon | Label |
|---|---|---|---|
| < 0.1% | Gray | ● | Negligible |
| 0.1% - 1% | Green | 🟢 | Low |
| 1% - 3% | Yellow | 🟡 | Moderate |
| 3% - 5% | Orange | 🟠 | High |
| > 5% | Red | 🔴 | Very High (warning modal) |

---

## 7. Wallet Integration (CIP-30)

### 7.1 Supported Wallets

| Wallet | Priority | CIP-30 API Name |
|---|---|---|
| **Eternl** | Primary | `eternl` |
| **Nami** | Primary | `nami` |
| **Lace** | Primary | `lace` |
| **Flint** | Secondary | `flint` |
| **Typhon** | Secondary | `typhon` |
| **GeroWallet** | Secondary | `gerowallet` |
| **Vespr** | Secondary | `vespr` |

### 7.2 Connection Flow

```typescript
// lib/cardano/wallet-api.ts

interface WalletAPI {
  // CIP-30 standard
  enable(): Promise<CardanoAPI>;
  isEnabled(): Promise<boolean>;
  apiVersion: string;
  name: string;
  icon: string;
}

interface CardanoAPI {
  getNetworkId(): Promise<number>;
  getUtxos(): Promise<string[]>;        // CBOR-encoded UTxOs
  getBalance(): Promise<string>;        // CBOR-encoded value
  getUsedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
  signData(addr: string, payload: string): Promise<DataSignature>;
}

// Connection flow
async function connectWallet(walletName: string): Promise<WalletState> {
  // 1. Check if wallet extension is installed
  const wallet = window.cardano?.[walletName];
  if (!wallet) throw new WalletNotFoundError(walletName);
  
  // 2. Request permission
  const api = await wallet.enable();
  
  // 3. Get wallet info
  const networkId = await api.getNetworkId();
  const addresses = await api.getUsedAddresses();
  const balance = await api.getBalance();
  const changeAddress = await api.getChangeAddress();
  
  // 4. Initialize Lucid with wallet
  const lucid = await initLucid(networkId);
  lucid.selectWallet.fromAPI(api);
  
  return {
    isConnected: true,
    walletName,
    address: addresses[0],
    changeAddress,
    networkId,
    balance: decodeBalance(balance),
    api,
    lucid,
  };
}
```

### 7.3 Transaction Signing Flow

```typescript
// hooks/use-tx-builder.ts

function useSubmitIntent() {
  const { wallet } = useWallet();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: SwapParams) => {
      // 1. Request unsigned TX from backend
      const { unsignedTx, intentId } = await apiClient.post('/intents', {
        ...params,
        senderAddress: wallet.address,
        changeAddress: wallet.changeAddress,
      });
      
      // 2. Sign with user's wallet (CIP-30)
      const signedTx = await wallet.api.signTx(unsignedTx, true);
      
      // 3. Submit signed TX
      const result = await apiClient.post(`/intents/${intentId}/submit`, {
        signedTx,
      });
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
```

---

## 8. State Management Architecture

### 8.1 State Categories

```
┌───────────────────────────────────────────────────────────┐
│                    STATE ARCHITECTURE                      │
├────────────────────┬──────────────────────────────────────┤
│                    │                                      │
│  SERVER STATE      │  • Pool list, pool details           │
│  (TanStack Query)  │  • Quotes, prices                   │
│                    │  • Intent status                     │
│                    │  • Portfolio data                    │
│                    │  • Analytics                         │
│                    │                                      │
├────────────────────┼──────────────────────────────────────┤
│                    │                                      │
│  WALLET STATE      │  • Connection status                 │
│  (React Context)   │  • Address, balance                  │
│                    │  • Network ID                        │
│                    │  • CIP-30 API reference             │
│                    │                                      │
├────────────────────┼──────────────────────────────────────┤
│                    │                                      │
│  UI STATE          │  • Modal open/close                  │
│  (useState)        │  • Form inputs                      │
│                    │  • Tab selection                     │
│                    │  • Token selection                   │
│                    │                                      │
├────────────────────┼──────────────────────────────────────┤
│                    │                                      │
│  URL STATE         │  • Active pool ID (route param)      │
│  (Next.js Router)  │  • Search/filter params              │
│                    │  • Selected time period              │
│                    │                                      │
├────────────────────┼──────────────────────────────────────┤
│                    │                                      │
│  REAL-TIME STATE   │  • Live prices (WebSocket)           │
│  (WebSocket +      │  • Intent updates                   │
│   TanStack Query)  │  • Pool state changes               │
│                    │                                      │
└────────────────────┴──────────────────────────────────────┘
```

### 8.2 Provider Hierarchy

```tsx
// app/layout.tsx
<ThemeProvider defaultTheme="dark">
  <QueryClientProvider client={queryClient}>
    <WalletProvider>
      <NetworkProvider>
        <Toaster />
        <Header />
        {children}
        <Footer />
      </NetworkProvider>
    </WalletProvider>
  </QueryClientProvider>
</ThemeProvider>
```

---

## 9. Data Fetching Strategy

### 9.1 Query Key Convention

```typescript
// Hierarchical query keys for targeted invalidation
const queryKeys = {
  pools: {
    all: ['pools'] as const,
    list: (filters: PoolFilters) => ['pools', 'list', filters] as const,
    detail: (id: string) => ['pools', 'detail', id] as const,
    history: (id: string, period: string) => ['pools', 'history', id, period] as const,
  },
  intents: {
    all: ['intents'] as const,
    list: (address: string) => ['intents', 'list', address] as const,
    detail: (id: string) => ['intents', 'detail', id] as const,
  },
  quotes: {
    swap: (params: QuoteParams) => ['quotes', 'swap', params] as const,
  },
  portfolio: {
    summary: (address: string) => ['portfolio', address] as const,
    positions: (address: string) => ['portfolio', address, 'positions'] as const,
    transactions: (address: string) => ['portfolio', address, 'transactions'] as const,
  },
  analytics: {
    overview: ['analytics', 'overview'] as const,
    token: (assetId: string) => ['analytics', 'token', assetId] as const,
  },
};
```

### 9.2 Refresh Intervals

| Data Type | Stale Time | Refetch Interval | Rationale |
|---|---|---|---|
| **Pool List** | 30s | 60s | Moderate change rate |
| **Pool Detail** | 10s | 15s | More frequent for active view |
| **Quote** | 3s | 5s | Must be near real-time |
| **Intent Status** | 2s | 5s | User waiting for settlement |
| **Portfolio** | 30s | 60s | Balance changes with TX |
| **Analytics** | 5min | 10min | Aggregated data, slow change |
| **Token Prices** | Real-time | WebSocket | Continuous via WS |

---

## 10. Responsive Design

### 10.1 Breakpoints

| Name | Width | Layout Changes |
|---|---|---|
| **Mobile** | < 640px | Single column, bottom nav, sheet menus |
| **Tablet** | 640px - 1024px | Two columns, condensed charts |
| **Desktop** | 1024px - 1440px | Full layout, sidebar |
| **Wide** | > 1440px | Maximum container width, more whitespace |

### 10.2 Mobile Swap Experience

```
┌──────────────────────┐
│  ≡  SolverNet   [🔒] │  ← Hamburger + Wallet
├──────────────────────┤
│                      │
│  Swap                │
│  ┌──────────────────┐│
│  │ ADA        100.00││
│  │ Balance: 1,500   ││
│  └──────────────────┘│
│        [ ⇅ ]         │
│  ┌──────────────────┐│
│  │ HOSKY    ~5.0B   ││
│  └──────────────────┘│
│                      │
│  Rate: 1:50M         │
│  Impact: 0.12% 🟢    │
│                      │
│  ┌──────────────────┐│
│  │   🟢 Swap Now     ││
│  └──────────────────┘│
│                      │
├──────────────────────┤
│ 🔄Swap  💧Pool  📊Port│ ← Bottom navigation
└──────────────────────┘
```

---

## 11. Accessibility

### 11.1 Requirements

| Standard | Target | Implementation |
|---|---|---|
| **WCAG 2.1 AA** | All interactive elements | Radix primitives handle a11y |
| **Keyboard Navigation** | Full app navigable | Focus management, tab order |
| **Screen Reader** | All content accessible | ARIA labels, live regions |
| **Color Contrast** | 4.5:1 minimum | Tested with axe-core |
| **Motion** | Respect `prefers-reduced-motion` | Conditional animations |

### 11.2 Key Patterns

```tsx
// All amount inputs
<label htmlFor="swap-input-amount" className="sr-only">
  Amount to swap
</label>
<input
  id="swap-input-amount"
  type="text"
  inputMode="decimal"
  aria-describedby="swap-input-balance"
  aria-invalid={hasError}
/>
<span id="swap-input-balance">Balance: 1,500 ADA</span>

// TX status updates
<div role="status" aria-live="polite">
  Transaction confirmed: 100 ADA → 5B HOSKY
</div>
```

---

## 12. Performance Budget

### 12.1 Targets

| Metric | Target | Tool |
|---|---|---|
| **LCP** | < 2.0s | Lighthouse |
| **FID/INP** | < 100ms | Core Web Vitals |
| **CLS** | < 0.1 | Lighthouse |
| **TTI** | < 3.0s | Lighthouse |
| **Bundle Size (JS)** | < 200KB (gzip, first load) | next-bundle-analyzer |
| **Image Size** | < 100KB per token logo | Sharp optimization |

### 12.2 Optimization Strategies

| Strategy | Implementation |
|---|---|
| **Code Splitting** | Dynamic imports for chart components, modals |
| **Tree Shaking** | Named exports, `sideEffects: false` in package.json |
| **Image Optimization** | Next.js `<Image>`, WebP/AVIF, token logo sprite sheet |
| **Font Loading** | `next/font` with `display: swap` |
| **Data Caching** | TanStack Query with stale-while-revalidate |
| **SSR/SSG** | Static marketing pages, SSR for SEO-important pages |
| **Lazy Loading** | Charts and modals loaded on demand |
| **Prefetching** | Next.js link prefetch for common navigation |

### 12.3 Bundle Splitting

```
Route bundles (target gzip):
├── / (landing)           → < 50KB
├── /swap                 → < 80KB (+ charts lazy)
├── /pools                → < 60KB
├── /pools/[id]          → < 100KB (+ charts lazy)
├── /portfolio            → < 80KB
└── /orders               → < 50KB

Shared chunks:
├── framework (React, Next) → ~45KB
├── ui-components           → ~30KB
├── wallet-integration      → ~50KB (Lucid + WASM)
└── chart-libraries         → ~60KB (lazy loaded)
```
