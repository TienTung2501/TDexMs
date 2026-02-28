"use client";

import React, { useMemo, useState } from "react";
import { cn, formatCompact } from "@/lib/utils";
import { toHuman } from "@/lib/utils";
import type { NormalizedIntent } from "@/lib/hooks";
import type { Token } from "@/lib/mock-data";

interface IntentDepthProps {
  intents: NormalizedIntent[];
  inputToken: Token;
  outputToken: Token;
  currentPrice?: number;
  className?: string;
}

interface DepthLevel {
  price: number;
  size: number;        // human-readable size (input asset)
  total: number;       // cumulative human-readable size
  count: number;
  side: "buy" | "sell";
}

const LEVELS = 10;

export function IntentDepth({
  intents,
  inputToken,
  outputToken,
  currentPrice = 0,
  className,
}: IntentDepthProps) {
  const [precision, setPrecision] = useState(4);

  const { buys, sells, spread, spreadPct, totalBuySize, totalSellSize } = useMemo(() => {
    const rawBuys: { price: number; size: number }[] = [];
    const rawSells: { price: number; size: number }[] = [];

    // Only show active/pending intents
    const active = intents.filter((i) => i.status === "ACTIVE" || i.status === "PENDING");

    active.forEach((intent) => {
      // Intent spending inputToken for outputToken → buy side (wants outputToken)
      if (
        intent.inputTicker === inputToken.ticker &&
        intent.outputTicker === outputToken.ticker
      ) {
        const inHuman = toHuman(intent.inputAmount, intent.inputDecimals);
        const outHuman = toHuman(intent.minOutput, intent.outputDecimals);
        const price = outHuman > 0 ? inHuman / outHuman : currentPrice;
        rawBuys.push({ price, size: inHuman });
      }
      // Intent spending outputToken for inputToken → sell side
      else if (
        intent.inputTicker === outputToken.ticker &&
        intent.outputTicker === inputToken.ticker
      ) {
        const inHuman = toHuman(intent.inputAmount, intent.inputDecimals);
        const outHuman = toHuman(intent.minOutput, intent.outputDecimals);
        const price = inHuman > 0 ? outHuman / inHuman : currentPrice;
        rawSells.push({ price, size: inHuman });
      }
    });

    // Group by rounded price
    const factor = Math.pow(10, precision);
    const buyMap = new Map<number, { size: number; count: number }>();
    const sellMap = new Map<number, { size: number; count: number }>();

    rawBuys.forEach((b) => {
      const key = Math.floor(b.price * factor) / factor;
      const existing = buyMap.get(key) || { size: 0, count: 0 };
      buyMap.set(key, { size: existing.size + b.size, count: existing.count + 1 });
    });

    rawSells.forEach((a) => {
      const key = Math.ceil(a.price * factor) / factor;
      const existing = sellMap.get(key) || { size: 0, count: 0 };
      sellMap.set(key, { size: existing.size + a.size, count: existing.count + 1 });
    });

    // Sort and compute cumulative
    const sortedBuys = Array.from(buyMap.entries())
      .map(([price, { size, count }]) => ({ price, size, count, side: "buy" as const }))
      .sort((a, b) => b.price - a.price)
      .slice(0, LEVELS);

    const sortedSells = Array.from(sellMap.entries())
      .map(([price, { size, count }]) => ({ price, size, count, side: "sell" as const }))
      .sort((a, b) => a.price - b.price)
      .slice(0, LEVELS);

    let buyTotal = 0;
    const buys: DepthLevel[] = sortedBuys.map((b) => {
      buyTotal += b.size;
      return { ...b, total: buyTotal };
    });

    let sellTotal = 0;
    const sells: DepthLevel[] = sortedSells.map((a) => {
      sellTotal += a.size;
      return { ...a, total: sellTotal };
    });

    const bestBuy = buys[0]?.price ?? 0;
    const bestSell = sells[0]?.price ?? 0;
    const spread = bestSell > 0 && bestBuy > 0 ? bestSell - bestBuy : 0;
    const spreadPct = bestBuy > 0 ? (spread / bestBuy) * 100 : 0;

    return {
      buys,
      sells,
      spread,
      spreadPct,
      totalBuySize: buyTotal,
      totalSellSize: sellTotal,
    };
  }, [intents, inputToken, outputToken, currentPrice, precision]);

  const maxTotal = Math.max(
    buys[buys.length - 1]?.total ?? 0,
    sells[sells.length - 1]?.total ?? 0,
    1
  );

  const hasData = buys.length > 0 || sells.length > 0;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Intent Depth
        </span>
        <div className="flex gap-1">
          {[2, 4, 6].map((p) => (
            <button
              key={p}
              onClick={() => setPrecision(p)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer",
                precision === p
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p}dp
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 gap-1 px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/30">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {!hasData ? (
        /* Empty state — no active intents */
        <div className="flex-1 flex flex-col items-center justify-center px-3 py-6 text-center">
          <div className="text-[10px] text-muted-foreground/70 space-y-1">
            <p className="font-medium">No active intents</p>
            <p>Submit a swap to add depth</p>
          </div>
        </div>
      ) : (
        <>
          {/* Sells (reversed — lowest at bottom, closest to spread) */}
          <div className="flex-1 overflow-hidden flex flex-col justify-end">
            {sells
              .slice()
              .reverse()
              .map((level, i) => (
                <div key={`sell-${i}`} className="relative">
                  <div
                    className="absolute inset-0 bg-destructive/8 origin-right"
                    style={{ width: `${(level.total / maxTotal) * 100}%`, marginLeft: "auto" }}
                  />
                  <div className="relative grid grid-cols-3 gap-1 px-3 py-[3px] text-[11px] font-mono hover:bg-destructive/10 transition-colors">
                    <span className="text-destructive">{level.price.toFixed(precision)}</span>
                    <span className="text-right text-muted-foreground">{formatCompact(level.size)}</span>
                    <span className="text-right text-muted-foreground">{formatCompact(level.total)}</span>
                  </div>
                </div>
              ))}
          </div>

          {/* Spread / current price */}
          <div className="px-3 py-2 border-y border-border/30 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold font-mono text-primary">
                {currentPrice > 0 ? currentPrice.toFixed(precision) : "—"}
              </span>
            </div>
            {spread > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Spread: {spreadPct.toFixed(2)}%
              </span>
            )}
          </div>

          {/* Buys */}
          <div className="flex-1 overflow-hidden">
            {buys.map((level, i) => (
              <div key={`buy-${i}`} className="relative">
                <div
                  className="absolute inset-0 bg-primary/8 origin-right"
                  style={{ width: `${(level.total / maxTotal) * 100}%`, marginLeft: "auto" }}
                />
                <div className="relative grid grid-cols-3 gap-1 px-3 py-[3px] text-[11px] font-mono hover:bg-primary/10 transition-colors">
                  <span className="text-primary">{level.price.toFixed(precision)}</span>
                  <span className="text-right text-muted-foreground">{formatCompact(level.size)}</span>
                  <span className="text-right text-muted-foreground">{formatCompact(level.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Summary bar */}
      {hasData && (
        <div className="px-3 py-1.5 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="text-primary">{buys.reduce((s, l) => s + l.count, 0)} buy intents</span>
          <span className="text-destructive">{sells.reduce((s, l) => s + l.count, 0)} sell intents</span>
        </div>
      )}
    </div>
  );
}
