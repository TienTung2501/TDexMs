"use client";

import React, { useMemo, useState } from "react";
import { cn, formatAmount, formatCompact } from "@/lib/utils";
import type { NormalizedIntent, NormalizedOrder } from "@/lib/hooks";
import type { Token } from "@/lib/mock-data";

interface OrderbookProps {
  intents: NormalizedIntent[];
  orders: NormalizedOrder[];
  inputToken: Token;
  outputToken: Token;
  currentPrice?: number;
  className?: string;
}

interface PriceLevel {
  price: number;
  size: number;
  total: number;
  count: number;
  side: "bid" | "ask";
}

const LEVELS = 12;

export function PseudoOrderbook({
  intents,
  orders,
  inputToken,
  outputToken,
  currentPrice = 0,
  className,
}: OrderbookProps) {
  const [precision, setPrecision] = useState(4);

  // Aggregate intents/orders into pseudo price levels
  const { bids, asks, spread, spreadPct } = useMemo(() => {
    // Build bid/ask arrays from active intents + orders
    const rawBids: { price: number; size: number }[] = [];
    const rawAsks: { price: number; size: number }[] = [];

    // Intents that WANT outputToken (buying outputToken = bid)
    intents
      .filter((i) => i.status === "ACTIVE" || i.status === "PENDING")
      .forEach((intent) => {
        if (
          intent.inputTicker === inputToken.ticker &&
          intent.outputTicker === outputToken.ticker
        ) {
          const price =
            intent.minOutput > 0
              ? intent.inputAmount / intent.minOutput
              : currentPrice;
          rawBids.push({ price, size: intent.inputAmount });
        } else if (
          intent.inputTicker === outputToken.ticker &&
          intent.outputTicker === inputToken.ticker
        ) {
          const price =
            intent.inputAmount > 0
              ? intent.minOutput / intent.inputAmount
              : currentPrice;
          rawAsks.push({ price, size: intent.inputAmount });
        }
      });

    // Active limit orders
    orders
      .filter(
        (o) =>
          o.type === "LIMIT" &&
          (o.status === "ACTIVE" || o.status === "PARTIALLY_FILLED")
      )
      .forEach((order) => {
        const price =
          order.priceDenominator > 0
            ? order.priceNumerator / order.priceDenominator
            : currentPrice;
        if (
          order.inputTicker === inputToken.ticker &&
          order.outputTicker === outputToken.ticker
        ) {
          rawBids.push({ price, size: order.inputAmount });
        } else {
          rawAsks.push({ price, size: order.inputAmount });
        }
      });

    // Generate synthetic data if empty (demo purpose)
    if (rawBids.length === 0 && rawAsks.length === 0 && currentPrice > 0) {
      for (let i = 0; i < LEVELS; i++) {
        const bidPrice = currentPrice * (1 - 0.001 * (i + 1));
        const askPrice = currentPrice * (1 + 0.001 * (i + 1));
        const size = Math.random() * 10000 + 1000;
        rawBids.push({ price: bidPrice, size });
        rawAsks.push({ price: askPrice, size });
      }
    }

    // Group by rounded price
    const factor = Math.pow(10, precision);
    const bidMap = new Map<number, { size: number; count: number }>();
    const askMap = new Map<number, { size: number; count: number }>();

    rawBids.forEach((b) => {
      const key = Math.floor(b.price * factor) / factor;
      const existing = bidMap.get(key) || { size: 0, count: 0 };
      bidMap.set(key, { size: existing.size + b.size, count: existing.count + 1 });
    });

    rawAsks.forEach((a) => {
      const key = Math.ceil(a.price * factor) / factor;
      const existing = askMap.get(key) || { size: 0, count: 0 };
      askMap.set(key, { size: existing.size + a.size, count: existing.count + 1 });
    });

    // Sort and compute cumulative
    const sortedBids = Array.from(bidMap.entries())
      .map(([price, { size, count }]) => ({ price, size, count, side: "bid" as const }))
      .sort((a, b) => b.price - a.price)
      .slice(0, LEVELS);

    const sortedAsks = Array.from(askMap.entries())
      .map(([price, { size, count }]) => ({ price, size, count, side: "ask" as const }))
      .sort((a, b) => a.price - b.price)
      .slice(0, LEVELS);

    // Cumulative totals
    let bidTotal = 0;
    const bids: PriceLevel[] = sortedBids.map((b) => {
      bidTotal += b.size;
      return { ...b, total: bidTotal };
    });

    let askTotal = 0;
    const asks: PriceLevel[] = sortedAsks.map((a) => {
      askTotal += a.size;
      return { ...a, total: askTotal };
    });

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const spread = bestAsk - bestBid;
    const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    return { bids, asks, spread, spreadPct };
  }, [intents, orders, inputToken, outputToken, currentPrice, precision]);

  const maxTotal = Math.max(
    bids[bids.length - 1]?.total ?? 0,
    asks[asks.length - 1]?.total ?? 0,
    1
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Order Book
        </span>
        <div className="flex gap-1">
          {[2, 4, 6].map((p) => (
            <button
              key={p}
              onClick={() => setPrecision(p)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded transition-colors",
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

      {/* Asks (reversed - lowest at bottom) */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {asks
          .slice()
          .reverse()
          .map((level, i) => (
            <div key={`ask-${i}`} className="relative">
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
          <span className="text-[10px] text-muted-foreground">
            ≈ ${currentPrice > 0 ? (currentPrice * 0.35).toFixed(2) : "—"} 
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Spread: {spread.toFixed(precision)} ({spreadPct.toFixed(2)}%)
        </span>
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-hidden">
        {bids.map((level, i) => (
          <div key={`bid-${i}`} className="relative">
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
    </div>
  );
}
