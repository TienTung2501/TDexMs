"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink, Loader2, Wifi, WifiOff } from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import { useIntents, useWebSocket, type NormalizedIntent } from "@/lib/hooks";

interface RecentTradesTableProps {
  poolId?: string;
  limit?: number;
}

export function RecentTradesTable({ poolId, limit = 10 }: RecentTradesTableProps) {
  const { intents, loading } = useIntents({ status: "FILLED" });
  const [liveTrades, setLiveTrades] = useState<NormalizedIntent[]>([]);

  // R-09 fix: Subscribe to real-time intent updates via WebSocket
  const channels = useMemo(
    () => [{ channel: "intents", params: poolId ? { poolId } : {} }],
    [poolId]
  );

  const handleWsMessage = useCallback(
    (type: string, data: unknown) => {
      if (type === "intent:update") {
        const d = data as { intentId: string; status: string; settlementTxHash?: string };
        if (d.status === "FILLED") {
          // Prepend the new trade; dedup by intentId
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
        }
      }
    },
    [limit]
  );

  const { connected } = useWebSocket(channels, handleWsMessage);

  // Merge live trades (newest first) with HTTP-fetched trades, dedup
  const allTrades = useMemo(() => {
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

  const trades = allTrades;

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
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : trades.length > 0 ? (
          <div className="space-y-2">
            {trades.map((trade) => (
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
                      href={`https://cardanoscan.io/transaction/${trade.escrowTxHash}`}
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
        )}
      </CardContent>
    </Card>
  );
}
