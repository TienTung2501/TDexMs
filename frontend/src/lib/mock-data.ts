// ═══════════════════════════════════════════
// Mock Data — Full SolverNet DEX Dataset
// Replace with real API calls after backend integration
// ═══════════════════════════════════════════

// ─── Token Registry ─────────────────────────
export interface Token {
  policyId: string;
  assetName: string;
  ticker: string;
  name: string;
  decimals: number;
  logo: string; // emoji placeholder
}

export const TOKENS: Record<string, Token> = {
  ADA: {
    policyId: "",
    assetName: "",
    ticker: "ADA",
    name: "Cardano",
    decimals: 6,
    logo: "₳",
  },
  HOSKY: {
    policyId: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d5d3c6d0",
    assetName: "484f534b59",
    ticker: "HOSKY",
    name: "Hosky Token",
    decimals: 0,
    logo: "🐕",
  },
  DJED: {
    policyId: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880",
    assetName: "444a4544",
    ticker: "DJED",
    name: "Djed Stablecoin",
    decimals: 6,
    logo: "💵",
  },
  MELD: {
    policyId: "6ac8ef3c3c3c7e4e5a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
    assetName: "4d454c44",
    ticker: "MELD",
    name: "MELD",
    decimals: 6,
    logo: "🔷",
  },
  MIN: {
    policyId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6",
    assetName: "4d494e",
    ticker: "MIN",
    name: "Minswap",
    decimals: 6,
    logo: "🐱",
  },
  INDY: {
    policyId: "533bb94a8850ee3ccbe483106489399112b74c905342cb1f14f12381",
    assetName: "494e4459",
    ticker: "INDY",
    name: "Indigo",
    decimals: 6,
    logo: "🟣",
  },
  SNEK: {
    policyId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
    assetName: "534e454b",
    ticker: "SNEK",
    name: "Snek",
    decimals: 0,
    logo: "🐍",
  },
  WMT: {
    policyId: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e",
    assetName: "574d54",
    ticker: "WMT",
    name: "World Mobile",
    decimals: 6,
    logo: "🌐",
  },
};

export const TOKEN_LIST = Object.values(TOKENS);

// ─── Pool Data ──────────────────────────────
export interface Pool {
  id: string;
  assetA: Token;
  assetB: Token;
  reserveA: number;
  reserveB: number;
  totalLpTokens: number;
  feePercent: number;
  tvlAda: number;
  volume24h: number;
  fees24h: number;
  apy: number;
  priceChange24h: number;
  state: "ACTIVE" | "INACTIVE";
}

export const MOCK_POOLS: Pool[] = [
  {
    id: "pool_ada_hosky",
    assetA: TOKENS.ADA,
    assetB: TOKENS.HOSKY,
    reserveA: 5_000_000,
    reserveB: 250_000_000_000_000,
    totalLpTokens: 1_000_000,
    feePercent: 0.3,
    tvlAda: 10_000_000,
    volume24h: 2_500_000,
    fees24h: 7_500,
    apy: 27.4,
    priceChange24h: 5.34,
    state: "ACTIVE",
  },
  {
    id: "pool_ada_djed",
    assetA: TOKENS.ADA,
    assetB: TOKENS.DJED,
    reserveA: 30_000_000,
    reserveB: 12_000_000,
    totalLpTokens: 5_000_000,
    feePercent: 0.05,
    tvlAda: 60_000_000,
    volume24h: 8_000_000,
    fees24h: 4_000,
    apy: 2.4,
    priceChange24h: -0.12,
    state: "ACTIVE",
  },
  {
    id: "pool_ada_meld",
    assetA: TOKENS.ADA,
    assetB: TOKENS.MELD,
    reserveA: 15_000_000,
    reserveB: 45_000_000,
    totalLpTokens: 3_000_000,
    feePercent: 0.3,
    tvlAda: 30_000_000,
    volume24h: 1_200_000,
    fees24h: 3_600,
    apy: 4.4,
    priceChange24h: -2.18,
    state: "ACTIVE",
  },
  {
    id: "pool_ada_min",
    assetA: TOKENS.ADA,
    assetB: TOKENS.MIN,
    reserveA: 20_000_000,
    reserveB: 120_000_000,
    totalLpTokens: 4_000_000,
    feePercent: 0.3,
    tvlAda: 40_000_000,
    volume24h: 3_500_000,
    fees24h: 10_500,
    apy: 9.6,
    priceChange24h: 1.82,
    state: "ACTIVE",
  },
  {
    id: "pool_ada_indy",
    assetA: TOKENS.ADA,
    assetB: TOKENS.INDY,
    reserveA: 8_000_000,
    reserveB: 2_000_000,
    totalLpTokens: 1_500_000,
    feePercent: 0.3,
    tvlAda: 16_000_000,
    volume24h: 900_000,
    fees24h: 2_700,
    apy: 6.2,
    priceChange24h: 3.45,
    state: "ACTIVE",
  },
  {
    id: "pool_ada_snek",
    assetA: TOKENS.ADA,
    assetB: TOKENS.SNEK,
    reserveA: 12_000_000,
    reserveB: 60_000_000_000,
    totalLpTokens: 2_500_000,
    feePercent: 0.3,
    tvlAda: 24_000_000,
    volume24h: 4_000_000,
    fees24h: 12_000,
    apy: 18.3,
    priceChange24h: 12.5,
    state: "ACTIVE",
  },
  {
    id: "pool_ada_wmt",
    assetA: TOKENS.ADA,
    assetB: TOKENS.WMT,
    reserveA: 6_000_000,
    reserveB: 10_000_000,
    totalLpTokens: 2_000_000,
    feePercent: 0.3,
    tvlAda: 12_000_000,
    volume24h: 500_000,
    fees24h: 1_500,
    apy: 4.6,
    priceChange24h: -0.75,
    state: "ACTIVE",
  },
];

