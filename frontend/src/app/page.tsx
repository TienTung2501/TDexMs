"use client";

import React, { useState, useMemo } from "react";
import { SwapCard } from "@/components/dex/swap-card";
import { OrderEntryCard } from "@/components/dex/order-entry-card";
import { PriceChart, TIMEFRAME_TO_INTERVAL, type ChartTimeframe } from "@/components/dex/price-chart";
import { PseudoOrderbook } from "@/components/dex/pseudo-orderbook";
import { TradingFooter } from "@/components/dex/trading-footer";
import { TokenPairIcon } from "@/components/ui/token-icon";
import { Card, CardContent } from "@/components/ui/card";
import { TOKENS, type Token } from "@/lib/mock-data";
import { useAnalytics, usePools, useCandles, usePrice, useIntents, useOrders } from "@/lib/hooks";
import { formatCompact, cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronDown,
} from "lucide-react";

export default function SwapPage() {
  const [inputToken, setInputToken] = useState<Token>(TOKENS.ADA);
  const [outputToken, setOutputToken] = useState<Token>(TOKENS.tBTC);
  const [tradeMode, setTradeMode] = useState<"market" | "advanced">("market");
  const [chartTf, setChartTf] = useState<ChartTimeframe>("4H");

  const { analytics, loading: analyticsLoading } = useAnalytics();
  const { pools } = usePools();
  const { intents } = useIntents({});
  const { orders } = useOrders({});

  // Find pool for chart
  const pool = useMemo(() => {
    return pools.find(
      (p) =>
        (p.assetA.ticker === inputToken.ticker &&
          p.assetB.ticker === outputToken.ticker) ||
        (p.assetB.ticker === inputToken.ticker &&
          p.assetA.ticker === outputToken.ticker)
    );
  }, [pools, inputToken.ticker, outputToken.ticker]);

  const { candles, loading: candlesLoading } = useCandles(pool?.id, TIMEFRAME_TO_INTERVAL[chartTf]);
  const { price: currentPrice } = usePrice(pool?.id);

  const priceNum = parseFloat(currentPrice) || 0;
  const priceChange24h = pool?.priceChange24h ?? 0;

  return (
    <div className="shell py-4 space-y-3">
      {/* ══════ Market Info Header ══════ */}
      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 px-4 py-3">
        {/* Pair selector */}
        <div className="flex items-center gap-3">
          <TokenPairIcon tokenA={inputToken} tokenB={outputToken} size="md" />
          <div>
            <button className="flex items-center gap-1 text-base font-bold hover:text-primary transition-colors">
              {inputToken.ticker}/{outputToken.ticker}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <div className="text-xs text-muted-foreground">
              {inputToken.name} / {outputToken.name}
            </div>
          </div>
        </div>

        {/* Price + metrics */}
        <div className="flex items-center gap-6">
          {/* Current price */}
          <div className="text-right">
            <div className="text-lg font-bold font-mono">
              {priceNum > 0 ? priceNum.toFixed(6) : "—"}
            </div>
            <div
              className={cn(
                "text-xs font-medium flex items-center gap-0.5 justify-end",
                priceChange24h >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {priceChange24h >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {priceChange24h >= 0 ? "+" : ""}
              {priceChange24h.toFixed(2)}%
            </div>
          </div>

          {/* 24h Volume */}
          <div className="hidden sm:block text-right border-l border-border/50 pl-6">
            <div className="text-[10px] text-muted-foreground uppercase">24h Volume</div>
            <div className="text-sm font-semibold">
              {analyticsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>₳ {analytics ? formatCompact(analytics.volume24h) : "—"}</>
              )}
            </div>
          </div>

          {/* TVL */}
          <div className="hidden md:block text-right border-l border-border/50 pl-6">
            <div className="text-[10px] text-muted-foreground uppercase">TVL</div>
            <div className="text-sm font-semibold">
              {analyticsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>₳ {analytics ? formatCompact(analytics.tvl) : "—"}</>
              )}
            </div>
          </div>

          {/* Fill Rate */}
          <div className="hidden lg:block text-right border-l border-border/50 pl-6">
            <div className="text-[10px] text-muted-foreground uppercase">Fill Rate</div>
            <div className="text-sm font-semibold text-primary">
              {analyticsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>{analytics ? `${analytics.fillRate.toFixed(1)}%` : "—"}</>
              )}
            </div>
          </div>

          {/* Active Pools */}
          <div className="hidden xl:block text-right border-l border-border/50 pl-6">
            <div className="text-[10px] text-muted-foreground uppercase">Pools</div>
            <div className="text-sm font-semibold">
              {analyticsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>{analytics ? analytics.totalPools : "—"}</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════ Main 3-Column Layout ══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* LEFT: Chart (60%) */}
        <div className="lg:col-span-7 xl:col-span-7">
          <Card className="h-full">
            <CardContent className="p-0">
              <div className="p-3 pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TokenPairIcon tokenA={inputToken} tokenB={outputToken} size="sm" />
                    <span className="text-sm font-semibold">
                      {inputToken.ticker}/{outputToken.ticker}
                    </span>
                    {pool && (
                      <span className="text-[10px] text-muted-foreground">
                        TVL: ₳ {formatCompact(pool.tvlAda)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-1">
                {candlesLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <PriceChart
                    data={candles}
                    timeframe={chartTf}
                    onTimeframeChange={setChartTf}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MIDDLE: Orderbook (20%) */}
        <div className="hidden lg:block lg:col-span-2 xl:col-span-2">
          <Card className="h-full overflow-hidden">
            <PseudoOrderbook
              intents={intents}
              orders={orders}
              inputToken={inputToken}
              outputToken={outputToken}
              currentPrice={priceNum}
            />
          </Card>
        </div>

        {/* RIGHT: Order Entry (20%) */}
        <div className="lg:col-span-3 xl:col-span-3">
          {/* Market / Advanced toggle */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mb-3">
            <button
              onClick={() => setTradeMode("market")}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors cursor-pointer ${
                tradeMode === "market"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Market Swap
            </button>
            <button
              onClick={() => setTradeMode("advanced")}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors cursor-pointer ${
                tradeMode === "advanced"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Advanced
            </button>
          </div>

          {tradeMode === "market" ? (
            <SwapCard
              inputToken={inputToken}
              outputToken={outputToken}
              onInputTokenChange={setInputToken}
              onOutputTokenChange={setOutputToken}
              pools={pools}
            />
          ) : (
            <OrderEntryCard pools={pools} />
          )}
        </div>
      </div>

      {/* ══════ Footer Tabs ══════ */}
      <TradingFooter poolId={pool?.id} />
    </div>
  );
}
