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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  MOCK_ANALYTICS,
  MOCK_POOLS,
  MOCK_RECENT_TRADES,
} from "@/lib/mock-data";
import { formatCompact, cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const topPools = useMemo(
    () => [...MOCK_POOLS].sort((a, b) => b.tvlAda - a.tvlAda).slice(0, 5),
    []
  );

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
            value: `₳ ${formatCompact(MOCK_ANALYTICS.tvl)}`,
            icon: Droplets,
            color: "text-blue-400",
          },
          {
            label: "24h Volume",
            value: `₳ ${formatCompact(MOCK_ANALYTICS.volume24h)}`,
            icon: TrendingUp,
            color: "text-primary",
          },
          {
            label: "7d Volume",
            value: `₳ ${formatCompact(MOCK_ANALYTICS.volume7d)}`,
            icon: BarChart3,
            color: "text-purple-400",
          },
          {
            label: "24h Fees",
            value: `₳ ${formatCompact(MOCK_ANALYTICS.fees24h)}`,
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
              <div className="text-2xl font-bold">{m.value}</div>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">
                  Total Intents
                </div>
                <div className="text-xl font-bold mt-1">
                  {MOCK_ANALYTICS.totalIntents.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Intents Filled
                </div>
                <div className="text-xl font-bold mt-1 text-primary">
                  {MOCK_ANALYTICS.intentsFilled.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fill Rate</span>
                <span className="font-semibold text-primary">
                  {MOCK_ANALYTICS.fillRate}%
                </span>
              </div>
              <Progress value={MOCK_ANALYTICS.fillRate} />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Unique Traders</span>
              </div>
              <span className="font-semibold">
                {MOCK_ANALYTICS.uniqueTraders}
              </span>
            </div>
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
            <div className="space-y-3">
              {topPools.map((pool, idx) => {
                const pct = (pool.tvlAda / MOCK_ANALYTICS.tvl) * 100;
                return (
                  <div key={pool.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">
                          {idx + 1}
                        </span>
                        <div className="flex -space-x-1">
                          <div className="flex items-center">
                        <span className="text-xl mr-1">{pool.assetA.logo}</span>
                        /<span className="text-xl ml-1">{pool.assetB.logo}</span>
                        </div>
                        </div>
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {MOCK_RECENT_TRADES.map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-secondary/30"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      trade.direction === "buy" ? "success" : "destructive"
                    }
                    className="text-[10px] w-10 justify-center"
                  >
                    {trade.direction.toUpperCase()}
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
                      {trade.outputAmount.toLocaleString()}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {trade.outputTicker}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(trade.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
