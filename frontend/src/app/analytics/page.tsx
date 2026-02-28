"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Droplets,
  Activity,
  Users,
  Zap,
  ArrowRight,
  Loader2,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { TokenPairIcon } from "@/components/ui/token-icon";
import { useAnalytics, usePools, useIntents } from "@/lib/hooks";
import { formatCompact, cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const { analytics, loading: analyticsLoading } = useAnalytics();
  const { pools, loading: poolsLoading } = usePools();
  const { intents: allIntents, loading: intentsLoading } = useIntents({});
  const { intents: recentFilled } = useIntents({ status: "FILLED" });

  const topPools = useMemo(
    () => [...pools].sort((a, b) => b.tvlAda - a.tvlAda).slice(0, 6),
    [pools]
  );

  const topByVolume = useMemo(
    () => [...pools].sort((a, b) => b.volume24h - a.volume24h).slice(0, 6),
    [pools]
  );

  const totalTvl = analytics?.tvl ?? 0;

  // Intent status distribution
  const intentStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of allIntents) {
      counts[i.status] = (counts[i.status] ?? 0) + 1;
    }
    return counts;
  }, [allIntents]);

  const totalIntentsCount = allIntents.length || 1;

  // Pool volume chart max
  const maxVolume = useMemo(
    () => Math.max(...topByVolume.map((p) => p.volume24h), 1),
    [topByVolume]
  );

  return (
    <div className="shell py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Protocol-wide metrics and statistics for SolverNet DEX.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Live data
        </div>
      </div>

      {/* ═══ Key Metrics ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Value Locked",
            value: analytics ? `₳ ${formatCompact(analytics.tvl)}` : "—",
            icon: Droplets,
            color: "text-blue-400",
            bg: "bg-blue-500/5",
            subtitle: `${pools.filter((p) => p.state === "ACTIVE").length} active pools`,
          },
          {
            label: "24h Volume",
            value: analytics ? `₳ ${formatCompact(analytics.volume24h)}` : "—",
            icon: BarChart3,
            color: "text-primary",
            bg: "bg-primary/5",
            subtitle: analytics?.volume7d
              ? `7d: ₳ ${formatCompact(analytics.volume7d)}`
              : undefined,
          },
          {
            label: "24h Fees Earned",
            value: analytics ? `₳ ${formatCompact(analytics.fees24h)}` : "—",
            icon: DollarSign,
            color: "text-yellow-400",
            bg: "bg-yellow-500/5",
            subtitle: analytics
              ? `${((analytics.fees24h / Math.max(analytics.volume24h, 1)) * 100).toFixed(2)}% avg fee`
              : undefined,
          },
          {
            label: "Fill Rate",
            value: analytics ? `${analytics.fillRate.toFixed(1)}%` : "—",
            icon: Target,
            color: "text-green-400",
            bg: "bg-green-500/5",
            subtitle: analytics
              ? `${analytics.intentsFilled?.toLocaleString() ?? 0} filled`
              : undefined,
          },
        ].map((m) => (
          <Card key={m.label} className={cn("border-border/50", m.bg)}>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <m.icon className={cn("h-4 w-4", m.color)} />
              </div>
              <div className="text-2xl font-bold">
                {analyticsLoading && !analytics ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  m.value
                )}
              </div>
              {m.subtitle && (
                <div className="text-[10px] text-muted-foreground">{m.subtitle}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══ Intent Pipeline + Volume by Pool ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Intent Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Intent Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {intentsLoading && allIntents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Status distribution */}
                <div className="space-y-3">
                  {[
                    { status: "FILLED", label: "Filled", icon: CheckCircle, color: "bg-green-500", textColor: "text-green-600" },
                    { status: "ACTIVE", label: "Active", icon: Clock, color: "bg-blue-500", textColor: "text-blue-600" },
                    { status: "PENDING", label: "Pending", icon: Clock, color: "bg-amber-500", textColor: "text-amber-600" },
                    { status: "EXPIRED", label: "Expired", icon: XCircle, color: "bg-red-500", textColor: "text-red-600" },
                    { status: "CANCELLED", label: "Cancelled", icon: XCircle, color: "bg-muted-foreground", textColor: "text-muted-foreground" },
                  ].map(({ status, label, icon: Icon, color, textColor }) => {
                    const count = intentStats[status] ?? 0;
                    const pct = (count / totalIntentsCount) * 100;
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-3.5 w-3.5", textColor)} />
                            <span className="text-muted-foreground">{label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{count}</span>
                            <span className="text-[10px] text-muted-foreground w-12 text-right">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", color)}
                            style={{ width: `${Math.max(pct, 0.5)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator />

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Total Intents</div>
                    <div className="text-xl font-bold mt-1">
                      {(analytics?.totalIntents ?? allIntents.length).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Fill Rate</div>
                    <div className="text-xl font-bold mt-1 text-primary">
                      {(analytics?.fillRate ?? 0).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Active Pools</div>
                    <div className="text-xl font-bold mt-1">
                      {analytics?.totalPools ?? pools.length}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Volume by Pool (bar chart) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              24h Volume by Pool
            </CardTitle>
          </CardHeader>
          <CardContent>
            {poolsLoading && pools.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : topByVolume.length > 0 ? (
              <div className="space-y-3">
                {topByVolume.map((pool) => {
                  const pct = (pool.volume24h / maxVolume) * 100;
                  return (
                    <Link key={pool.id} href={`/pools/${pool.id}`} className="block group">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="sm" />
                          <span className="text-sm font-medium group-hover:text-primary transition-colors">
                            {pool.assetA.ticker}/{pool.assetB.ticker}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold font-mono">
                            ₳ {formatCompact(pool.volume24h)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-blue-500/60 group-hover:bg-blue-500/80 rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No pool data available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Top Pools Table ═══ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              Top Pools by TVL
            </CardTitle>
            <Link href="/pools" className="text-xs text-primary hover:underline">
              View all pools →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {poolsLoading && pools.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">#</th>
                    <th className="text-left px-4 py-2 font-medium">Pool</th>
                    <th className="text-right px-4 py-2 font-medium">TVL</th>
                    <th className="text-right px-4 py-2 font-medium">24h Volume</th>
                    <th className="text-right px-4 py-2 font-medium">24h Fees</th>
                    <th className="text-right px-4 py-2 font-medium">APY</th>
                    <th className="text-right px-4 py-2 font-medium">24h Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topPools.map((pool, idx) => {
                    const tvlPct = totalTvl > 0 ? (pool.tvlAda / totalTvl) * 100 : 0;
                    return (
                      <tr key={pool.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <Link href={`/pools/${pool.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                            <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="sm" />
                            <div>
                              <span className="font-medium">
                                {pool.assetA.ticker}/{pool.assetB.ticker}
                              </span>
                              <div className="text-[10px] text-muted-foreground">
                                {tvlPct.toFixed(1)}% of TVL
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">₳ {formatCompact(pool.tvlAda)}</td>
                        <td className="px-4 py-3 text-right font-mono">₳ {formatCompact(pool.volume24h)}</td>
                        <td className="px-4 py-3 text-right font-mono">₳ {formatCompact(pool.fees24h)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-primary">{pool.apy.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "inline-flex items-center gap-0.5 text-xs font-medium",
                            pool.priceChange24h >= 0 ? "text-green-600" : "text-red-500"
                          )}>
                            {pool.priceChange24h >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {pool.priceChange24h >= 0 ? "+" : ""}
                            {pool.priceChange24h.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {topPools.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No pools available.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Recent Activity ═══ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              Recent Trades
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              Last {Math.min(recentFilled.length, 10)} fills
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentFilled.length > 0 ? (
            <div className="divide-y">
              {recentFilled.slice(0, 10).map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between py-3 px-4 hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="success"
                      className="text-[10px] w-14 justify-center"
                    >
                      FILLED
                    </Badge>
                    <div className="text-sm">
                      <span className="font-mono">
                        {trade.inputAmount.toLocaleString()}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {trade.inputTicker}
                      </span>
                      <ArrowRight className="inline h-3 w-3 mx-1.5 text-muted-foreground" />
                      <span className="font-mono">
                        {(trade.actualOutput ?? trade.minOutput).toLocaleString()}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {trade.outputTicker}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {new Date(trade.createdAt).toLocaleTimeString()}
                    </span>
                    {trade.escrowTxHash && (
                      <a
                        href={`https://preprod.cardanoscan.io/transaction/${trade.escrowTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No recent activity.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
