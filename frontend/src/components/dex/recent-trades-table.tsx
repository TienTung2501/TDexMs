"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MOCK_RECENT_TRADES, type RecentTrade } from "@/lib/mock-data";
import { ArrowRight, ExternalLink } from "lucide-react";
import { truncateAddress } from "@/lib/utils";

interface RecentTradesTableProps {
  poolId?: string;
  limit?: number;
}

export function RecentTradesTable({ poolId, limit = 10 }: RecentTradesTableProps) {
  const trades = poolId
    ? MOCK_RECENT_TRADES.filter((t) => t.poolId === poolId).slice(0, limit)
    : MOCK_RECENT_TRADES.slice(0, limit);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Trades</CardTitle>
      </CardHeader>
      <CardContent>
        {trades.length > 0 ? (
          <div className="space-y-2">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Badge
                    variant={trade.direction === "buy" ? "success" : "destructive"}
                    className="text-[10px] w-10 justify-center"
                  >
                    {trade.direction.toUpperCase()}
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
                      {trade.outputAmount.toLocaleString()}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {trade.outputTicker}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </span>
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={`View TX: ${trade.txHash}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
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
