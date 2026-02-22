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

export interface CreatePoolResponse {
  poolId: string;
  unsignedTx?: string;
  lpTokens?: string;
}

export async function createPool(body: CreatePoolRequest): Promise<CreatePoolResponse> {
  return apiFetch<CreatePoolResponse>("/pools/create", {
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

// ─── Orders (Limit / DCA / StopLoss) ────────
export interface OrderResponse {
  orderId: string;
  type: string;
  status: string;
  creator: string;
  inputAsset: string;
  outputAsset: string;
  inputAmount: string | null;
  priceNumerator: string | null;
  priceDenominator: string | null;
  totalBudget: string | null;
  amountPerInterval: string | null;
  intervalSlots: number | null;
  remainingBudget: string | null;
  executedIntervals: number;
  deadline: number;
  escrowTxHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListResponse {
  items: OrderResponse[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface CreateOrderRequest {
  type: "LIMIT" | "DCA" | "STOP_LOSS";
  inputAsset: string;
  outputAsset: string;
  inputAmount: string;
  priceNumerator: string;
  priceDenominator: string;
  totalBudget?: string;
  amountPerInterval?: string;
  intervalSlots?: number;
  deadline: number;
  senderAddress: string;
  changeAddress: string;
}

export interface CreateOrderResponse {
  orderId: string;
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  status: string;
}

export async function createOrder(
  body: CreateOrderRequest
): Promise<CreateOrderResponse> {
  return apiFetch("/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listOrders(params?: {
  creator?: string;
  status?: string;
  type?: string;
  cursor?: string;
  limit?: string;
}): Promise<OrderListResponse> {
  return apiFetch("/orders", {
    params: params as Record<string, string>,
  });
}

export async function getOrder(orderId: string): Promise<OrderResponse> {
  return apiFetch(`/orders/${orderId}`);
}

export async function cancelOrder(
  orderId: string,
  senderAddress: string
): Promise<{ orderId: string; unsignedTx: string; status: string }> {
  return apiFetch(`/orders/${orderId}`, {
    method: "DELETE",
    body: JSON.stringify({ senderAddress }),
  });
}

// ─── TX Submit / Confirm ────────────────────
export interface SubmitTxRequest {
  signedTx: string;
  intentId?: string;
}

export async function submitTx(
  body: SubmitTxRequest
): Promise<{ txHash: string; status: string }> {
  return apiFetch("/tx/submit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function confirmTx(body: {
  txHash: string;
  intentId?: string;
  action?: string;
}): Promise<{ status: string }> {
  return apiFetch("/tx/confirm", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getTxStatus(
  txHash: string
): Promise<{ txHash: string; status: string; confirmations?: number }> {
  return apiFetch(`/tx/${txHash}/status`);
}

// ─── Portfolio ──────────────────────────────

/** On-chain LP position returned by the upgraded GetPortfolio use-case. */
export interface LpPosition {
  poolId: string;
  assetATicker?: string;
  assetBTicker?: string;
  assetAPolicyId: string;
  assetBPolicyId: string;
  lpPolicyId: string;
  /** bigint serialized as decimal string by JSON serializer */
  lpBalance: string;
}

export interface PortfolioResponse {
  address: string;
  intents: { active: number; filled: number; total: number };
  orders: { active: number; filled: number; total: number };
  pools: { totalPools: number };
  /** Real LP token positions resolved from on-chain UTxOs (requires IChainProvider). */
  lpPositions?: LpPosition[];
}

export async function getPortfolio(
  address: string
): Promise<PortfolioResponse> {
  return apiFetch(`/portfolio/${address}`);
}

// Portfolio Summary (asset overview, allocation, status breakdown)
export interface PortfolioSummary {
  total_balance_usd: number;
  total_balance_ada: number;
  status_breakdown: {
    available_in_wallet: number;
    locked_in_orders: number;
    locked_in_lp: number;
  };
  allocation_chart: Array<{
    asset: string;
    percentage: number;
    value_usd: number;
  }>;
}

export async function getPortfolioSummary(
  walletAddress: string
): Promise<PortfolioSummary> {
  return apiFetch("/portfolio/summary", {
    params: { wallet_address: walletAddress },
  });
}

// Open Orders
export interface OpenOrderEntry {
  utxo_ref: string;
  created_at: number;
  pair: string;
  type: "SWAP" | "LIMIT" | "DCA" | "STOP_LOSS";
  conditions: {
    target_price?: number;
    trigger_price?: number;
    slippage_percent?: number;
  };
  budget: {
    initial_amount: number;
    remaining_amount: number;
    progress_percent: number;
    progress_text: string;
  };
  deadline: number;
  is_expired: boolean;
  available_action: "CANCEL" | "RECLAIM";
}

export async function getPortfolioOpenOrders(
  walletAddress: string,
  limit: number = 20
): Promise<OpenOrderEntry[]> {
  return apiFetch("/portfolio/open-orders", {
    params: { wallet_address: walletAddress, limit: String(limit) },
  });
}

// Order History
export interface OrderHistoryEntry {
  order_id: string;
  completed_at: number;
  pair: string;
  type: string;
  status: "FILLED" | "CANCELLED" | "RECLAIMED";
  execution: {
    average_price: number;
    total_value_usd: number;
    total_asset_received: number;
  };
  explorer_links: string[];
}

export async function getPortfolioHistory(
  walletAddress: string,
  params?: { status?: string; page?: number }
): Promise<OrderHistoryEntry[]> {
  return apiFetch("/portfolio/history", {
    params: {
      wallet_address: walletAddress,
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.page ? { page: String(params.page) } : {}),
    },
  });
}

// LP Positions
export interface LpPositionEntry {
  pool_id: string;
  pair: string;
  lp_balance: number;
  share_percent: number;
  current_value: {
    asset_a_amount: number;
    asset_b_amount: number;
    total_value_usd: number;
  };
}

export async function getPortfolioLiquidity(
  walletAddress: string
): Promise<LpPositionEntry[]> {
  return apiFetch("/portfolio/liquidity", {
    params: { wallet_address: walletAddress },
  });
}

// Portfolio Actions — build TX for cancel/reclaim
export async function buildPortfolioAction(body: {
  wallet_address: string;
  utxo_ref: string;
  action_type: "CANCEL" | "RECLAIM";
}): Promise<{ unsignedTx: string }> {
  return apiFetch("/portfolio/build-action", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Portfolio Withdraw — build TX for LP withdrawal from portfolio
export async function buildPortfolioWithdraw(body: {
  wallet_address: string;
  pool_id: string;
  lp_tokens_to_burn: number;
}): Promise<{ unsignedTx: string }> {
  return apiFetch("/portfolio/build-withdraw", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface PortfolioTransactionsResponse {
  address: string;
  items: Array<{
    id: string;
    type: string;
    status: string;
    inputAsset: string;
    inputAmount: string;
    outputAsset: string;
    createdAt: string;
  }>;
  total: number;
}

export async function getPortfolioTransactions(
  address: string,
  limit?: number
): Promise<PortfolioTransactionsResponse> {
  return apiFetch(`/portfolio/${address}/transactions`, {
    params: limit ? { limit: String(limit) } : undefined,
  });
}

// ─── Pool History ─────────────────────────────────────────

export interface PoolHistoryEntry {
  timestamp: string;
  tvlAda: number;
  volume: number;
  feeRevenue: number;
  price: number;
}

export async function getPoolHistory(
  poolId: string,
  period: string = "7d",
  interval: string = "1d"
): Promise<{ poolId: string; history: PoolHistoryEntry[] }> {
  return apiFetch(`/pools/${poolId}/history`, {
    params: { period, interval },
  });
}

// ─── Token Analytics ──────────────────────────────────────

export interface TokenAnalytics {
  assetId: string;
  ticker: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  pools: number;
}

export async function getTokenAnalytics(
  assetId: string
): Promise<TokenAnalytics> {
  return apiFetch(`/analytics/tokens/${encodeURIComponent(assetId)}`);
}

// ─── Prices ───────────────────────────────────────────────

export interface PriceEntry {
  assetId: string;
  ticker: string;
  priceAda: number;
  priceUsd: number;
}

export async function getAnalyticsPrices(): Promise<{
  prices: PriceEntry[];
}> {
  return apiFetch("/analytics/prices");
}

// ─── Admin Portal ───────────────────────────────────────────

// Auth check
export interface AdminAuthResponse {
  is_admin: boolean;
  roles: {
    is_factory_admin: boolean;
    is_settings_admin: boolean;
  };
  system_status: {
    current_version: number;
  };
}

export async function checkAdminAuth(
  walletAddress: string
): Promise<AdminAuthResponse> {
  return apiFetch("/admin/auth/check", {
    params: { wallet_address: walletAddress },
  });
}

// Dashboard metrics
export interface AdminDashboardMetrics {
  total_tvl_usd: number;
  volume_24h_usd: number;
  active_pools: number;
  total_pending_fees_usd: number;
  charts: {
    fee_growth_30d: Array<{ date: string; accumulated_usd: number }>;
  };
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  return apiFetch("/admin/dashboard/metrics");
}

// Revenue - pending fees
export interface PendingFeeEntry {
  pool_id: string;
  pair: string;
  pending_fees: {
    asset_a_amount: number;
    asset_b_amount: number;
    total_usd_value: number;
  };
}

export async function getAdminPendingFees(): Promise<PendingFeeEntry[]> {
  return apiFetch("/admin/revenue/pending");
}

// Revenue - build collect
export async function buildCollectFees(body: {
  admin_address: string;
  pool_ids: string[];
}): Promise<{ unsignedTx: string }> {
  return apiFetch("/admin/revenue/build-collect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Settings - current
export interface AdminSettings {
  global_settings: {
    max_protocol_fee_bps: number;
    min_pool_liquidity: number;
    current_version: number;
  };
  factory_settings: {
    admin_vkh: string;
  };
}

export async function getAdminSettings(): Promise<AdminSettings> {
  return apiFetch("/admin/settings/current");
}

// Settings - deploy initial settings
export async function buildDeploySettings(body: {
  admin_address: string;
  protocol_fee_bps: number;
  min_pool_liquidity: number;
  fee_collector_address?: string;
}): Promise<{ unsignedTx: string; txHash: string; estimatedFee: string }> {
  return apiFetch("/admin/settings/build-deploy", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Settings - update global
export async function buildUpdateGlobalSettings(body: {
  admin_address: string;
  new_settings: {
    max_protocol_fee_bps: number;
    min_pool_liquidity: number;
    next_version: number;
  };
}): Promise<{ unsignedTx: string }> {
  return apiFetch("/admin/settings/build-update-global", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Settings - update factory admin
export async function buildUpdateFactoryAdmin(body: {
  current_admin_address: string;
  new_admin_vkh: string;
}): Promise<{ unsignedTx: string }> {
  return apiFetch("/admin/settings/build-update-factory", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Danger zone - burn pool NFT
export async function buildBurnPoolNFT(body: {
  admin_address: string;
  pool_id: string;
}): Promise<{ unsignedTx: string }> {
  return apiFetch("/admin/pools/build-burn", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Admin Solver ─────────────────────────────────────────

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

export async function getSolverStatus(): Promise<SolverStatusResponse> {
  return apiFetch("/admin/solver/status");
}

export async function triggerSolver(): Promise<{ triggered: boolean; message: string }> {
  return apiFetch("/admin/solver/trigger", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ─── Token Registry (R-10) ─────────────────
export interface TokenRegistryEntry {
  policyId: string;
  assetName: string;
  ticker: string;
  decimals: number;
}

export async function fetchTokenRegistry(): Promise<TokenRegistryEntry[]> {
  try {
    const data = await apiFetch<{ tokens: TokenRegistryEntry[]; count: number }>("/tokens");
    return data.tokens;
  } catch {
    return []; // Fallback: return empty; static TOKENS will still be used
  }
}
