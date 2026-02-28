"use client";

import React, { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Loader2,
  DollarSign,
  BarChart3,
  Percent,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PriceChart, TIMEFRAME_TO_INTERVAL, type ChartTimeframe, type ChartMode } from "@/components/features/trading/price-chart";
import { LiquidityForm } from "@/components/features/liquidity/liquidity-form";
import { RecentTradesTable } from "@/components/features/trading/recent-trades-table";
import { TokenPairIcon } from "@/components/ui/token-icon";
import { usePool, useCandles } from "@/lib/hooks";
import { getPoolHistory, type PoolHistoryEntry } from "@/lib/api";
import { formatCompact, cn } from "@/lib/utils";

// Simple hook to fetch pool history
function usePoolHistory(poolId: string | undefined) {
  const [history, setHistory] = React.useState<PoolHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!poolId) return;
    setLoading(true);
    getPoolHistory(poolId, "30d", "1d")
      .then((res) => setHistory(res.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [poolId]);
  return { history, loading };
}

export default function PoolDetailPage() {
  const params = useParams();
  const poolId = params.id as string;

  const { pool, loading: poolLoading } = usePool(poolId);
  const [chartTf, setChartTf] = useState<ChartTimeframe>("4H");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");

  const decimalsA = pool?.assetA.decimals ?? 6;
  const decimalsB = pool?.assetB.decimals ?? 6;
  const { candles, loading: candlesLoading } = useCandles(
    poolId,
    TIMEFRAME_TO_INTERVAL[chartTf],
    decimalsA,
    decimalsB,
  );
  const { history, loading: historyLoading } = usePoolHistory(poolId);

  // Format reserves in human-readable units
  const reserveAHuman = pool ? pool.reserveA / Math.pow(10, decimalsA) : 0;
  const reserveBHuman = pool ? pool.reserveB / Math.pow(10, decimalsB) : 0;
  const priceRatio = reserveAHuman > 0 ? reserveBHuman / reserveAHuman : 0;

  // History stat: build TVL & volume mini summaries
  const historySummary = useMemo(() => {
    if (history.length === 0) return null;
    const latest = history[history.length - 1];
    const earliest = history[0];
    const totalVolume = history.reduce((s, h) => s + (h.volume ?? 0), 0);
    const totalFees = history.reduce((s, h) => s + (h.feeRevenue ?? 0), 0);
    const tvlChange = earliest.tvlAda > 0
      ? ((latest.tvlAda - earliest.tvlAda) / earliest.tvlAda) * 100
      : 0;
    return { totalVolume, totalFees, tvlChange };
  }, [history]);

  if (poolLoading && !pool) {
    return (
      <div className="shell py-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="shell py-12 text-center space-y-4">
        <p className="text-muted-foreground">Pool not found.</p>
        <Link href="/pools">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Pools
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="shell py-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/pools"
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Pools
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">
          {pool.assetA.ticker}/{pool.assetB.ticker}
        </span>
      </div>

      {/* Pool header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="lg" />
          <div>
            <h1 className="text-2xl font-bold">
              {pool.assetA.ticker}/{pool.assetB.ticker}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px]">
                Fee: {pool.feePercent}%
              </Badge>
              <Badge
                variant={pool.priceChange24h >= 0 ? "success" : "destructive"}
                className="text-[10px]"
              >
                {pool.priceChange24h >= 0 ? (
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                )}
                {pool.priceChange24h >= 0 ? "+" : ""}
                {pool.priceChange24h.toFixed(2)}%
              </Badge>
            </div>
          </div>
        </div>

        {/* Quick action */}
        <Link href={`/?pair=${pool.assetA.ticker}-${pool.assetB.ticker}`}>
          <Button variant="outline" size="sm">
            Trade this pair
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TVL", value: `₳ ${formatCompact(pool.tvlAda)}`, icon: <DollarSign className="h-4 w-4" />, sub: historySummary ? `${historySummary.tvlChange >= 0 ? "+" : ""}${historySummary.tvlChange.toFixed(1)}% (30d)` : undefined, subColor: historySummary && historySummary.tvlChange >= 0 ? "text-primary" : "text-destructive" },
          { label: "24h Volume", value: `₳ ${formatCompact(pool.volume24h)}`, icon: <BarChart3 className="h-4 w-4" />, sub: historySummary ? `₳ ${formatCompact(historySummary.totalVolume)} (30d)` : undefined },
          { label: "24h Fees", value: `₳ ${formatCompact(pool.fees24h)}`, icon: <DollarSign className="h-4 w-4" />, sub: historySummary ? `₳ ${formatCompact(historySummary.totalFees)} (30d)` : undefined },
          { label: "APY", value: `${pool.apy.toFixed(1)}%`, icon: <Percent className="h-4 w-4" />, className: "text-primary" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/50 bg-card/50 p-4"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              {s.icon}
              {s.label}
            </div>
            <div className={cn("text-lg font-bold", s.className)}>
              {s.value}
            </div>
            {s.sub && (
              <div className={cn("text-[10px] mt-0.5", s.subColor ?? "text-muted-foreground")}>
                {s.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="sm" />
                  {pool.assetA.ticker}/{pool.assetB.ticker} Price
                </CardTitle>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono">
                    {priceRatio > 0 ? priceRatio.toPrecision(6) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    1 {pool.assetA.ticker} = {priceRatio > 0 ? priceRatio.toPrecision(6) : "—"} {pool.assetB.ticker}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-1">
              {candlesLoading && candles.length === 0 ? (
                <div className="flex items-center justify-center h-[400px]">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PriceChart
                  data={candles}
                  timeframe={chartTf}
                  onTimeframeChange={setChartTf}
                  chartMode={chartMode}
                  onChartModeChange={setChartMode}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Liquidity form */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Manage Liquidity</CardTitle>
            </CardHeader>
            <CardContent>
              <LiquidityForm pool={pool} />
            </CardContent>
          </Card>

          {/* Pool Reserves */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Pool Reserves
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { token: pool.assetA, reserve: reserveAHuman, pct: pool.tvlAda > 0 ? 50 : 0 },
                  { token: pool.assetB, reserve: reserveBHuman, pct: pool.tvlAda > 0 ? 50 : 0 },
                ].map(({ token, reserve }) => (
                  <div key={token.ticker}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{token.logo}</span>
                        <span className="font-medium text-sm">{token.ticker}</span>
                      </div>
                      <span className="font-mono text-sm">
                        {reserve > 1000 ? formatCompact(reserve) : reserve.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: "50%" }} />
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total LP tokens</span>
                  <span className="font-mono">{formatCompact(pool.totalLpTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price ratio</span>
                  <span className="font-mono">
                    1 {pool.assetA.ticker} = {priceRatio > 0 ? priceRatio.toPrecision(6) : "—"} {pool.assetB.ticker}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pool History + Recent trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 30d Pool History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">30-Day Pool History</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-3">
                {/* TVL Timeline */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">TVL Over Time</div>
                  <div className="flex items-end gap-[2px] h-16">
                    {history.map((h, i) => {
                      const maxTvl = Math.max(...history.map((x) => x.tvlAda), 1);
                      const pct = (h.tvlAda / maxTvl) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-primary/40 hover:bg-primary/70 transition-colors"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                          title={`${new Date(h.timestamp).toLocaleDateString()}: ₳ ${formatCompact(h.tvlAda)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{new Date(history[0]?.timestamp).toLocaleDateString()}</span>
                    <span>{new Date(history[history.length - 1]?.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>

                <Separator />

                {/* Daily Volume Timeline */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Daily Volume</div>
                  <div className="flex items-end gap-[2px] h-16">
                    {history.map((h, i) => {
                      const maxVol = Math.max(...history.map((x) => x.volume ?? 0), 1);
                      const pct = ((h.volume ?? 0) / maxVol) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-blue-500/40 hover:bg-blue-500/70 transition-colors"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                          title={`${new Date(h.timestamp).toLocaleDateString()}: ₳ ${formatCompact(h.volume ?? 0)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{new Date(history[0]?.timestamp).toLocaleDateString()}</span>
                    <span>{new Date(history[history.length - 1]?.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No history data available for this pool.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <RecentTradesTable poolId={poolId} limit={10} />
      </div>
    </div>
  );
}
