// ═══════════════════════════════════════════
// API Client — SolverNet DEX Backend
// Connects to the deployed backend on Render
// ═══════════════════════════════════════════

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://tdexms.onrender.com";
const API_V1 = `${API_BASE}/v1`;

// ─── Generic fetch helper ───────────────────
async function apiFetch<T>(
  path: string,
  options?: RequestInit & { params?: Record<string, string> }
): Promise<T> {
  const { params, ...init } = options || {};

  let url = `${API_V1}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message || res.statusText, body?.code);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Health ─────────────────────────────────
export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  services: {
    database: string;
    blockfrost: string;
    cache: string;
  };
}

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch("/health");
}

// ─── Quote ──────────────────────────────────
export interface QuoteResponse {
  inputAsset: string;
  outputAsset: string;
  inputAmount: string;
  outputAmount: string;
  minOutput: string;
  priceImpact: number;
  route: Array<{
    poolId: string;
    type: string;
    inputAsset: string;
    outputAsset: string;
    inputAmount: string;
    outputAmount: string;
    fee: string;
  }>;
  estimatedFees: {
    protocolFee: string;
    networkFee: string;
    solverFee: string;
  };
  expiresAt: string;
  quoteId: string;
}

export async function getQuote(params: {
  inputAsset: string;
  outputAsset: string;
  inputAmount?: string;
  outputAmount?: string;
  slippage?: string;
}): Promise<QuoteResponse> {
  return apiFetch("/quote", { params: params as Record<string, string> });
}

// ─── Intents ────────────────────────────────
export interface IntentResponse {
  intentId: string;
  status: string;
  creator: string;
  inputAsset: string;
  inputAmount: string;
  outputAsset: string;
  minOutput: string;
  actualOutput?: string;
  deadline: string;
  partialFill: boolean;
  escrowTxHash?: string;
  settlementTxHash?: string;
  solverAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntentRequest {
  senderAddress: string;
  inputAsset: string;
  inputAmount: string;
  outputAsset: string;
  minOutput: string;
  deadline: string;
  partialFill?: boolean;
  changeAddress: string;
  quoteId?: string;
}

export interface CreateIntentResponse {
  intentId: string;
  unsignedTx: string;
  txHash: string;
  status: string;
}

export async function createIntent(
  body: CreateIntentRequest
): Promise<CreateIntentResponse> {
  return apiFetch("/intents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getIntent(intentId: string): Promise<IntentResponse> {
  return apiFetch(`/intents/${intentId}`);
}

export async function cancelIntent(
  intentId: string,
  senderAddress?: string
): Promise<{ intentId: string; unsignedTx: string; status: string }> {
  return apiFetch(`/intents/${intentId}`, {
    method: "DELETE",
    body: JSON.stringify({ senderAddress }),
  });
}

export interface IntentListResponse {
  data: Array<{
    intentId: string;
    status: string;
    creator: string;
    inputAsset: string;
    inputAmount: string;
    outputAsset: string;
    minOutput: string;
    deadline: string;
    createdAt: string;
  }>;
  pagination: {
    cursor?: string;
    hasMore: boolean;
    total: number;
  };
}

export async function listIntents(params?: {
  address?: string;
  status?: string;
  cursor?: string;
  limit?: string;
}): Promise<IntentListResponse> {
  return apiFetch("/intents", {
    params: params as Record<string, string>,
  });
}

// ─── Pools ──────────────────────────────────
export interface PoolResponse {
  poolId: string;
  assetA: { policyId: string; assetName: string; ticker?: string; decimals?: number };
  assetB: { policyId: string; assetName: string; ticker?: string; decimals?: number };
  reserveA: string;
  reserveB: string;
  totalLpTokens: string;
  feeNumerator: number;
  feeDenominator?: number;
  state: string;
  tvlAda: string;
  volume24h: string;
  fees24h: string;
  apy?: number;
  createdAt: string;
}

export interface PoolListResponse {
  data: PoolResponse[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
    total: number;
  };
}

export async function listPools(params?: {
  sortBy?: string;
  order?: string;
  search?: string;
  state?: string;
  cursor?: string;
  limit?: string;
}): Promise<PoolListResponse> {
  return apiFetch("/pools", {
    params: params as Record<string, string>,
  });
}

export async function getPool(poolId: string): Promise<PoolResponse> {
  return apiFetch(`/pools/${poolId}`);
}

export interface CreatePoolRequest {
  assetA: string;
  assetB: string;
  initialAmountA: string;
  initialAmountB: string;
  feeNumerator: number;
  creatorAddress: string;
  changeAddress: string;
}

export async function createPool(body: CreatePoolRequest) {
  return apiFetch("/pools/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface DepositRequest {
  amountA: string;
  amountB: string;
  minLpTokens: string;
  senderAddress: string;
  changeAddress: string;
}

export interface DepositResponse {
  unsignedTx: string;
  txHash: string;
  estimatedLpTokens: string;
}

export async function depositLiquidity(poolId: string, body: DepositRequest): Promise<DepositResponse> {
  return apiFetch(`/pools/${poolId}/deposit`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface WithdrawRequest {
  lpTokenAmount: string;
  minAmountA: string;
  minAmountB: string;
  senderAddress: string;
  changeAddress: string;
}

export interface WithdrawResponse {
  unsignedTx: string;
  txHash: string;
  estimatedAmountA: string;
  estimatedAmountB: string;
}

export async function withdrawLiquidity(poolId: string, body: WithdrawRequest): Promise<WithdrawResponse> {
  return apiFetch(`/pools/${poolId}/withdraw`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Analytics ──────────────────────────────
export interface AnalyticsOverview {
  tvl: string;
  volume24h: string;
  volume7d: string;
  fees24h: string;
  totalPools: number;
  totalIntents: number;
  intentsFilled: number;
  fillRate: number;
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return apiFetch("/analytics/overview");
}

// ─── Chart ──────────────────────────────────
export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartCandlesResponse {
  status: string;
  poolId: string;
  interval: string;
  count: number;
  candles: Array<{
    openTime: string;
    closeTime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    txCount: number;
  }>;
}

export async function getChartCandles(params: {
  poolId: string;
  interval?: string;
  from?: string;
  to?: string;
  limit?: string;
}): Promise<ChartCandlesResponse> {
  return apiFetch("/chart/candles", {
    params: params as Record<string, string>,
  });
}

export interface ChartPriceResponse {
  status: string;
  poolId: string;
  price: string;
}

export async function getChartPrice(
  poolId: string
): Promise<ChartPriceResponse> {
  return apiFetch(`/chart/price/${poolId}`);
}

// ─── WebSocket ──────────────────────────────
export function createWsConnection(): WebSocket | null {
  const wsBase = API_BASE.replace(/^http/, "ws");
  try {
    return new WebSocket(`${wsBase}/v1/ws`);
  } catch {
    return null;
  }
}
