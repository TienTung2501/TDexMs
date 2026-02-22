"use client";

import React, { useState, useMemo } from "react";
import { ArrowRight, ExternalLink, Loader2, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { truncateAddress } from "@/lib/utils";
import { useIntents, useOrders, type NormalizedIntent, type NormalizedOrder } from "@/lib/hooks";
import { useWallet } from "@/providers/wallet-provider";
import { cancelOrder, cancelIntent } from "@/lib/api";

type TabId = "open" | "history" | "trades";

interface TradingFooterProps {
  poolId?: string;
}

export function TradingFooter({ poolId }: TradingFooterProps) {
  const [tab, setTab] = useState<TabId>("open");
  const { isConnected, address } = useWallet();

  const { intents: userIntents, loading: intentsLoading, refetch: refetchIntents } = useIntents({
    address: isConnected ? address ?? undefined : undefined,
  });
  const { orders: userOrders, loading: ordersLoading, refetch: refetchOrders } = useOrders({
    creator: isConnected ? address ?? undefined : undefined,
  });
  const { intents: recentTrades, loading: tradesLoading } = useIntents({});

  const openIntents = useMemo(
    () => userIntents.filter((i) => i.status === "ACTIVE" || i.status === "PENDING"),
    [userIntents]
  );
  const openOrders = useMemo(
    () => userOrders.filter((o) => o.status === "ACTIVE" || o.status === "PARTIALLY_FILLED"),
    [userOrders]
  );

  const historyIntents = useMemo(
    () => userIntents.filter((i) => i.status === "FILLED" || i.status === "CANCELLED" || i.status === "EXPIRED"),
    [userIntents]
  );
  const historyOrders = useMemo(
    () => userOrders.filter((o) => o.status === "FILLED" || o.status === "CANCELLED" || o.status === "EXPIRED"),
    [userOrders]
  );

  const handleCancelIntent = async (intentId: string) => {
    if (!address) return;
    try {
      await cancelIntent(intentId, address);
      refetchIntents();
    } catch (err) {
      console.error("Cancel intent failed:", err);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!address) return;
    try {
      await cancelOrder(orderId, address);
      refetchOrders();
    } catch (err) {
      console.error("Cancel order failed:", err);
    }
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "open", label: "My Open Orders", count: openIntents.length + openOrders.length },
    { id: "history", label: "Order History", count: historyIntents.length + historyOrders.length },
    { id: "trades", label: "Market Trades" },
  ];

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border/30">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[280px] overflow-y-auto">
        {tab === "open" && (
          <OpenOrdersTab
            intents={openIntents}
            orders={openOrders}
            loading={intentsLoading || ordersLoading}
            isConnected={isConnected}
            onCancelIntent={handleCancelIntent}
            onCancelOrder={handleCancelOrder}
          />
        )}
        {tab === "history" && (
          <OrderHistoryTab
            intents={historyIntents}
            orders={historyOrders}
            loading={intentsLoading || ordersLoading}
            isConnected={isConnected}
          />
        )}
        {tab === "trades" && (
          <MarketTradesTab
            trades={recentTrades.slice(0, 20)}
            loading={tradesLoading}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-tabs ────────────────────────────────

function OpenOrdersTab({
  intents,
  orders,
  loading,
  isConnected,
  onCancelIntent,
  onCancelOrder,
}: {
  intents: NormalizedIntent[];
  orders: NormalizedOrder[];
  loading: boolean;
  isConnected: boolean;
  onCancelIntent: (id: string) => void;
  onCancelOrder: (id: string) => void;
}) {
  if (!isConnected) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        Connect wallet to see your open orders
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allItems = [
    ...intents.map((i) => ({ ...i, itemType: "intent" as const })),
    ...orders.map((o) => ({ ...o, itemType: "order" as const })),
  ];

  if (allItems.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        No open orders
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-border/30 text-muted-foreground">
          <th className="text-left px-3 py-2 font-medium">Type</th>
          <th className="text-left px-3 py-2 font-medium">Pair</th>
          <th className="text-right px-3 py-2 font-medium">Amount</th>
          <th className="text-right px-3 py-2 font-medium">Status</th>
          <th className="text-right px-3 py-2 font-medium">Deadline</th>
          <th className="text-right px-3 py-2 font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {allItems.map((item) => {
          const isOrder = item.itemType === "order";
          const typeBadge = isOrder ? (item as NormalizedOrder).type : "SWAP";
          return (
            <tr
              key={item.id}
              className="border-b border-border/20 hover:bg-muted/30 transition-colors"
            >
              <td className="px-3 py-2">
                <Badge variant="secondary" className="text-[9px]">{typeBadge}</Badge>
              </td>
              <td className="px-3 py-2 font-medium">
                {item.inputTicker} → {item.outputTicker}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {item.inputAmount.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right">
                <Badge variant="success" className="text-[9px]">
                  {item.status}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {isOrder
                  ? new Date((item as NormalizedOrder).deadline).toLocaleDateString()
                  : new Date((item as NormalizedIntent).deadline).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-destructive hover:text-destructive text-[10px]"
                  onClick={() =>
                    isOrder
                      ? onCancelOrder(item.id)
                      : onCancelIntent(item.id)
                  }
                >
                  <XCircle className="h-3 w-3 mr-0.5" />
                  Cancel
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OrderHistoryTab({
  intents,
  orders,
  loading,
  isConnected,
}: {
  intents: NormalizedIntent[];
  orders: NormalizedOrder[];
  loading: boolean;
  isConnected: boolean;
}) {
  if (!isConnected) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        Connect wallet to see order history
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allItems = [
    ...intents.map((i) => ({ ...i, itemType: "intent" as const })),
    ...orders.map((o) => ({ ...o, itemType: "order" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (allItems.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        No order history
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-border/30 text-muted-foreground">
          <th className="text-left px-3 py-2 font-medium">Type</th>
          <th className="text-left px-3 py-2 font-medium">Pair</th>
          <th className="text-right px-3 py-2 font-medium">Amount</th>
          <th className="text-right px-3 py-2 font-medium">Status</th>
          <th className="text-right px-3 py-2 font-medium">Date</th>
          <th className="text-right px-3 py-2 font-medium">TX</th>
        </tr>
      </thead>
      <tbody>
        {allItems.map((item) => {
          const isOrder = item.itemType === "order";
          const typeBadge = isOrder ? (item as NormalizedOrder).type : "SWAP";
          const statusVariant =
            item.status === "FILLED" ? "success" : item.status === "CANCELLED" ? "destructive" : "secondary";
          const txHash = !isOrder ? (item as NormalizedIntent).escrowTxHash : undefined;

          return (
            <tr
              key={item.id}
              className="border-b border-border/20 hover:bg-muted/30 transition-colors"
            >
              <td className="px-3 py-2">
                <Badge variant="secondary" className="text-[9px]">{typeBadge}</Badge>
              </td>
              <td className="px-3 py-2 font-medium">
                {item.inputTicker} → {item.outputTicker}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {item.inputAmount.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right">
                <Badge variant={statusVariant} className="text-[9px]">
                  {item.status}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-right">
                {txHash && (
                  <a
                    href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
                  >
                    <span className="font-mono">{truncateAddress(txHash, 4, 4)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MarketTradesTab({
  trades,
  loading,
}: {
  trades: NormalizedIntent[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        No recent trades
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-border/30 text-muted-foreground">
          <th className="text-left px-3 py-2 font-medium">Time</th>
          <th className="text-left px-3 py-2 font-medium">Pair</th>
          <th className="text-right px-3 py-2 font-medium">Amount</th>
          <th className="text-right px-3 py-2 font-medium">Received</th>
          <th className="text-right px-3 py-2 font-medium">TX</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr
            key={trade.id}
            className="border-b border-border/20 hover:bg-muted/30 transition-colors"
          >
            <td className="px-3 py-2 text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(trade.createdAt).toLocaleTimeString()}
            </td>
            <td className="px-3 py-2 font-medium">
              {trade.inputTicker}
              <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
              {trade.outputTicker}
            </td>
            <td className="px-3 py-2 text-right font-mono text-destructive">
              {trade.inputAmount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right font-mono text-primary">
              {(trade.actualOutput ?? trade.minOutput).toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right">
              {trade.escrowTxHash && (
                <a
                  href={`https://preprod.cardanoscan.io/transaction/${trade.escrowTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
