// ═══════════════════════════════════════════
// React Hooks — Data fetching from backend API
// Uses SWR-like pattern with useState/useEffect
// ═══════════════════════════════════════════
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listPools,
  getPool,
  getAnalyticsOverview,
  listIntents,
  getChartCandles,
  getChartPrice,
  createWsConnection,
  listOrders,
  getPortfolio,
  getPortfolioSummary,
  getPortfolioOpenOrders,
  getPortfolioHistory,
  getPortfolioLiquidity,
  type PoolResponse,
  type PoolListResponse,
  type AnalyticsOverview,
  type IntentListResponse,
  type OrderListResponse,
  type OrderResponse,
  type PortfolioResponse,
  type PortfolioSummary,
  type OpenOrderEntry,
  type OrderHistoryEntry,
  type LpPositionEntry,
  type LpPosition,
  type CandleData,
} from "@/lib/api";
import { TOKENS, type Token } from "@/lib/mock-data";

// ─── Generic fetch hook ─────────────────────
// Implements stale-while-revalidate: shows cached data while background
// fetching, never unmounts content for periodic refreshes.
function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options?: { enabled?: boolean; fallback?: T; refetchInterval?: number }
) {
  const [data, setData] = useState<T | undefined>(options?.fallback);
  const [error, setError] = useState<Error | null>(null);
  // `initialLoading` is true ONLY until the first successful fetch completes.
  // Background refetches never flip this back to true → no spinner flicker.
  const [initialLoading, setInitialLoading] = useState(true);
  // `isRefetching` signals a background refetch is in progress (optional UI indicator).
  const [isRefetching, setIsRefetching] = useState(false);
  const hasFetchedRef = useRef(false);
  // Keep a stable ref to fallback so the reset effect below doesn't recreate on every render
  const fallbackRef = useRef(options?.fallback);

  const fetchData = useCallback(async () => {
    if (options?.enabled === false) {
      setInitialLoading(false);
      return;
    }
    // Only mark as background refetch if we already have data
    if (hasFetchedRef.current) {
      setIsRefetching(true);
    }
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
      hasFetchedRef.current = true;
    } catch (err) {
      setError(err as Error);
    } finally {
      setInitialLoading(false);
      setIsRefetching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When the hook is disabled (e.g. wallet disconnected, poolId removed),
  // reset data back to the fallback so stale results never persist.
  const enabled = options?.enabled;
  useEffect(() => {
    if (enabled === false) {
      setData(fallbackRef.current);
      setError(null);
      setInitialLoading(true);
      hasFetchedRef.current = false;
    }
  }, [enabled]);

  // Auto-refetch interval
  useEffect(() => {
    if (!options?.refetchInterval) return;
    const id = setInterval(fetchData, options.refetchInterval);
    return () => clearInterval(id);
  }, [fetchData, options?.refetchInterval]);

  // `loading` is now only true on the very first fetch (before any data arrives).
  // Components should use `loading` for skeleton/spinner guards, and `isRefetching`
  // for subtle background indicators (e.g. a small spinner in a corner).
  return { data, loading: initialLoading, isRefetching, error, refetch: fetchData };
}

// ─── Pool Helpers ───────────────────────────
export interface NormalizedPool {
  id: string;
  assetA: Token;
  assetB: Token;
  reserveA: number;
  reserveB: number;
  totalLpTokens: number;
  lpPolicyId?: string;
  poolNftAssetName?: string;
  feePercent: number;
  tvlAda: number;
  volume24h: number;
  fees24h: number;
  apy: number;
  priceChange24h: number;
  state: "ACTIVE" | "INACTIVE";
}

/** Decode a Cardano hex-encoded asset name to UTF-8 string. Returns hex untouched if not valid UTF-8. */
function hexToUtf8(hex: string): string {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return hex;
  try {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return hex;
  }
}

function resolveToken(policyId: string, assetName: string, ticker?: string, decimals?: number): Token {
  // ADA special case
  if (!policyId || policyId === "" || assetName === "lovelace") return TOKENS.ADA;

  // Decode hex Cardano assetName → human-readable string (e.g. "484f534b59" → "HOSKY")
  const decodedName = hexToUtf8(assetName);
  const displayTicker = ticker || decodedName;

  // Try to find by explicit ticker first
  if (ticker) {
    const found = Object.values(TOKENS).find(
      (t) => t.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (found) return found;
  }

  // Try to find by decoded assetName as ticker
  if (decodedName !== assetName) {
    const foundByDecoded = Object.values(TOKENS).find(
      (t) => t.ticker.toUpperCase() === decodedName.toUpperCase()
    );
    if (foundByDecoded) return foundByDecoded;
  }

  // Try to find by policyId + assetName
  const found = Object.values(TOKENS).find(
    (t) => t.policyId === policyId && t.assetName === assetName
  );
  if (found) return found;

  // Unknown token — construct from available data, using decoded name for display
  return {
    policyId,
    assetName,
    ticker: displayTicker.slice(0, 10),
    name: displayTicker,
    decimals: decimals ?? 0,
    logo: "🪙",
  };
}

function normalizePool(p: PoolResponse): NormalizedPool {
  const feePercent =
    p.feeDenominator && p.feeDenominator > 0
      ? (p.feeNumerator / p.feeDenominator) * 100
      : p.feeNumerator <= 100
      ? p.feeNumerator * 0.1
      : 0.3;

  // tvlAda, volume24h, fees24h come from backend as lovelace strings → divide by 10^6
  return {
    id: p.poolId,
    assetA: resolveToken(p.assetA.policyId, p.assetA.assetName, p.assetA.ticker, p.assetA.decimals),
    assetB: resolveToken(p.assetB.policyId, p.assetB.assetName, p.assetB.ticker, p.assetB.decimals),
    reserveA: Number(p.reserveA),
    reserveB: Number(p.reserveB),
    totalLpTokens: Number(p.totalLpTokens),
    lpPolicyId: p.lpPolicyId,
    poolNftAssetName: p.poolNftAssetName,
    feePercent,
    tvlAda: Number(p.tvlAda) / 1_000_000,
    volume24h: Number(p.volume24h) / 1_000_000,
    fees24h: Number(p.fees24h) / 1_000_000,
    apy: p.apy ?? 0,
    priceChange24h: 0,
    state: p.state === "ACTIVE" ? "ACTIVE" : "INACTIVE",
  };
}

// ─── Pools Hook ─────────────────────────────
export function usePools(params?: {
  sortBy?: string;
  order?: string;
  search?: string;
  state?: string;
}) {
  const { data, loading, isRefetching, error, refetch } = useApi<PoolListResponse>(
    () =>
      listPools({
        sortBy: params?.sortBy,
        order: params?.order,
        search: params?.search,
        state: params?.state || "ACTIVE",
        limit: "50",
      }),
    [params?.sortBy, params?.order, params?.search, params?.state],
    { refetchInterval: 30_000 }
  );

  const pools: NormalizedPool[] = (data?.data || []).map(normalizePool);

  return { pools, total: data?.pagination?.total ?? pools.length, loading, isRefetching, error, refetch };
}

// ─── Single Pool Hook ───────────────────────
export function usePool(poolId: string | undefined) {
  const { data, loading, isRefetching, error, refetch } = useApi<PoolResponse>(
    () => getPool(poolId!),
    [poolId],
    { enabled: !!poolId, refetchInterval: 15_000 }
  );

  const pool = data ? normalizePool(data) : undefined;
  return { pool, loading, isRefetching, error, refetch };
}

// ─── Analytics Hook ─────────────────────────
export interface NormalizedAnalytics {
  tvl: number;
  volume24h: number;
  volume7d: number;
  fees24h: number;
  totalPools: number;
  totalIntents: number;
  intentsFilled: number;
  fillRate: number;
  uniqueTraders: number;
}

export function useAnalytics() {
  const { data, loading, isRefetching, error, refetch } = useApi<AnalyticsOverview>(
    () => getAnalyticsOverview(),
    [],
    { refetchInterval: 30_000 }
  );

  const analytics: NormalizedAnalytics | undefined = data
    ? {
        // Backend returns tvl/volume/fees as lovelace strings → divide by 10^6 to get ADA
        tvl: Number(data.tvl) / 1_000_000,
        volume24h: Number(data.volume24h) / 1_000_000,
        volume7d: Number(data.volume7d) / 1_000_000,
        fees24h: Number(data.fees24h) / 1_000_000,
        totalPools: data.totalPools,
        totalIntents: data.totalIntents,
        intentsFilled: data.intentsFilled,
        fillRate: data.fillRate,
        uniqueTraders: 0,
      }
    : undefined;

  return { analytics, loading, isRefetching, error, refetch };
}

// ─── Intents Hook ───────────────────────────
export interface NormalizedIntent {
  id: string;
  status: string;
  creator: string;
  inputAsset: string;
  outputAsset: string;
  inputTicker: string;
  outputTicker: string;
  inputDecimals: number;
  outputDecimals: number;
  inputAmount: number;      // base units
  minOutput: number;        // base units
  actualOutput?: number;    // base units
  partialFill: boolean;
  deadline: string;
  createdAt: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
}

function assetToTicker(asset: string): string {
  return assetToToken(asset).ticker;
}

/** Resolve an on-chain asset identifier to a Token with full metadata. */
function assetToToken(asset: string): Token {
  if (!asset || asset === "" || asset === "lovelace") return TOKENS.ADA;
  const dotIdx = asset.indexOf(".");
  const policyId = dotIdx >= 0 ? asset.slice(0, dotIdx) : asset;
  const assetName = dotIdx >= 0 ? asset.slice(dotIdx + 1) : "";
  // First try exact match on policyId + assetName (handles tokens sharing the same policyId)
  const exactMatch = Object.values(TOKENS).find(
    (t) => t.policyId === policyId && t.assetName === assetName
  );
  if (exactMatch) return exactMatch;
  // Fallback: full asset string match
  const found = Object.values(TOKENS).find(
    (t) => `${t.policyId}.${t.assetName}` === asset
  );
  if (found) return found;
  const decoded = hexToUtf8(assetName);
  return {
    policyId,
    assetName,
    ticker: decoded.slice(0, 10) || policyId.slice(0, 8),
    name: decoded || policyId.slice(0, 12),
    decimals: 0,
    logo: "🪙",
  };
}

export function useIntents(params?: { address?: string; status?: string; enabled?: boolean }) {
  // If `address` is explicitly passed but is empty/undefined, disable the fetch
  // so that an unconnected wallet never loads the full global intent list as
  // "user intents".
  const addressEnabled = params?.address !== undefined ? !!params.address : true;
  const hookEnabled = params?.enabled !== false && addressEnabled;
  const { data, loading, isRefetching, error, refetch } = useApi<IntentListResponse>(
    () =>
      listIntents({
        address: params?.address,
        status: params?.status,
        limit: "50",
      }),
    [params?.address, params?.status],
    { enabled: hookEnabled, refetchInterval: hookEnabled ? 15_000 : undefined }
  );

  const intents: NormalizedIntent[] = (data?.data || []).map((i) => {
    const inToken = assetToToken(i.inputAsset);
    const outToken = assetToToken(i.outputAsset);
    return {
      id: i.intentId,
      status: i.status,
      creator: i.creator,
      inputAsset: i.inputAsset,
      outputAsset: i.outputAsset,
      inputTicker: inToken.ticker,
      outputTicker: outToken.ticker,
      inputDecimals: inToken.decimals,
      outputDecimals: outToken.decimals,
      inputAmount: Number(i.inputAmount),
      minOutput: Number(i.minOutput),
      actualOutput: i.actualOutput ? Number(i.actualOutput) : undefined,
      partialFill: i.partialFill ?? false,
      deadline: i.deadline,
      createdAt: i.createdAt,
      escrowTxHash: i.escrowTxHash ?? undefined,
      settlementTxHash: i.settlementTxHash ?? undefined,
    };
  });

  return { intents, total: data?.pagination.total ?? 0, loading, isRefetching, error, refetch };
}

// ─── Candles Hook ───────────────────────────
/**
 * Fetch OHLCV candles for a pool.
 * @param decimalsA — assetA token decimals (e.g. 6 for ADA) used to normalise prices.
 * @param decimalsB — assetB token decimals (e.g. 8 for tBTC).
 * Raw candle prices are reserveB_base / reserveA_base.
 * Human price = rawPrice * 10^(decimalsA - decimalsB).
 */
export function useCandles(
  poolId: string | undefined,
  interval: string = "4h",
  decimalsA: number = 0,
  decimalsB: number = 0,
) {
  const { data, loading, isRefetching, error, refetch } = useApi<CandleData[]>(
    async () => {
      if (!poolId) return [];
      const res = await getChartCandles({
        poolId,
        interval,
        limit: "200",
      });
      const priceFactor = Math.pow(10, decimalsA - decimalsB);
      const volFactor = Math.pow(10, decimalsA || 6);
      return (res.candles || []).map((c) => ({
        time: c.time,
        open: c.open * priceFactor,
        high: c.high * priceFactor,
        low: c.low * priceFactor,
        close: c.close * priceFactor,
        volume: Number(c.volume) / volFactor,
      }));
    },
    [poolId, interval, decimalsA, decimalsB],
    { enabled: !!poolId, fallback: [] }
  );

  // When poolId is absent (pair has no pool), always return [] so the chart
  // never shows stale candles from the previously selected pool.
  return { candles: poolId ? (data || []) : [], loading: poolId ? loading : false, isRefetching, error, refetch };
}

// ─── Price Hook ─────────────────────────────
export function usePrice(poolId: string | undefined) {
  const { data, loading, isRefetching, error } = useApi<string>(
    async () => {
      if (!poolId) return "0";
      const res = await getChartPrice(poolId);
      return res.price;
    },
    [poolId],
    { enabled: !!poolId, refetchInterval: 10_000, fallback: "0" }
  );

  return { price: data || "0", loading, isRefetching, error };
}

// ─── WebSocket Hook ─────────────────────────
export function useWebSocket(
  channels: Array<{ channel: string; params?: Record<string, unknown> }>,
  onMessage?: (type: string, data: unknown) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = createWsConnection();
    if (!ws) return;
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to channels
      channels.forEach((ch) => {
        ws.send(JSON.stringify({ type: "subscribe", channel: ch.channel, params: ch.params }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessage?.(msg.type, msg.data);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(channels)]);

  return { connected };
}

// ─── Orders Hook ────────────────────────────
export interface NormalizedOrder {
  id: string;
  type: string;
  status: string;
  creator: string;
  inputTicker: string;
  outputTicker: string;
  inputAmount: number;
  priceNumerator: number;
  priceDenominator: number;
  totalBudget: number;
  remainingBudget: number;
  executedIntervals: number;
  /** Total number of DCA intervals (null for non-DCA orders) */
  intervalSlots: number | null;
  deadline: number;
  createdAt: string;
}

function normalizeOrder(o: OrderResponse): NormalizedOrder {
  return {
    id: o.orderId,
    type: o.type,
    status: o.status,
    creator: o.creator,
    inputTicker: assetToTicker(o.inputAsset),
    outputTicker: assetToTicker(o.outputAsset),
    inputAmount: Number(o.inputAmount ?? 0),
    priceNumerator: Number(o.priceNumerator ?? 0),
    priceDenominator: Number(o.priceDenominator ?? 1),
    totalBudget: Number(o.totalBudget ?? 0),
    remainingBudget: Number(o.remainingBudget ?? 0),
    executedIntervals: o.executedIntervals,
    intervalSlots: o.intervalSlots ?? null,
    deadline: o.deadline,
    createdAt: o.createdAt,
  };
}

export function useOrders(params?: {
  creator?: string;
  status?: string;
  type?: string;
}) {
  const { data, loading, isRefetching, error, refetch } = useApi<OrderListResponse>(
    () =>
      listOrders({
        creator: params?.creator,
        status: params?.status,
        type: params?.type,
        limit: "50",
      }),
    [params?.creator, params?.status, params?.type],
    { enabled: true, refetchInterval: 15_000 }
  );

  const orders: NormalizedOrder[] = (data?.items || []).map(normalizeOrder);

  return { orders, total: data?.total ?? 0, loading, isRefetching, error, refetch };
}

// ─── Cursor-Paginated Intents ────────────────────────────────────────────────
// Implements cursor-stack navigation: cursorStack[N] = cursor to use for page N.
// Supports millions of records without ever loading the full dataset into memory.
// ─────────────────────────────────────────────────────────────────────────────
export function usePaginatedIntents(params: {
  address?: string;
  status?: string;
  pageSize?: number;
  enabled?: boolean;
}) {
  const pageSize = params.pageSize ?? 20;
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to first page whenever address or status filter changes
  useEffect(() => {
    setCursors([undefined]);
    setPageIndex(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.address, params.status]);

  const addressEnabled = params.address !== undefined ? !!params.address : true;
  const hookEnabled = params.enabled !== false && addressEnabled;
  const cursor = cursors[pageIndex];

  const { data, loading, error, refetch } = useApi<IntentListResponse>(
    () => listIntents({ address: params.address, status: params.status, cursor, limit: String(pageSize) }),
    [params.address, params.status, cursor],
    { enabled: hookEnabled }
  );

  // Capture the next-page cursor returned by the backend
  useEffect(() => {
    const nextCursor = data?.pagination?.cursor;
    if (nextCursor && !cursors[pageIndex + 1]) {
      setCursors(prev => { const n = [...prev]; n[pageIndex + 1] = nextCursor; return n; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pagination?.cursor, pageIndex]);

  const intents: NormalizedIntent[] = (data?.data || []).map((i) => {
    const inToken = assetToToken(i.inputAsset);
    const outToken = assetToToken(i.outputAsset);
    return {
      id: i.intentId, status: i.status, creator: i.creator,
      inputAsset: i.inputAsset, outputAsset: i.outputAsset,
      inputTicker: inToken.ticker, outputTicker: outToken.ticker,
      inputDecimals: inToken.decimals, outputDecimals: outToken.decimals,
      inputAmount: Number(i.inputAmount), minOutput: Number(i.minOutput),
      actualOutput: i.actualOutput ? Number(i.actualOutput) : undefined,
      partialFill: i.partialFill ?? false, deadline: i.deadline,
      createdAt: i.createdAt, escrowTxHash: i.escrowTxHash ?? undefined,
      settlementTxHash: i.settlementTxHash ?? undefined,
    };
  });

  const total = data?.pagination?.total ?? 0;
  const hasMore = data?.pagination?.hasMore ?? false;
  const hasPrev = pageIndex > 0;
  return {
    intents, total, loading, error, refetch, hasMore, hasPrev,
    goNext: () => { if (hasMore) setPageIndex(p => p + 1); },
    goPrev: () => { if (hasPrev) setPageIndex(p => p - 1); },
    page: pageIndex + 1, pageSize,
    rangeStart: total > 0 ? pageIndex * pageSize + 1 : 0,
    rangeEnd: total > 0 ? Math.min((pageIndex + 1) * pageSize, total) : 0,
  };
}

// ─── Cursor-Paginated Orders ──────────────────────────────────────────────────
export function usePaginatedOrders(params: {
  creator?: string;
  status?: string;
  type?: string;
  pageSize?: number;
  enabled?: boolean;
}) {
  const pageSize = params.pageSize ?? 20;
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setCursors([undefined]);
    setPageIndex(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.creator, params.status, params.type]);

  const hookEnabled = params.enabled !== false;
  const cursor = cursors[pageIndex];

  const { data, loading, error, refetch } = useApi<OrderListResponse>(
    () => listOrders({ creator: params.creator, status: params.status, type: params.type, cursor, limit: String(pageSize) }),
    [params.creator, params.status, params.type, cursor],
    { enabled: hookEnabled }
  );

  useEffect(() => {
    const nextCursor = data?.cursor ?? undefined;
    if (nextCursor && !cursors[pageIndex + 1]) {
      setCursors(prev => { const n = [...prev]; n[pageIndex + 1] = nextCursor; return n; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.cursor, pageIndex]);

  const orders: NormalizedOrder[] = (data?.items || []).map(normalizeOrder);
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? (data?.items?.length === pageSize);
  const hasPrev = pageIndex > 0;
  return {
    orders, total, loading, error, refetch, hasMore, hasPrev,
    goNext: () => { if (hasMore) setPageIndex(p => p + 1); },
    goPrev: () => { if (hasPrev) setPageIndex(p => p - 1); },
    page: pageIndex + 1, pageSize,
    rangeStart: total > 0 ? pageIndex * pageSize + 1 : 0,
    rangeEnd: total > 0 ? Math.min((pageIndex + 1) * pageSize, total) : 0,
  };
}

// ─── Cursor-Paginated Pools ───────────────────────────────────────────────────
export function usePaginatedPools(params?: {
  sortBy?: string;
  order?: string;
  search?: string;
  state?: string;
  pageSize?: number;
}) {
  const pageSize = params?.pageSize ?? 12;
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setCursors([undefined]);
    setPageIndex(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.sortBy, params?.order, params?.search, params?.state]);

  const cursor = cursors[pageIndex];

  const { data, loading, isRefetching, error, refetch } = useApi<PoolListResponse>(
    () => listPools({ sortBy: params?.sortBy, order: params?.order, search: params?.search, state: params?.state || "ACTIVE", cursor, limit: String(pageSize) }),
    [params?.sortBy, params?.order, params?.search, params?.state, cursor],
    { refetchInterval: 30_000 }
  );

  useEffect(() => {
    const nextCursor = data?.pagination?.cursor;
    if (nextCursor && !cursors[pageIndex + 1]) {
      setCursors(prev => { const n = [...prev]; n[pageIndex + 1] = nextCursor; return n; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pagination?.cursor, pageIndex]);

  const pools: NormalizedPool[] = (data?.data || []).map(normalizePool);
  const total = data?.pagination?.total ?? pools.length;
  const hasMore = data?.pagination?.hasMore ?? false;
  const hasPrev = pageIndex > 0;
  return {
    pools, total, loading, isRefetching, error, refetch, hasMore, hasPrev,
    goNext: () => { if (hasMore) setPageIndex(p => p + 1); },
    goPrev: () => { if (hasPrev) setPageIndex(p => p - 1); },
    page: pageIndex + 1, pageSize,
    rangeStart: total > 0 ? pageIndex * pageSize + 1 : 0,
    rangeEnd: total > 0 ? Math.min((pageIndex + 1) * pageSize, total) : 0,
  };
}

// ─── Portfolio Hook ─────────────────────────
export function usePortfolio(address: string | undefined) {
  const { data, loading, isRefetching, error, refetch } = useApi<PortfolioResponse>(
    () => getPortfolio(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000 }
  );

  return { portfolio: data, loading, isRefetching, error, refetch };
}

// ─── Portfolio Summary Hook ─────────────────
export function usePortfolioSummary(address: string | undefined) {
  const { data, loading, isRefetching, error, refetch } = useApi<PortfolioSummary>(
    () => getPortfolioSummary(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000 }
  );

  return { summary: data, loading, isRefetching, error, refetch };
}

// ─── Portfolio Open Orders Hook ─────────────
export function usePortfolioOpenOrders(address: string | undefined) {
  const { data, loading, isRefetching, error, refetch } = useApi<OpenOrderEntry[]>(
    () => getPortfolioOpenOrders(address!),
    [address],
    { enabled: !!address, refetchInterval: 15_000, fallback: [] }
  );

  return { openOrders: data || [], loading, isRefetching, error, refetch };
}

// ─── Portfolio History Hook ─────────────────
export function usePortfolioHistory(
  address: string | undefined,
  statusFilter?: string
) {
  const { data, loading, isRefetching, error, refetch } = useApi<OrderHistoryEntry[]>(
    () => getPortfolioHistory(address!, { status: statusFilter }),
    [address, statusFilter],
    { enabled: !!address, refetchInterval: 30_000, fallback: [] }
  );

  return { history: data || [], loading, isRefetching, error, refetch };
}

// ─── Portfolio LP Positions Hook ────────────
export function usePortfolioLiquidity(address: string | undefined) {
  const { data, loading, isRefetching, error, refetch } = useApi<LpPositionEntry[]>(
    () => getPortfolioLiquidity(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000, fallback: [] }
  );

  return { positions: data || [], loading, isRefetching, error, refetch };
}
/**
 * Fetches REAL on-chain LP token positions from the upgraded
 * GET /portfolio/:address endpoint (which uses IChainProvider to scan UTxOs).
 */
export function usePortfolioLpPositions(address: string | undefined) {
  const { data, loading, isRefetching, error, refetch } = useApi<PortfolioResponse>(
    () => getPortfolio(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000 }
  );

  const lpPositions: LpPosition[] = data?.lpPositions ?? [];
  return { lpPositions, loading, isRefetching, error, refetch };
}