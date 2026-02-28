"use client";

import React, { useState, useMemo, useEffect } from "react";
import { SwapCard } from "@/components/features/trading/swap-card";
import { OrderEntryCard } from "@/components/features/trading/order-entry-card";
import { PriceChart, TIMEFRAME_TO_INTERVAL, type ChartTimeframe, type ChartMode } from "@/components/features/trading/price-chart";
import { IntentDepth } from "@/components/features/trading/pseudo-orderbook";
import { TradingFooter } from "@/components/features/trading/trading-footer";
import { TokenPairIcon } from "@/components/ui/token-icon";
import { Card, CardContent } from "@/components/ui/card";
import { TOKENS, type Token } from "@/lib/mock-data";
import { useAnalytics, usePools, useCandles, usePrice, useIntents } from "@/lib/hooks";
import { formatCompact, cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronDown,
} from "lucide-react";

export default function SwapPage() {
  const [inputToken, setInputToken] = useState<Token | null>(null);
  const [outputToken, setOutputToken] = useState<Token | null>(null);
  const [pairInitialized, setPairInitialized] = useState(false);
  const [tradeMode, setTradeMode] = useState<"market" | "advanced">("market");
  const [chartTf, setChartTf] = useState<ChartTimeframe>("4H");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");

  const { analytics, loading: analyticsLoading } = useAnalytics();
  const { pools } = usePools();
  const { intents } = useIntents({});

  // Auto-select the highest-volume pool pair on first load
  useEffect(() => {
    if (pairInitialized || pools.length === 0) return;
    const activePools = pools.filter((p) => p.state === "ACTIVE");
    if (activePools.length === 0) return;
    const best = activePools.reduce((a, b) => (b.volume24h > a.volume24h ? b : a), activePools[0]);
    setInputToken(best.assetA);
    setOutputToken(best.assetB);
    setPairInitialized(true);
  }, [pools, pairInitialized]);

  // Find pool for chart — match by policyId (stable) then ticker as fallback
  const pool = useMemo(() => {
    if (!inputToken || !outputToken) return undefined;
    const matchToken = (poolToken: { policyId: string; ticker?: string }, t: { policyId: string; ticker?: string }) =>
      poolToken.policyId === t.policyId ||
      (poolToken.ticker && t.ticker && poolToken.ticker.toUpperCase() === t.ticker.toUpperCase());
    return pools.find(
      (p) =>
        (matchToken(p.assetA, inputToken) && matchToken(p.assetB, outputToken)) ||
        (matchToken(p.assetB, inputToken) && matchToken(p.assetA, outputToken))
    );
  }, [pools, inputToken, outputToken]);

  // Determine direction: is inputToken the pool's assetA?
  const isForward = useMemo(() => {
    if (!pool || !inputToken) return true;
    return (
      pool.assetA.policyId === inputToken.policyId ||
      (pool.assetA.policyId === "" &&
        inputToken.policyId === "" &&
        pool.assetA.ticker?.toUpperCase() === inputToken.ticker?.toUpperCase())
    );
  }, [pool, inputToken]);

  // Decimal-aware candle fetching
  const decimalsA = pool?.assetA.decimals ?? inputToken?.decimals ?? 6;
  const decimalsB = pool?.assetB.decimals ?? outputToken?.decimals ?? 6;
  const { candles, loading: candlesLoading } = useCandles(
    pool?.id,
    TIMEFRAME_TO_INTERVAL[chartTf],
    decimalsA,
    decimalsB,
  );

  // Invert candle data when pair is reversed (input=B, output=A)
  const displayCandles = useMemo(() => {
    if (isForward || candles.length === 0) return candles;
    return candles.map((c) => ({
      ...c,
      open: c.open > 0 ? 1 / c.open : 0,
      high: c.low > 0 ? 1 / c.low : 0,   // high inverts to 1/low
      low: c.high > 0 ? 1 / c.high : 0,   // low inverts to 1/high
      close: c.close > 0 ? 1 / c.close : 0,
    }));
  }, [candles, isForward]);

  // Current price with decimal normalization
  const { price: rawPriceStr } = usePrice(pool?.id);
  const priceNum = useMemo(() => {
    const raw = parseFloat(rawPriceStr) || 0;
    if (raw === 0) return 0;
    // Raw price = reserveB_base / reserveA_base
    // Human price = raw * 10^(decA - decB)
    const humanPrice = raw * Math.pow(10, decimalsA - decimalsB);
    // If user selected pair is reversed (input=B, output=A), invert
    return isForward ? humanPrice : humanPrice > 0 ? 1 / humanPrice : 0;
  }, [rawPriceStr, decimalsA, decimalsB, isForward]);

  const priceChange24h = pool?.priceChange24h ?? 0;

  // Display tokens — fallback while auto-selecting
  const displayInput = inputToken ?? TOKENS.ADA;
  const displayOutput = outputToken ?? TOKENS.ADA;

  // Loading state while pools load and pair auto-selects
  if (!inputToken || !outputToken) {
    return (
      <div className="shell py-4 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading trading pairs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell py-4 space-y-3">
      {/* ══════ Market Info Header ══════ */}
      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 px-4 py-3">
        {/* Pair selector */}
        <div className="flex items-center gap-3">
          <TokenPairIcon tokenA={displayInput} tokenB={displayOutput} size="md" />
          <div>
            <button className="flex items-center gap-1 text-base font-bold hover:text-primary transition-colors">
              {displayInput.ticker}/{displayOutput.ticker}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <div className="text-xs text-muted-foreground">
              {displayInput.name} / {displayOutput.name}
            </div>
          </div>
        </div>

        {/* Price + metrics */}
        <div className="flex items-center gap-6">
          {/* Current price */}
          <div className="text-right">
            <div className="text-lg font-bold font-mono">
              {priceNum > 0 ? priceNum.toPrecision(6) : "—"}
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
              {analyticsLoading && !analytics ? (
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
              {analyticsLoading && !analytics ? (
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
              {analyticsLoading && !analytics ? (
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
              {analyticsLoading && !analytics ? (
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
                    <TokenPairIcon tokenA={displayInput} tokenB={displayOutput} size="sm" />
                    <span className="text-sm font-semibold">
                      {displayInput.ticker}/{displayOutput.ticker}
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
                {candlesLoading && displayCandles.length === 0 ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <PriceChart
                    data={displayCandles}
                    timeframe={chartTf}
                    onTimeframeChange={setChartTf}
                    chartMode={chartMode}
                    onChartModeChange={setChartMode}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MIDDLE: Intent Depth (20%) */}
        <div className="hidden lg:block lg:col-span-2 xl:col-span-2">
          <Card className="h-full overflow-hidden">
            <IntentDepth
              intents={intents}
              inputToken={displayInput}
              outputToken={displayOutput}
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
      <TradingFooter
        poolId={pool?.id}
        inputToken={inputToken}
        outputToken={outputToken}
      />
    </div>
  );
}
