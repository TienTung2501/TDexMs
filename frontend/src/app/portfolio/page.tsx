"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PieChart,
  ClipboardList,
  ShoppingCart,
  Loader2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/providers/wallet-provider";
import { WalletConnectDialog } from "@/components/dex/wallet-connect-dialog";
import { TokenIcon, TokenPairIcon } from "@/components/ui/token-icon";
import { useIntents, usePools, useOrders, usePortfolio } from "@/lib/hooks";
import { cancelOrder } from "@/lib/api";
import { TOKENS } from "@/lib/mock-data";
import { formatCompact, cn } from "@/lib/utils";

export default function PortfolioPage() {
  const { isConnected, address, balances } = useWallet();
  const { intents, loading: intentsLoading } = useIntents({
    address: isConnected ? address ?? undefined : undefined,
  });
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders({
    creator: isConnected ? address ?? undefined : undefined,
  });
  const { portfolio, loading: portfolioLoading } = usePortfolio(
    isConnected ? address ?? undefined : undefined
  );
  const { pools, loading: poolsLoading } = usePools();

  const activeIntents = useMemo(
    () => intents.filter((i) => i.status === "ACTIVE" || i.status === "PENDING"),
    [intents]
  );
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === "ACTIVE" || o.status === "PARTIALLY_FILLED"),
    [orders]
  );

  const handleCancelOrder = async (orderId: string) => {
    if (!address) return;
    try {
      await cancelOrder(orderId, address);
      refetchOrders();
    } catch (err) {
      console.error("Cancel order failed:", err);
    }
  };

  if (!isConnected) {
    return (
      <div className="shell py-16 text-center space-y-4">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-bold">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Connect your Cardano wallet to view your portfolio, positions, and
          order history.
        </p>
        <WalletConnectDialog />
      </div>
    );
  }

  return (
    <div className="shell py-8 space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Active Intents</div>
            <div className="text-xl font-bold">
              {portfolioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (portfolio?.intents.active ?? activeIntents.length)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Filled Intents</div>
            <div className="text-xl font-bold text-primary">
              {portfolioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (portfolio?.intents.filled ?? intents.filter((i) => i.status === "FILLED").length)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Active Orders</div>
            <div className="text-xl font-bold">
              {portfolioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (portfolio?.orders.active ?? activeOrders.length)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Filled Orders</div>
            <div className="text-xl font-bold text-primary">
              {portfolioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (portfolio?.orders.filled ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Trades</div>
            <div className="text-xl font-bold">
              {portfolioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : ((portfolio?.intents.total ?? intents.length) + (portfolio?.orders.total ?? orders.length))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Active Pools</div>
            <div className="text-xl font-bold">
              {poolsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (portfolio?.pools.totalPools ?? pools.length)}
            </div>
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
                    <TokenIcon token={token} size="lg" />
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

      {/* Pools Overview */}
      {!poolsLoading && pools.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Available Pools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pools.slice(0, 5).map((pool) => (
                <Link key={pool.id} href={`/pools/${pool.id}`}>
                  <div className="flex items-center justify-between rounded-xl bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <TokenPairIcon tokenA={pool.assetA} tokenB={pool.assetB} size="md" />
                      <div>
                        <div className="font-medium text-sm">
                          {pool.assetA.ticker}/{pool.assetB.ticker}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          TVL: ₳ {formatCompact(pool.tvlAda)} &bull; APY {pool.apy.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm text-primary">
                        ₳ {formatCompact(pool.volume24h)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        24h vol
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Orders */}
      {!ordersLoading && activeOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Active Orders ({activeOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-xl bg-secondary/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={order.type === "LIMIT" ? "default" : order.type === "DCA" ? "success" : "warning"}
                      className="text-[10px] w-16 justify-center"
                    >
                      {order.type}
                    </Badge>
                    <div>
                      <span className="text-sm font-medium">
                        {order.inputTicker} → {order.outputTicker}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {order.type === "DCA"
                          ? `Budget: ${order.totalBudget.toLocaleString()} · Remaining: ${order.remainingBudget.toLocaleString()}`
                          : `Amount: ${order.inputAmount.toLocaleString()}`}
                        {order.priceNumerator > 0 && order.priceDenominator > 0 && (
                          <span className="ml-2">
                            @ {(order.priceNumerator / order.priceDenominator).toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.deadline).toLocaleDateString()}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => handleCancelOrder(order.id)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Intents */}
      {!intentsLoading && activeIntents.length > 0 && (
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