// ─── Analytics ──────────────────────────────
export const MOCK_ANALYTICS = {
  tvl: 192_000_000,
  volume24h: 20_600_000,
  volume7d: 125_000_000,
  fees24h: 41_800,
  totalPools: 7,
  totalIntents: 1_247,
  intentsFilled: 1_189,
  fillRate: 95.35,
  uniqueTraders: 342,
};

// ─── Intent / Order Data ────────────────────
export type IntentStatus =
  | "CREATED" | "PENDING" | "ACTIVE" | "FILLING"
  | "FILLED" | "CANCELLED" | "EXPIRED" | "RECLAIMED";

export interface Intent {
  id: string;
  status: IntentStatus;
  creator: string;
  inputTicker: string;
  outputTicker: string;
  inputAmount: number;
  minOutput: number;
  actualOutput?: number;
  deadline: string;
  createdAt: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
}

export const MOCK_INTENTS: Intent[] = [
  {
    id: "intent_001",
    status: "FILLED",
    creator: "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
    inputTicker: "ADA",
    outputTicker: "HOSKY",
    inputAmount: 100,
    minOutput: 4_900_000_000,
    actualOutput: 4_987_234_567,
    deadline: "2026-02-18T12:00:00Z",
    createdAt: "2026-02-17T10:30:00Z",
    escrowTxHash: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    settlementTxHash: "b2c3d4e5f67890123456789012345678901234567890abcdef1234567890abcd",
  },
  {
    id: "intent_002",
    status: "ACTIVE",
    creator: "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
    inputTicker: "ADA",
    outputTicker: "MIN",
    inputAmount: 500,
    minOutput: 2_800,
    deadline: "2026-02-18T18:00:00Z",
    createdAt: "2026-02-17T14:00:00Z",
    escrowTxHash: "c3d4e5f678901234567890123456789012345678901234567890abcdef123456",
  },
  {
    id: "intent_003",
    status: "CANCELLED",
    creator: "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
    inputTicker: "DJED",
    outputTicker: "ADA",
    inputAmount: 1_000,
    minOutput: 2_600,
    deadline: "2026-02-17T06:00:00Z",
    createdAt: "2026-02-16T22:00:00Z",
  },
  {
    id: "intent_004",
    status: "PENDING",
    creator: "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
    inputTicker: "ADA",
    outputTicker: "SNEK",
    inputAmount: 200,
    minOutput: 9_500_000,
    deadline: "2026-02-18T23:59:59Z",
    createdAt: "2026-02-17T16:30:00Z",
    escrowTxHash: "d4e5f6789012345678901234567890123456789012345678901234567890abcd",
  },
];

// ─── Portfolio Data ─────────────────────────
export interface PortfolioPosition {
  poolId: string;
  assetATicker: string;
  assetBTicker: string;
  lpTokens: number;
  valueAda: number;
  pnl: number;
  pnlPercent: number;
  sharePercent: number;
}

