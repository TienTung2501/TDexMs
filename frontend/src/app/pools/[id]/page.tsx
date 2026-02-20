"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PriceChart } from "@/components/features/trading/price-chart";
import { LiquidityForm } from "@/components/features/liquidity/liquidity-form";
import { RecentTradesTable } from "@/components/features/trading/recent-trades-table";
import { usePool, useCandles } from "@/lib/hooks";
import { formatCompact, cn } from "@/lib/utils";

export default function PoolDetailPage() {
  const params = useParams();
  const poolId = params.id as string;

  const { pool, loading: poolLoading } = usePool(poolId);
  const { candles, loading: candlesLoading } = useCandles(poolId, "4h");

  if (poolLoading) {
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
          <div className="flex -space-x-2 text-3xl">
           <div className="flex items-center">
                        <span className="text-xl">{pool.assetA.logo}</span>
                        /<span className="text-xl">{pool.assetB.logo}</span>
                        </div>
          </div>
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
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TVL", value: `₳ ${formatCompact(pool.tvlAda)}` },
          { label: "24h Volume", value: `₳ ${formatCompact(pool.volume24h)}` },
          { label: "24h Fees", value: `₳ ${formatCompact(pool.fees24h)}` },
          {
            label: "APY",
            value: `${pool.apy.toFixed(1)}%`,
            className: "text-primary",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/50 bg-card/50 p-4 text-center"
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn("text-lg font-bold mt-1", s.className)}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Price Chart</CardTitle>
            </CardHeader>
            <CardContent>
              {candlesLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PriceChart data={candles} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Liquidity form */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Manage Liquidity</CardTitle>
            </CardHeader>
            <CardContent>
              <LiquidityForm pool={pool} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pool info + Recent trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pool composition */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pool Reserves</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pool.assetA.logo}</span>
                  <span className="font-medium text-sm">
                    {pool.assetA.ticker}
                  </span>
                </div>
                <span className="font-mono text-sm">
                  {formatCompact(pool.reserveA)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pool.assetB.logo}</span>
                  <span className="font-medium text-sm">
                    {pool.assetB.ticker}
                  </span>
                </div>
                <span className="font-mono text-sm">
                  {formatCompact(pool.reserveB)}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total LP tokens</span>
                <span className="font-mono">
                  {formatCompact(pool.totalLpTokens)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price ratio</span>
                <span className="font-mono">
                  1 {pool.assetA.ticker} ={" "}
                  {(pool.reserveB / pool.reserveA).toFixed(4)}{" "}
                  {pool.assetB.ticker}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <RecentTradesTable poolId={poolId} limit={10} />
      </div>
    </div>
  );
}
