"use client";

import React, { useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Droplets,
  Activity,
  Users,
  Zap,
  ArrowRight,
  Loader2,
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
  const { intents: recentFilled, loading: tradesLoading } = useIntents({ status: "FILLED" });

  const topPools = useMemo(
    () => [...pools].sort((a, b) => b.tvlAda - a.tvlAda).slice(0, 5),
    [pools]
  );

  const totalTvl = analytics?.tvl ?? 0;

  return (
    <div className="shell py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Protocol-wide metrics and statistics for SolverNet DEX.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Value Locked",
            value: analytics ? `₳ ${formatCompact(analytics.tvl)}` : "—",
            icon: Droplets,
            color: "text-blue-400",
          },
          {
            label: "24h Volume",
            value: analytics ? `₳ ${formatCompact(analytics.volume24h)}` : "—",
            icon: TrendingUp,
            color: "text-primary",
          },
          {
            label: "7d Volume",
            value: analytics ? `₳ ${formatCompact(analytics.volume7d)}` : "—",
            icon: BarChart3,
            color: "text-purple-400",
          },
          {
            label: "24h Fees",
            value: analytics ? `₳ ${formatCompact(analytics.fees24h)}` : "—",
            icon: Zap,
            color: "text-yellow-400",
          },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <m.icon className={cn("h-4 w-4", m.color)} />
                {m.label}
              </div>
              <div className="text-2xl font-bold">
                {analyticsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  m.value
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Intent metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Intent Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analyticsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Total Intents
                    </div>
                    <div className="text-xl font-bold mt-1">
                      {(analytics?.totalIntents ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Intents Filled
                    </div>
                    <div className="text-xl font-bold mt-1 text-primary">
                      {(analytics?.intentsFilled ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fill Rate</span>
                    <span className="font-semibold text-primary">
                      {(analytics?.fillRate ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={analytics?.fillRate ?? 0} />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Unique Traders</span>
                  </div>
                  <span className="font-semibold">
                    {analytics?.uniqueTraders ?? 0}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top Pools */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              Top Pools by TVL
            </CardTitle>
          </CardHeader>
          <CardContent>
            {poolsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {topPools.map((pool, idx) => {
                  const pct = totalTvl > 0 ? (pool.tvlAda / totalTvl) * 100 : 0;
                  return (
                    <div key={pool.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4">
                            {idx + 1}
                          </span>
                          <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="sm" />
                          <span className="text-sm font-medium">
                            {pool.assetA.ticker}/{pool.assetB.ticker}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            ₳ {formatCompact(pool.tvlAda)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {pct.toFixed(1)}% of TVL
                          </div>
                        </div>
                      </div>
                      <div className="h-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {topPools.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No pools available.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentFilled.length > 0 ? (
            <div className="space-y-2">
              {recentFilled.slice(0, 10).map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-secondary/30"
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
                  <span className="text-xs text-muted-foreground">
                    {new Date(trade.createdAt).toLocaleTimeString()}
                  </span>
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