export const MOCK_PORTFOLIO = {
  totalValueAda: 150_000,
  totalPnl: 5_000,
  totalPnlPercent: 3.45,
  openIntents: 2,
  activeOrders: 1,
  positions: [
    {
      poolId: "pool_ada_hosky",
      assetATicker: "ADA",
      assetBTicker: "HOSKY",
      lpTokens: 50_000,
      valueAda: 14_000,
      pnl: 520,
      pnlPercent: 3.71,
      sharePercent: 5.0,
    },
    {
      poolId: "pool_ada_djed",
      assetATicker: "ADA",
      assetBTicker: "DJED",
      lpTokens: 100_000,
      valueAda: 8_000,
      pnl: 96,
      pnlPercent: 1.2,
      sharePercent: 2.0,
    },
    {
      poolId: "pool_ada_snek",
      assetATicker: "ADA",
      assetBTicker: "SNEK",
      lpTokens: 30_000,
      valueAda: 6_000,
      pnl: -150,
      pnlPercent: -2.44,
      sharePercent: 1.2,
    },
  ] as PortfolioPosition[],
};

// ─── Mock Wallet ────────────────────────────
export const MOCK_WALLET = {
  isConnected: true,
  address: "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
  balances: {
    ADA: 1_500_000_000, // 1,500 ADA in lovelace
    HOSKY: 10_000_000_000,
    DJED: 2_500_000_000,
    MELD: 15_000_000_000,
    MIN: 8_000_000_000,
    INDY: 500_000_000,
    SNEK: 25_000_000_000,
    WMT: 3_000_000_000,
  } as Record<string, number>,
};

// ─── Candlestick (OHLCV) Mock ───────────────
export interface Candle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function generateMockCandles(days: number = 30): Candle[] {
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  const fourHours = 4 * 60 * 60;
  const count = (days * 24) / 4;
  let price = 0.40; // starting ADA price

  for (let i = count; i >= 0; i--) {
    const time = now - i * fourHours;
    const change = (Math.random() - 0.48) * 0.02;
    const open = price;
    price = Math.max(0.01, price * (1 + change));
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = 100_000 + Math.random() * 500_000;
    candles.push({ time, open, high, low, close, volume });
  }

  return candles;
}

// ─── Recent Trades ──────────────────────────
export interface RecentTrade {
  id: string;
  poolId: string;
  direction: "buy" | "sell";
  inputTicker: string;
  outputTicker: string;
  inputAmount: number;
  outputAmount: number;
  price: number;
  timestamp: string;
  txHash: string;
}

export const MOCK_RECENT_TRADES: RecentTrade[] = [
  {
    id: "trade_001",
    poolId: "pool_ada_hosky",
    direction: "buy",
    inputTicker: "ADA",
    outputTicker: "HOSKY",
    inputAmount: 50,
    outputAmount: 2_500_000_000,
    price: 0.00000002,
    timestamp: "2026-02-17T16:45:00Z",
    txHash: "e5f6789012345678901234567890123456789012345678901234567890abcdef",
  },
  {
    id: "trade_002",
    poolId: "pool_ada_hosky",
    direction: "sell",
    inputTicker: "HOSKY",
    outputTicker: "ADA",
    inputAmount: 5_000_000_000,
    outputAmount: 98,
    price: 0.0000000196,
    timestamp: "2026-02-17T16:30:00Z",
    txHash: "f6789012345678901234567890123456789012345678901234567890abcdef01",
  },
  {
    id: "trade_003",
    poolId: "pool_ada_hosky",
    direction: "buy",
    inputTicker: "ADA",
    outputTicker: "HOSKY",
    inputAmount: 200,
    outputAmount: 9_800_000_000,
    price: 0.0000000204,
    timestamp: "2026-02-17T16:15:00Z",
    txHash: "06789012345678901234567890123456789012345678901234567890abcdef12",
  },
  {
    id: "trade_004",
    poolId: "pool_ada_min",
    direction: "buy",
    inputTicker: "ADA",
    outputTicker: "MIN",
    inputAmount: 1_000,
    outputAmount: 5_800,
    price: 0.1724,
    timestamp: "2026-02-17T15:50:00Z",
    txHash: "16789012345678901234567890123456789012345678901234567890abcdef23",
  },
  {
    id: "trade_005",
    poolId: "pool_ada_djed",
    direction: "buy",
    inputTicker: "ADA",
    outputTicker: "DJED",
    inputAmount: 500,
    outputAmount: 199,
    price: 2.51,
    timestamp: "2026-02-17T15:30:00Z",
    txHash: "26789012345678901234567890123456789012345678901234567890abcdef34",
  },
];

// ─── Performance chart data ─────────────────
export function generatePerformanceData(days: number = 30) {
  const data = [];
  const now = Date.now();
  let value = 145_000;
  for (let i = days; i >= 0; i--) {
    value += (Math.random() - 0.45) * 2000;
    value = Math.max(100_000, value);
    data.push({
      date: new Date(now - i * 86400000).toISOString().split("T")[0],
      value: Math.round(value),
    });
  }
  return data;
}
