"use client";

import React, { useState, useMemo } from "react";
import {
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/providers/wallet-provider";
import { WalletConnectDialog } from "@/components/dex/wallet-connect-dialog";
import { useIntents, useOrders, type NormalizedIntent, type NormalizedOrder } from "@/lib/hooks";
import { cancelOrder } from "@/lib/api";
import { truncateAddress, cn } from "@/lib/utils";

type IntentStatus =
  | "CREATED" | "PENDING" | "ACTIVE" | "FILLING"
  | "FILLED" | "CANCELLED" | "EXPIRED" | "RECLAIMED";

const STATUS_CONFIG: Record<
  IntentStatus,
  { icon: typeof Clock; color: string; variant: "default" | "success" | "destructive" | "warning" | "secondary" | "outline" }
> = {
  CREATED: { icon: Clock, color: "text-blue-400", variant: "secondary" },
  PENDING: { icon: Clock, color: "text-yellow-400", variant: "warning" },
  ACTIVE: { icon: AlertCircle, color: "text-primary", variant: "success" },
  FILLING: { icon: AlertCircle, color: "text-primary", variant: "default" },
  FILLED: { icon: CheckCircle, color: "text-primary", variant: "success" },
  CANCELLED: { icon: XCircle, color: "text-muted-foreground", variant: "secondary" },
  EXPIRED: { icon: XCircle, color: "text-muted-foreground", variant: "secondary" },
  RECLAIMED: { icon: XCircle, color: "text-muted-foreground", variant: "outline" },
};

export default function OrdersPage() {
  const { isConnected, address } = useWallet();
  const [section, setSection] = useState<"intents" | "orders">("intents");
  const [tab, setTab] = useState("all");

  const { intents, total, loading } = useIntents({
    address: isConnected ? address ?? undefined : undefined,
  });

  const { orders, total: ordersTotal, loading: ordersLoading, refetch: refetchOrders } = useOrders({
    creator: isConnected ? address ?? undefined : undefined,
  });

  const filtered = useMemo(() => {
    if (tab === "all") return intents;
    if (tab === "active")
      return intents.filter(
        (i) =>
          i.status === "ACTIVE" ||
          i.status === "PENDING" ||
          i.status === "CREATED" ||
          i.status === "FILLING"
      );
    if (tab === "filled")
      return intents.filter((i) => i.status === "FILLED");
    return intents.filter(
      (i) =>
        i.status === "CANCELLED" ||
        i.status === "EXPIRED" ||
        i.status === "RECLAIMED"
    );
  }, [tab, intents]);

  const filteredOrders = useMemo(() => {
    if (tab === "all") return orders;
    if (tab === "active")
      return orders.filter((o) => o.status === "ACTIVE" || o.status === "PARTIALLY_FILLED");
    if (tab === "filled")
      return orders.filter((o) => o.status === "FILLED");
    return orders.filter(
      (o) => o.status === "CANCELLED" || o.status === "EXPIRED"
    );
  }, [tab, orders]);

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
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-bold">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Connect your wallet to view your trade intents and order history.
        </p>
        <WalletConnectDialog />
      </div>
    );
  }

  return (
    <div className="shell py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {total} intents
          </Badge>
          <Badge variant="secondary">
            {ordersTotal} orders
          </Badge>
        </div>
      </div>

      {/* Section Toggle */}
      <div className="flex rounded-lg border border-border/50 p-1 w-fit">
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            section === "intents"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => { setSection("intents"); setTab("all"); }}
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Swap Intents
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            section === "orders"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => { setSection("orders"); setTab("all"); }}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Advanced Orders
        </button>
      </div>

      {/* Summary */}
      {section === "intents" ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Active",
              count: intents.filter(
                (i) => i.status === "ACTIVE" || i.status === "PENDING"
              ).length,
              color: "text-primary",
            },
            {
              label: "Filled",
              count: intents.filter((i) => i.status === "FILLED").length,
              color: "text-primary",
            },
            {
              label: "Cancelled",
              count: intents.filter((i) => i.status === "CANCELLED").length,
              color: "text-muted-foreground",
            },
            {
              label: "Total",
              count: intents.length,
              color: "text-foreground",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/50 bg-card/50 p-3 text-center"
            >
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={cn("text-xl font-bold mt-1", s.color)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : s.count}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Active",
              count: orders.filter(
                (o) => o.status === "ACTIVE" || o.status === "PARTIALLY_FILLED"
              ).length,
              color: "text-primary",
            },
            {
              label: "Filled",
              count: orders.filter((o) => o.status === "FILLED").length,
              color: "text-primary",
            },
            {
              label: "Cancelled",
              count: orders.filter((o) => o.status === "CANCELLED" || o.status === "EXPIRED").length,
              color: "text-muted-foreground",
            },
            {
              label: "Total",
              count: orders.length,
              color: "text-foreground",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/50 bg-card/50 p-3 text-center"
            >
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={cn("text-xl font-bold mt-1", s.color)}>
                {ordersLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : s.count}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs & List */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="filled">Filled</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {section === "intents" ? (
            /* ─── Intents List ─── */
            loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No intents found for this filter.
              </div>
            ) : (
              filtered.map((intent) => {
                const cfg = STATUS_CONFIG[intent.status as IntentStatus] || STATUS_CONFIG.PENDING;
                const StatusIcon = cfg.icon;

                return (
                  <Card key={intent.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        {/* Left */}
                        <div className="flex items-center gap-3 flex-1">
                          <Badge variant={cfg.variant} className="text-[10px] w-20 justify-center">
                            <StatusIcon className="h-3 w-3 mr-0.5" />
                            {intent.status}
                          </Badge>
                          <div>
                            <div className="text-sm font-semibold">
                              {intent.inputAmount.toLocaleString()}{" "}
                              {intent.inputTicker} → {intent.outputTicker}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Min output:{" "}
                              {intent.minOutput.toLocaleString()}{" "}
                              {intent.outputTicker}
                              {intent.actualOutput && (
                                <span className="text-primary ml-2">
                                  Received:{" "}
                                  {intent.actualOutput.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right */}
                        <div className="text-right text-xs space-y-1">
                          <div className="text-muted-foreground">
                            {new Date(intent.createdAt).toLocaleDateString()}{" "}
                            {new Date(intent.createdAt).toLocaleTimeString()}
                          </div>
                          {intent.escrowTxHash && (
                            <div className="flex items-center gap-1 text-muted-foreground justify-end">
                              <span className="font-mono">
                                TX: {truncateAddress(intent.escrowTxHash)}
                              </span>
                              <ExternalLink className="h-3 w-3" />
                            </div>
                          )}
                          <div className="text-muted-foreground">
                            Deadline:{" "}
                            {new Date(intent.deadline).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )
          ) : (
            /* ─── Advanced Orders List ─── */
            ordersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No advanced orders found for this filter.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isActive = order.status === "ACTIVE" || order.status === "PARTIALLY_FILLED";
                const isFilled = order.status === "FILLED";
                const variant = isFilled ? "success" : isActive ? "default" : "secondary";

                return (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        {/* Left */}
                        <div className="flex items-center gap-3 flex-1">
                          <Badge
                            variant={order.type === "LIMIT" ? "default" : order.type === "DCA" ? "success" : "warning"}
                            className="text-[10px] w-16 justify-center"
                          >
                            {order.type}
                          </Badge>
                          <Badge variant={variant} className="text-[10px] w-24 justify-center">
                            {order.status}
                          </Badge>
                          <div>
                            <div className="text-sm font-semibold">
                              {order.inputTicker} → {order.outputTicker}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {order.type === "DCA" ? (
                                <>
                                  Budget: {order.totalBudget.toLocaleString()} ·
                                  Remaining: {order.remainingBudget.toLocaleString()} ·
                                  Intervals: {order.executedIntervals}
                                </>
                              ) : (
                                <>
                                  Amount: {order.inputAmount.toLocaleString()}
                                  {order.priceNumerator > 0 && order.priceDenominator > 0 && (
                                    <span className="ml-2">
                                      Price: {(order.priceNumerator / order.priceDenominator).toFixed(6)}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right */}
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs space-y-1">
                            <div className="text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}{" "}
                              {new Date(order.createdAt).toLocaleTimeString()}
                            </div>
                            <div className="text-muted-foreground">
                              Deadline: {new Date(order.deadline).toLocaleString()}
                            </div>
                          </div>
                          {isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => handleCancelOrder(order.id)}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
