"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink, Loader2, Wifi, WifiOff } from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import { useIntents, useWebSocket, type NormalizedIntent } from "@/lib/hooks";
import { getPoolSwaps, type PoolSwapEntry } from "@/lib/api";

interface RecentTradesTableProps {
  poolId?: string;
  limit?: number;
}

/** Format amount with decimal shift */
function formatAmount(raw: string | number, decimals: number): string {
  const n = Number(raw) / Math.pow(10, decimals);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: Math.min(decimals, 4) });
}

export function RecentTradesTable({ poolId, limit = 10 }: RecentTradesTableProps) {
  // ─── Pool-specific swaps (from Swap table, filtered by poolId) ───
  const [poolSwaps, setPoolSwaps] = useState<PoolSwapEntry[]>([]);
  const [poolSwapsLoading, setPoolSwapsLoading] = useState(false);

  useEffect(() => {
    if (!poolId) return;
    setPoolSwapsLoading(true);
    getPoolSwaps(poolId, limit)
      .then((res) => setPoolSwaps(res.data ?? []))
      .catch(() => setPoolSwaps([]))
      .finally(() => setPoolSwapsLoading(false));
  }, [poolId, limit]);

  // ─── Global FILLED intents (only when no poolId) ───
  const { intents, loading: intentsLoading } = useIntents(
    poolId ? undefined : { status: "FILLED" }
  );
  const [liveTrades, setLiveTrades] = useState<NormalizedIntent[]>([]);

  // WebSocket for real-time updates
  const channels = useMemo(
    () => [{ channel: "intents", params: poolId ? { poolId } : {} }],
    [poolId]
  );

  const handleWsMessage = useCallback(
    (type: string, data: unknown) => {
      if (type === "intent:update") {
        const d = data as { intentId: string; status: string; settlementTxHash?: string };
        if (d.status === "FILLED") {
          setLiveTrades((prev) => {
            const exists = prev.some((t) => t.id === d.intentId);
            if (exists) return prev;
            return [
              {
                id: d.intentId,
                inputTicker: "?",
                outputTicker: "?",
                inputAmount: 0,
                outputAmount: 0,
                status: "FILLED",
                creator: "",
                createdAt: new Date().toISOString(),
                settlementTxHash: d.settlementTxHash ?? null,
              } as unknown as NormalizedIntent,
              ...prev,
            ].slice(0, limit);
          });
          // Refresh pool swaps on new fill
          if (poolId) {
            getPoolSwaps(poolId, limit)
              .then((res) => setPoolSwaps(res.data ?? []))
              .catch(() => {});
          }
        }
      }
    },
    [limit, poolId]
  );

  const { connected } = useWebSocket(channels, handleWsMessage);

  // ─── Determine which data to render ───
  const isPoolMode = !!poolId;
  const loading = isPoolMode ? poolSwapsLoading : intentsLoading;

  // Global mode: merge live + HTTP-fetched intents
  const globalTrades = useMemo(() => {
    const seen = new Set<string>();
    const merged: NormalizedIntent[] = [];
    for (const t of [...liveTrades, ...intents]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
    return merged.slice(0, limit);
  }, [liveTrades, intents, limit]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Trades</CardTitle>
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (isPoolMode ? poolSwaps.length === 0 : globalTrades.length === 0) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isPoolMode ? (
          /* ── Pool-specific swap records ── */
          poolSwaps.length > 0 ? (
            <div className="space-y-2">
              {poolSwaps.map((swap) => (
                <div
                  key={swap.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Badge
                      variant={swap.direction === "AToB" ? "default" : "secondary"}
                      className="text-[10px] w-14 justify-center"
                    >
                      {swap.direction === "AToB" ? "BUY" : "SELL"}
                    </Badge>
                    <div className="text-sm flex-1 min-w-0">
                      <span className="font-mono">
                        {formatAmount(swap.inputAmount, swap.inputDecimals)}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {swap.inputTicker}
                      </span>
                      <ArrowRight className="inline h-3 w-3 mx-1.5 text-muted-foreground" />
                      <span className="font-mono">
                        {formatAmount(swap.outputAmount, swap.outputDecimals)}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {swap.outputTicker}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {new Date(swap.timestamp).toLocaleTimeString()}
                    </span>
                    <a
                      href={`https://preprod.cardanoscan.io/transaction/${swap.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={`View TX: ${swap.txHash}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No trades for this pool yet.
            </div>
          )
        ) : (
          /* ── Global intents (no poolId filter) ── */
          globalTrades.length > 0 ? (
            <div className="space-y-2">
              {globalTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Badge
                      variant="success"
                      className="text-[10px] w-14 justify-center"
                    >
                      FILLED
                    </Badge>
                    <div className="text-sm flex-1 min-w-0">
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {new Date(trade.createdAt).toLocaleTimeString()}
                    </span>
                    {trade.escrowTxHash && (
                      <a
                        href={`https://preprod.cardanoscan.io/transaction/${trade.escrowTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title={`View TX: ${trade.escrowTxHash}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No recent trades found.
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
