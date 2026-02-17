"use client";

import React, { useState, useMemo } from "react";
import { SwapCard } from "@/components/dex/swap-card";
import { PriceChart } from "@/components/dex/price-chart";
import { RecentTradesTable } from "@/components/dex/recent-trades-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_ANALYTICS, MOCK_POOLS, TOKENS, generateMockCandles, type Token } from "@/lib/mock-data";
import { formatCompact } from "@/lib/utils";
import { Activity, TrendingUp, Droplets, Users } from "lucide-react";

const STATS = [
  {
    label: "Total TVL",
    value: formatCompact(MOCK_ANALYTICS.tvl),
    prefix: "₳ ",
    icon: Droplets,
  },
  {
    label: "24h Volume",
    value: formatCompact(MOCK_ANALYTICS.volume24h),
    prefix: "₳ ",
    icon: TrendingUp,
  },
  {
    label: "Intents Filled",
    value: `${MOCK_ANALYTICS.fillRate}%`,
    icon: Activity,
  },
  {
    label: "Active Pools",
    value: MOCK_POOLS.filter((p) => p.state === "ACTIVE").length.toString(),
    icon: Users,
  },
];

export default function SwapPage() {
  const [inputToken, setInputToken] = useState<Token>(TOKENS.ADA);
  const [outputToken, setOutputToken] = useState<Token>(TOKENS.HOSKY);

  // Find pool for chart
  const pool = useMemo(() => {
    return MOCK_POOLS.find(
      (p) =>
        (p.assetA.ticker === inputToken.ticker &&
          p.assetB.ticker === outputToken.ticker) ||
        (p.assetB.ticker === inputToken.ticker &&
          p.assetA.ticker === outputToken.ticker)
    );
  }, [inputToken.ticker, outputToken.ticker]);

  const candles = useMemo(() => generateMockCandles(30), []);

  return (
    <div className="shell py-8 space-y-6">
      {/* Hero */}
      <div className="text-center space-y-3 max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Intent-Based
          <span className="text-primary"> Trading</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Submit your trade intent and let solvers find the best execution path.
          Powered by Cardano smart contracts.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border/50 bg-card/50 p-4 text-center space-y-1"
          >
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" />
              <span className="text-xs">{stat.label}</span>
            </div>
            <div className="text-lg font-bold">
              {stat.prefix && (
                <span className="text-primary">{stat.prefix}</span>
              )}
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Swap card */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Chart */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  <span className="text-lg mr-1">{inputToken.logo}</span>
                  <span className="text-lg ml-1">{outputToken.logo}</span>
                </div>
                {inputToken.ticker}/{outputToken.ticker}
                {pool && (
                  <span className="text-xs text-muted-foreground font-normal">
                    • TVL: ₳ {formatCompact(pool.tvlAda)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PriceChart data={candles} />
            </CardContent>
          </Card>
        </div>

        {/* Swap card */}
        <div className="lg:col-span-2">
          <SwapCard
            inputToken={inputToken}
            outputToken={outputToken}
            onInputTokenChange={setInputToken}
            onOutputTokenChange={setOutputToken}
          />
        </div>
      </div>

      {/* Recent Trades */}
      <RecentTradesTable poolId={pool?.id} limit={15} />

      {/* How it works */}
      <div className="max-w-2xl mx-auto space-y-4">
        <h3 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          How It Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: "1",
              title: "Submit Intent",
              desc: "Specify your trade parameters: tokens, amounts, and deadline.",
            },
            {
              step: "2",
              title: "Solver Matches",
              desc: "Solvers compete to find the optimal execution path for your trade.",
            },
            {
              step: "3",
              title: "On-chain Settlement",
              desc: "Trade is settled atomically on Cardano with guaranteed min output.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                {item.step}
              </div>
              <h4 className="font-semibold text-sm">{item.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
