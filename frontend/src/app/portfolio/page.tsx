"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  PieChart,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useWallet } from "@/providers/wallet-provider";
import {
  MOCK_PORTFOLIO,
  MOCK_INTENTS,
  MOCK_POOLS,
  TOKENS,
  generatePerformanceData,
} from "@/lib/mock-data";
import { formatCompact, formatAda, formatPercent, cn } from "@/lib/utils";

export default function PortfolioPage() {
  const { isConnected, address, balances, connect } = useWallet();
  const perfData = useMemo(() => generatePerformanceData(30), []);

  if (!isConnected) {
    return (
      <div className="shell py-16 text-center space-y-4">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-bold">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Connect your Cardano wallet to view your portfolio, positions, and
          order history.
        </p>
        <Button variant="trade" size="lg" onClick={connect}>
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </Button>
      </div>
    );
  }

  const activeIntents = MOCK_INTENTS.filter(
    (i) => i.status === "ACTIVE" || i.status === "PENDING"
  );

  return (
    <div className="shell py-8 space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">
              Total Value
            </div>
            <div className="text-2xl font-bold">
              {formatAda(MOCK_PORTFOLIO.totalValueAda * 1_000_000)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">
              Total PnL
            </div>
            <div
              className={cn(
                "text-2xl font-bold",
                MOCK_PORTFOLIO.totalPnl >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {formatPercent(MOCK_PORTFOLIO.totalPnlPercent)}
            </div>
            <div className="text-xs text-muted-foreground">
              {MOCK_PORTFOLIO.totalPnl >= 0 ? "+" : ""}
              {formatCompact(MOCK_PORTFOLIO.totalPnl)} ADA
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">
              LP Positions
            </div>
            <div className="text-2xl font-bold">
              {MOCK_PORTFOLIO.positions.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">
              Open Intents
            </div>
            <div className="text-2xl font-bold">{activeIntents.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Balances */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Token Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(balances)
              .filter(([, v]) => v > 0)
              .map(([ticker, amount]) => {
                const token = TOKENS[ticker];
                if (!token) return null;
                const displayAmount =
                  token.decimals > 0
                    ? amount / Math.pow(10, token.decimals)
                    : amount;
                return (
                  <div
                    key={ticker}
                    className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3"
                  >
                    <span className="text-xl">{token.logo}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{token.ticker}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {token.name}
                      </div>
                    </div>
                    <div className="text-sm font-mono font-semibold">
                      {formatCompact(displayAmount)}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* LP Positions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Liquidity Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MOCK_PORTFOLIO.positions.map((pos) => {
              const pool = MOCK_POOLS.find((p) => p.id === pos.poolId);
              return (
                <Link key={pos.poolId} href={`/pools/${pos.poolId}`}>
                  <div className="flex items-center justify-between rounded-xl bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1.5 text-xl">
                        <span className="mr-1">{TOKENS[pos.assetATicker]?.logo}</span>
                        <span className="ml-1">{TOKENS[pos.assetBTicker]?.logo}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          {pos.assetATicker}/{pos.assetBTicker}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatCompact(pos.lpTokens)} LP tokens &bull; Pool
                          share {pos.sharePercent}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm">
                        ₳ {formatCompact(pos.valueAda)}
                      </div>
                      <div
                        className={cn(
                          "text-xs flex items-center gap-0.5 justify-end",
                          pos.pnl >= 0 ? "text-primary" : "text-destructive"
                        )}
                      >
                        {pos.pnl >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {formatPercent(pos.pnlPercent)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active Intents */}
      {activeIntents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Active Intents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeIntents.map((intent) => (
                <div
                  key={intent.id}
                  className="flex items-center justify-between rounded-xl bg-secondary/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        intent.status === "ACTIVE" ? "success" : "warning"
                      }
                      className="text-[10px]"
                    >
                      {intent.status}
                    </Badge>
                    <span className="text-sm">
                      {intent.inputAmount.toLocaleString()} {intent.inputTicker}{" "}
                      → {intent.outputTicker}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Min: {intent.minOutput.toLocaleString()}{" "}
                    {intent.outputTicker}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
