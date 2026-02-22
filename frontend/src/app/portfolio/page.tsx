"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  PieChart,
  Clock,
  History,
  Droplets,
  ExternalLink,
  XCircle,
  RefreshCw,
  Filter,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/providers/wallet-provider";
import { WalletConnectDialog } from "@/components/features/wallet/wallet-connect-dialog";
import { TokenIcon } from "@/components/ui/token-icon";
import {
  usePortfolioSummary,
  usePortfolioOpenOrders,
  usePortfolioHistory,
  usePortfolioLiquidity,
  usePortfolioLpPositions,
} from "@/lib/hooks";
import { buildPortfolioAction } from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";
import { TOKENS } from "@/lib/mock-data";
import { formatCompact, cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────
function formatCountdown(deadline: number): string {
  const diff = deadline * 1000 - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

const TYPE_COLORS: Record<string, string> = {
  SWAP: "bg-primary/10 text-primary",
  LIMIT: "bg-blue-500/10 text-blue-500",
  DCA: "bg-purple-500/10 text-purple-500",
  STOP_LOSS: "bg-amber-500/10 text-amber-500",
};

const STATUS_COLORS: Record<string, string> = {
  FILLED: "bg-green-500/10 text-green-600",
  CANCELLED: "bg-muted text-muted-foreground",
  RECLAIMED: "bg-yellow-500/10 text-yellow-600",
};

const EXPLORER_BASE = "https://preprod.cardanoscan.io/transaction/";

// ─── Main Component ─────────────────────────
export default function PortfolioPage() {
  const { isConnected, address, balances } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const { summary, loading: summaryLoading } = usePortfolioSummary(
    isConnected ? address ?? undefined : undefined
  );
  const {
    openOrders,
    loading: ordersLoading,
    refetch: refetchOrders,
  } = usePortfolioOpenOrders(isConnected ? address ?? undefined : undefined);
  const [historyFilter, setHistoryFilter] = useState<string | undefined>(
    undefined
  );
  const { history, loading: historyLoading } = usePortfolioHistory(
    isConnected ? address ?? undefined : undefined,
    historyFilter
  );
  const { positions, loading: lpLoading } = usePortfolioLiquidity(
    isConnected ? address ?? undefined : undefined
  );
  // Real on-chain LP positions from the upgraded GetPortfolio use-case
  const { lpPositions, loading: lpOnChainLoading } = usePortfolioLpPositions(
    isConnected ? address ?? undefined : undefined
  );
  const hasRealLpData = lpPositions.length > 0;
  const lpTabCount = hasRealLpData ? lpPositions.length : positions.length;
  const lpTabLoading = hasRealLpData ? lpOnChainLoading : lpLoading;

  // Fallback summary from wallet balances when API isn't available yet
  const fallbackSummary = useMemo(() => {
    if (summary) return summary;
    const entries = Object.entries(balances).filter(([, v]) => v > 0);
    const totalAda = entries.reduce((sum, [ticker, amount]) => {
      const token = TOKENS[ticker];
      if (!token) return sum;
      const display =
        token.decimals > 0 ? amount / Math.pow(10, token.decimals) : amount;
      return sum + (ticker === "ADA" ? display : 0);
    }, 0);

    return {
      total_balance_usd: totalAda * 0.5,
      total_balance_ada: totalAda,
      status_breakdown: {
        available_in_wallet: totalAda,
        locked_in_orders: 0,
        locked_in_lp: 0,
      },
      allocation_chart: entries
        .map(([ticker, amount]) => {
          const token = TOKENS[ticker];
          if (!token) return null;
          const display =
            token.decimals > 0
              ? amount / Math.pow(10, token.decimals)
              : amount;
          return {
            asset: ticker,
            percentage: totalAda > 0 ? (display / totalAda) * 100 : 0,
            value_usd: display * 0.5,
          };
        })
        .filter(Boolean) as {
        asset: string;
        percentage: number;
        value_usd: number;
      }[],
    };
  }, [summary, balances]);

  // ─── Cancel / Reclaim handler ──────────────
  const handleAction = async (
    utxoRef: string,
    actionType: "CANCEL" | "RECLAIM"
  ) => {
    if (!address) return;
    await execute(
      () =>
        buildPortfolioAction({
          wallet_address: address,
          utxo_ref: utxoRef,
          action_type: actionType,
        }),
      {
        buildingMsg:
          actionType === "CANCEL"
            ? "Building cancel transaction..."
            : "Building reclaim transaction...",
        successMsg:
          actionType === "CANCEL"
            ? "Order cancelled — funds returned to wallet"
            : "Funds reclaimed to wallet",
        action: actionType.toLowerCase(),
        onSuccess: () => refetchOrders(),
      }
    );
  };

  // ─── Not connected ─────────────────────────
  if (!isConnected) {
    return (
      <div className="shell py-16 text-center space-y-4">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-bold">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Connect your Cardano wallet to view your portfolio, active positions,
          order history and LP positions.
        </p>
        <WalletConnectDialog />
      </div>
    );
  }

  const totalBalance = fallbackSummary.total_balance_ada;
  const breakdown = fallbackSummary.status_breakdown;
  const allocation = fallbackSummary.allocation_chart;
  const availablePct =
    totalBalance > 0
      ? (breakdown.available_in_wallet / totalBalance) * 100
      : 100;
  const lockedPct =
    totalBalance > 0 ? (breakdown.locked_in_orders / totalBalance) * 100 : 0;
  const lpPct =
    totalBalance > 0 ? (breakdown.locked_in_lp / totalBalance) * 100 : 0;

  return (
    <div className="shell py-8 space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* ────── Section 1: Asset Overview ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Total Balance */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-6 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Balance</p>
              {summaryLoading ? (
                <Skeleton className="h-9 w-40 mt-1" />
              ) : (
                <>
                  <p className="text-3xl font-bold">
                    ₳ {formatCompact(totalBalance)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ≈ ${formatCompact(fallbackSummary.total_balance_usd)}
                  </p>
                </>
              )}
            </div>

            {/* Status breakdown bar */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Capital Allocation
              </p>
              <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-primary transition-all"
                  style={{ width: `${availablePct}%` }}
                  title={`Available: ${availablePct.toFixed(1)}%`}
                />
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${lockedPct}%` }}
                  title={`Locked in Orders: ${lockedPct.toFixed(1)}%`}
                />
                <div
                  className="bg-purple-500 transition-all"
                  style={{ width: `${lpPct}%` }}
                  title={`In LP: ${lpPct.toFixed(1)}%`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  Available ({availablePct.toFixed(0)}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Orders ({lockedPct.toFixed(0)}%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                  LP ({lpPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Allocation Chart (horizontal bars) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Token Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : allocation.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tokens found</p>
            ) : (
              <div className="space-y-3">
                {allocation.slice(0, 8).map((item) => {
                  const token = TOKENS[item.asset];
                  return (
                    <div key={item.asset} className="flex items-center gap-3">
                      {token && <TokenIcon token={token} size="sm" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{item.asset}</span>
                          <span className="font-mono text-xs">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={item.percentage}
                          className="h-1.5 mt-1"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-20 text-right">
                        ${formatCompact(item.value_usd)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ────── Section 2–4: Tabs ─────────── */}
      <Tabs defaultValue="open-orders" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
          <TabsTrigger
            value="open-orders"
            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Open Orders
            {openOrders.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {openOrders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            <History className="h-3.5 w-3.5 mr-1.5" />
            Order History
          </TabsTrigger>
          <TabsTrigger
            value="lp-positions"
            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
          >
            <Droplets className="h-3.5 w-3.5 mr-1.5" />
            LP Positions
            {lpTabCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {lpTabCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ──── Open Orders Tab ──── */}
        <TabsContent value="open-orders" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {ordersLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : openOrders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active orders</p>
                  <p className="text-xs mt-1">
                    Place a swap or order on the{" "}
                    <Link href="/" className="text-primary hover:underline">
                      trading page
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Header */}
                  <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase">
                    <div className="col-span-2">Date</div>
                    <div className="col-span-2">Pair & Type</div>
                    <div className="col-span-2">Conditions</div>
                    <div className="col-span-3">Progress</div>
                    <div className="col-span-1">Deadline</div>
                    <div className="col-span-2 text-right">Action</div>
                  </div>

                  {openOrders.map((order) => {
                    const isExpired = order.is_expired;
                    return (
                      <div
                        key={order.utxo_ref}
                        className={cn(
                          "grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 items-center text-sm",
                          isExpired && "bg-destructive/5"
                        )}
                      >
                        {/* Date */}
                        <div className="col-span-2 text-xs text-muted-foreground">
                          {new Date(
                            order.created_at * 1000
                          ).toLocaleDateString()}
                          <br />
                          <span className="text-[10px]">
                            {new Date(
                              order.created_at * 1000
                            ).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Pair & Type */}
                        <div className="col-span-2 flex items-center gap-2">
                          <Badge
                            className={cn(
                              "text-[10px] px-2",
                              TYPE_COLORS[order.type] || "bg-muted"
                            )}
                          >
                            {order.type.replace("_", "-")}
                          </Badge>
                          <span className="font-medium text-xs">
                            {order.pair.replace("_", "/")}
                          </span>
                        </div>

                        {/* Conditions */}
                        <div className="col-span-2 text-xs font-mono text-muted-foreground space-y-0.5">
                          {order.conditions.target_price != null && (
                            <div>
                              Target: {order.conditions.target_price}
                            </div>
                          )}
                          {order.conditions.trigger_price != null && (
                            <div>
                              Trigger: {order.conditions.trigger_price}
                            </div>
                          )}
                          {order.conditions.slippage_percent != null && (
                            <div>
                              Slip: {order.conditions.slippage_percent}%
                            </div>
                          )}
                        </div>

                        {/* Progress */}
                        <div className="col-span-3 space-y-1">
                          <Progress
                            value={order.budget.progress_percent}
                            className="h-2"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{order.budget.progress_text}</span>
                            <span className="font-mono">
                              {order.budget.remaining_amount.toLocaleString()} /{" "}
                              {order.budget.initial_amount.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Deadline */}
                        <div className="col-span-1">
                          {isExpired ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                            >
                              Expired
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {formatCountdown(order.deadline)}
                            </span>
                          )}
                        </div>

                        {/* Action */}
                        <div className="col-span-2 flex justify-end gap-2">
                          {isExpired &&
                          order.available_action === "RECLAIM" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                              onClick={() =>
                                handleAction(order.utxo_ref, "RECLAIM")
                              }
                              disabled={busy}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Reclaim
                            </Button>
                          ) : isExpired ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs animate-pulse"
                              onClick={() =>
                                handleAction(order.utxo_ref, "CANCEL")
                              }
                              disabled={busy}
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Cancel (Expired)
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                handleAction(order.utxo_ref, "CANCEL")
                              }
                              disabled={busy}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──── History Tab ──── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          {/* Filter chips */}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {[
              { label: "All", value: undefined },
              { label: "Filled", value: "FILLED" },
              { label: "Cancelled", value: "CANCELLED" },
              { label: "Reclaimed", value: "RECLAIMED" },
            ].map((f) => (
              <button
                key={f.label}
                onClick={() => setHistoryFilter(f.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  historyFilter === f.value
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No order history yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Header */}
                  <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase">
                    <div className="col-span-2">Date</div>
                    <div className="col-span-2">Type & Pair</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Avg Price</div>
                    <div className="col-span-2">Total Value</div>
                    <div className="col-span-2 text-right">Explorer</div>
                  </div>

                  {history.map((entry) => (
                    <div
                      key={entry.order_id}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 items-center text-sm"
                    >
                      <div className="col-span-2 text-xs text-muted-foreground">
                        {new Date(
                          entry.completed_at * 1000
                        ).toLocaleDateString()}
                      </div>
                      <div className="col-span-2">
                        <Badge
                          className={cn(
                            "text-[10px] mr-1",
                            TYPE_COLORS[entry.type] || "bg-muted"
                          )}
                        >
                          {entry.type}
                        </Badge>
                        <span className="text-xs font-medium">
                          {entry.pair.replace("_", "/")}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <Badge
                          className={cn(
                            "text-[10px]",
                            STATUS_COLORS[entry.status] || "bg-muted"
                          )}
                        >
                          {entry.status}
                        </Badge>
                      </div>
                      <div className="col-span-2 font-mono text-xs">
                        {entry.execution.average_price > 0
                          ? entry.execution.average_price.toFixed(4)
                          : "—"}
                      </div>
                      <div className="col-span-2 font-mono text-xs">
                        ${formatCompact(entry.execution.total_value_usd)}
                      </div>
                      <div className="col-span-2 flex justify-end gap-1">
                        {entry.explorer_links.slice(0, 2).map((txHash, i) => (
                          <a
                            key={i}
                            href={`${EXPLORER_BASE}${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/70"
                            title={txHash}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──── LP Positions Tab ──── */}
        <TabsContent value="lp-positions" className="mt-4 space-y-3">
          {/* Source badge */}
          {hasRealLpData && (
            <div className="flex items-center gap-2 text-[11px] text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 w-fit">
              <Droplets className="h-3 w-3" />
              On-chain UTxO scan — real balances
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              {lpTabLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : hasRealLpData ? (
                /* ── New on-chain LP positions ── */
                <div className="divide-y">
                  {lpPositions.map((pos) => {
                    const tickerA = pos.assetATicker || "Asset A";
                    const tickerB = pos.assetBTicker || "Asset B";
                    const tokenA = pos.assetATicker ? TOKENS[pos.assetATicker] : undefined;
                    const tokenB = pos.assetBTicker ? TOKENS[pos.assetBTicker] : undefined;
                    const lpBalanceNum = Number(pos.lpBalance);
                    return (
                      <div
                        key={pos.poolId}
                        className="flex flex-col md:flex-row md:items-center justify-between px-4 py-4 gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {tokenA && <TokenIcon token={tokenA} size="md" />}
                            {tokenB && <TokenIcon token={tokenB} size="md" />}
                            {!tokenA && !tokenB && (
                              <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-600 text-xs font-bold">
                                LP
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">
                              {tickerA}/{tickerB}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                              Policy: {pos.lpPolicyId.slice(0, 12)}…
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">LP Tokens</p>
                            <p className="font-mono text-sm font-semibold text-purple-500">
                              {formatCompact(lpBalanceNum)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Pool ID</p>
                            <p className="font-mono text-xs text-muted-foreground truncate max-w-[80px]">
                              {pos.poolId.slice(0, 8)}…
                            </p>
                          </div>
                        </div>

                        <Link href={`/pools/${pos.poolId}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            Withdraw
                          </Button>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : positions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Droplets className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No LP positions</p>
                  <p className="text-xs mt-1">
                    Provide liquidity on the{" "}
                    <Link href="/pools" className="text-primary hover:underline">
                      Liquidity page
                    </Link>
                  </p>
                </div>
              ) : (
                /* ── Legacy LP positions (from /portfolio/liquidity) ── */
                <div className="divide-y">
                  {positions.map((pos) => {
                    const [tickerA, tickerB] = pos.pair.split("_");
                    const tokenA = TOKENS[tickerA];
                    const tokenB = TOKENS[tickerB];
                    return (
                      <div
                        key={pos.pool_id}
                        className="flex flex-col md:flex-row md:items-center justify-between px-4 py-4 gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {tokenA && <TokenIcon token={tokenA} size="md" />}
                            {tokenB && <TokenIcon token={tokenB} size="md" />}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">
                              {pos.pair.replace("_", "/")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {pos.share_percent.toFixed(2)}% pool share
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">LP Tokens</p>
                            <p className="font-mono text-sm font-semibold">
                              {formatCompact(pos.lp_balance)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">{tickerA || "Asset A"}</p>
                            <p className="font-mono text-sm">
                              {formatCompact(pos.current_value.asset_a_amount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">{tickerB || "Asset B"}</p>
                            <p className="font-mono text-sm">
                              {formatCompact(pos.current_value.asset_b_amount)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-primary">
                            ≈ ${formatCompact(pos.current_value.total_value_usd)}
                          </span>
                          <Link href={`/pools/${pos.pool_id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs">
                              Withdraw
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TxToastContainer />
    </div>
  );
}
