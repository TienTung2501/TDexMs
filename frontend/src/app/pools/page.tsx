"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search, TrendingUp, TrendingDown, Droplets, Plus, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenPairIcon } from "@/components/ui/token-icon";
import { usePaginatedPools, useAnalytics } from "@/lib/hooks";
import { formatCompact, cn } from "@/lib/utils";
import { CursorPaginator } from "@/components/ui/paginator";

export default function PoolsPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"tvl" | "volume" | "apy">("tvl");

  const handleSearch = (v: string) => setSearch(v);
  const handleSortBy = (v: "tvl" | "volume" | "apy") => setSortBy(v);

  const {
    pools, total, loading: poolsLoading, isRefetching: poolsRefetching, error: poolsError,
    hasMore, hasPrev, goNext, goPrev, rangeStart, rangeEnd,
  } = usePaginatedPools({ sortBy, search });
  const { analytics, loading: analyticsLoading } = useAnalytics();

  return (
    <div className="shell py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Liquidity Pools</h1>
          <p className="text-sm text-muted-foreground">
            Provide liquidity to earn trading fees.{" "}
            {analytics ? `${analytics.totalPools} active pools.` : ""}
          </p>
        </div>
        <Link href="/pools/create">
          <Button variant="default" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create Pool
          </Button>
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total TVL", value: analytics ? `₳ ${formatCompact(analytics.tvl)}` : "—" },
          { label: "24h Volume", value: analytics ? `₳ ${formatCompact(analytics.volume24h)}` : "—" },
          { label: "24h Fees", value: analytics ? `₳ ${formatCompact(analytics.fees24h)}` : "—" },
          { label: "Active Pools", value: analytics ? `${analytics.totalPools}` : "—" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/50 bg-card/50 p-3 text-center"
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-lg font-bold mt-1">
              {analyticsLoading && !analytics ? (
                <Skeleton className="h-6 w-16 mx-auto" />
              ) : (
                s.value
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pools..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["tvl", "volume", "apy"] as const).map((key) => (
            <button
              key={key}
              onClick={() => handleSortBy(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                sortBy === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {key.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* API error banner */}
      {poolsError && !poolsLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load pools: {poolsError.message}. Please check your connection or try refreshing.</span>
        </div>
      )}

      {/* Pool grid */}
      {poolsLoading && pools.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1"><Skeleton className="h-3 w-8" /><Skeleton className="h-4 w-14" /></div>
                  <div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-14" /></div>
                  <div className="space-y-1"><Skeleton className="h-3 w-8" /><Skeleton className="h-4 w-10" /></div>
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="relative">
        <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", poolsRefetching && "opacity-70 transition-opacity")}>
          {pools.map((pool) => (
            <Link key={pool.id} href={`/pools/${pool.id}`}>
              <Card className="hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer h-full">
                <CardContent className="p-5 space-y-4">
                  {/* Pair header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="md" />
                      <div>
                        <div className="font-semibold text-sm">
                          {pool.assetA.ticker}/{pool.assetB.ticker}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Fee: {pool.feePercent}%
                        </div>
                      </div>
                    </div>
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

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">TVL</div>
                      <div className="text-sm font-semibold">
                        ₳ {formatCompact(pool.tvlAda)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Volume</div>
                      <div className="text-sm font-semibold">
                        ₳ {formatCompact(pool.volume24h)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">APY</div>
                      <div className="text-sm font-semibold text-primary">
                        {pool.apy.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Reserves bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {formatCompact(pool.reserveA)} {pool.assetA.ticker}
                      </span>
                      <span>
                        {formatCompact(pool.reserveB)} {pool.assetB.ticker}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden flex">
                      <div className="bg-primary/60 h-full" style={{ width: "50%" }} />
                      <div className="bg-primary h-full" style={{ width: "50%" }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <CursorPaginator
          total={total}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          hasMore={hasMore}
          hasPrev={hasPrev}
          onNext={goNext}
          onPrev={goPrev}
          loading={poolsLoading}
          className="mt-4"
        />
        </div>
      )}

      {!poolsLoading && pools.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Droplets className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No pools found matching your search.</p>
        </div>
      )}
    </div>
  );
}
