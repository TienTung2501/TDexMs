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
function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options?: { enabled?: boolean; fallback?: T; refetchInterval?: number }
) {
  const [data, setData] = useState<T | undefined>(options?.fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (options?.enabled === false) return;
    try {
      setLoading(true);
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refetch interval
  useEffect(() => {
    if (!options?.refetchInterval) return;
    const id = setInterval(fetchData, options.refetchInterval);
    return () => clearInterval(id);
  }, [fetchData, options?.refetchInterval]);

  return { data, loading, error, refetch: fetchData };
}

// ─── Pool Helpers ───────────────────────────
export interface NormalizedPool {
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

function resolveToken(policyId: string, assetName: string, ticker?: string, decimals?: number): Token {
  // Try to find by ticker first, then by policyId
  if (ticker) {
    const found = Object.values(TOKENS).find(
      (t) => t.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (found) return found;
  }
  const found = Object.values(TOKENS).find(
    (t) => t.policyId === policyId && t.assetName === assetName
  );
  if (found) return found;

  // ADA special case
  if (!policyId || policyId === "") return TOKENS.ADA;

  // Unknown token, construct from data
  return {
    policyId,
    assetName,
    ticker: ticker || assetName.slice(0, 6),
    name: ticker || "Unknown Token",
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

  return {
    id: p.poolId,
    assetA: resolveToken(p.assetA.policyId, p.assetA.assetName, p.assetA.ticker, p.assetA.decimals),
    assetB: resolveToken(p.assetB.policyId, p.assetB.assetName, p.assetB.ticker, p.assetB.decimals),
    reserveA: Number(p.reserveA),
    reserveB: Number(p.reserveB),
    totalLpTokens: Number(p.totalLpTokens),
    feePercent,
    tvlAda: Number(p.tvlAda),
    volume24h: Number(p.volume24h),
    fees24h: Number(p.fees24h),
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
  const { data, loading, error, refetch } = useApi<PoolListResponse>(
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

  return { pools, total: data?.pagination?.total ?? pools.length, loading, error, refetch };
}

// ─── Single Pool Hook ───────────────────────
export function usePool(poolId: string | undefined) {
  const { data, loading, error, refetch } = useApi<PoolResponse>(
    () => getPool(poolId!),
    [poolId],
    { enabled: !!poolId, refetchInterval: 15_000 }
  );

  const pool = data ? normalizePool(data) : undefined;
  return { pool, loading, error, refetch };
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
  const { data, loading, error, refetch } = useApi<AnalyticsOverview>(
    () => getAnalyticsOverview(),
    [],
    { refetchInterval: 30_000 }
  );

  const analytics: NormalizedAnalytics | undefined = data
    ? {
        tvl: Number(data.tvl),
        volume24h: Number(data.volume24h),
        volume7d: Number(data.volume7d),
        fees24h: Number(data.fees24h),
        totalPools: data.totalPools,
        totalIntents: data.totalIntents,
        intentsFilled: data.intentsFilled,
        fillRate: data.fillRate,
        uniqueTraders: 0,
      }
    : undefined;

  return { analytics, loading, error, refetch };
}

// ─── Intents Hook ───────────────────────────
export interface NormalizedIntent {
  id: string;
  status: string;
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

function assetToTicker(asset: string): string {
  if (!asset || asset === "" || asset === "lovelace") return "ADA";
  const found = Object.values(TOKENS).find(
    (t) => `${t.policyId}.${t.assetName}` === asset || t.policyId === asset
  );
  return found?.ticker || asset.slice(0, 8);
}

export function useIntents(params?: { address?: string; status?: string }) {
  const { data, loading, error, refetch } = useApi<IntentListResponse>(
    () =>
      listIntents({
        address: params?.address,
        status: params?.status,
        limit: "50",
      }),
    [params?.address, params?.status],
    { enabled: true, refetchInterval: 15_000 }
  );

  const intents: NormalizedIntent[] = (data?.data || []).map((i) => ({
    id: i.intentId,
    status: i.status,
    creator: i.creator,
    inputTicker: assetToTicker(i.inputAsset),
    outputTicker: assetToTicker(i.outputAsset),
    inputAmount: Number(i.inputAmount),
    minOutput: Number(i.minOutput),
    deadline: i.deadline,
    createdAt: i.createdAt,
  }));

  return { intents, total: data?.pagination.total ?? 0, loading, error, refetch };
}

// ─── Candles Hook ───────────────────────────
export function useCandles(poolId: string | undefined, interval: string = "4h") {
  const { data, loading, error, refetch } = useApi<CandleData[]>(
    async () => {
      if (!poolId) return [];
      const res = await getChartCandles({
        poolId,
        interval,
        limit: "200",
      });
      return (res.candles || []).map((c) => ({
        time: Math.floor(new Date(c.openTime).getTime() / 1000),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      }));
    },
    [poolId, interval],
    { enabled: !!poolId, fallback: [] }
  );

  return { candles: data || [], loading, error, refetch };
}

// ─── Price Hook ─────────────────────────────
export function usePrice(poolId: string | undefined) {
  const { data, loading, error } = useApi<string>(
    async () => {
      if (!poolId) return "0";
      const res = await getChartPrice(poolId);
      return res.price;
    },
    [poolId],
    { enabled: !!poolId, refetchInterval: 10_000, fallback: "0" }
  );

  return { price: data || "0", loading, error };
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
  const { data, loading, error, refetch } = useApi<OrderListResponse>(
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

  return { orders, total: data?.total ?? 0, loading, error, refetch };
}

// ─── Portfolio Hook ─────────────────────────
export function usePortfolio(address: string | undefined) {
  const { data, loading, error, refetch } = useApi<PortfolioResponse>(
    () => getPortfolio(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000 }
  );

  return { portfolio: data, loading, error, refetch };
}

// ─── Portfolio Summary Hook ─────────────────
export function usePortfolioSummary(address: string | undefined) {
  const { data, loading, error, refetch } = useApi<PortfolioSummary>(
    () => getPortfolioSummary(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000 }
  );

  return { summary: data, loading, error, refetch };
}

// ─── Portfolio Open Orders Hook ─────────────
export function usePortfolioOpenOrders(address: string | undefined) {
  const { data, loading, error, refetch } = useApi<OpenOrderEntry[]>(
    () => getPortfolioOpenOrders(address!),
    [address],
    { enabled: !!address, refetchInterval: 15_000, fallback: [] }
  );

  return { openOrders: data || [], loading, error, refetch };
}

// ─── Portfolio History Hook ─────────────────
export function usePortfolioHistory(
  address: string | undefined,
  statusFilter?: string
) {
  const { data, loading, error, refetch } = useApi<OrderHistoryEntry[]>(
    () => getPortfolioHistory(address!, { status: statusFilter }),
    [address, statusFilter],
    { enabled: !!address, refetchInterval: 30_000, fallback: [] }
  );

  return { history: data || [], loading, error, refetch };
}

// ─── Portfolio LP Positions Hook ────────────
export function usePortfolioLiquidity(address: string | undefined) {
  const { data, loading, error, refetch } = useApi<LpPositionEntry[]>(
    () => getPortfolioLiquidity(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000, fallback: [] }
  );

  return { positions: data || [], loading, error, refetch };
}
/**
 * Fetches REAL on-chain LP token positions from the upgraded
 * GET /portfolio/:address endpoint (which uses IChainProvider to scan UTxOs).
 */
export function usePortfolioLpPositions(address: string | undefined) {
  const { data, loading, error, refetch } = useApi<PortfolioResponse>(
    () => getPortfolio(address!),
    [address],
    { enabled: !!address, refetchInterval: 30_000 }
  );

  const lpPositions: LpPosition[] = data?.lpPositions ?? [];
  return { lpPositions, loading, error, refetch };
}