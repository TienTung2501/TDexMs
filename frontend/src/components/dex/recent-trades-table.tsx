"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import { useIntents, type NormalizedIntent } from "@/lib/hooks";

interface RecentTradesTableProps {
  poolId?: string;
  limit?: number;
}

export function RecentTradesTable({ poolId, limit = 10 }: RecentTradesTableProps) {
  const { intents, loading } = useIntents({ status: "FILLED" });

  const trades = intents.slice(0, limit);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Trades</CardTitle>
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
