"use client";

import React, { useState, useMemo } from "react";
import {
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CursorPaginator } from "@/components/ui/paginator";
import { useWallet } from "@/providers/wallet-provider";
import { WalletConnectDialog } from "@/components/features/wallet/wallet-connect-dialog";
import { usePaginatedIntents, usePaginatedOrders, type NormalizedIntent, type NormalizedOrder } from "@/lib/hooks";
import { cancelOrder } from "@/lib/api";
import { truncateAddress, cn } from "@/lib/utils";
import { useTransaction } from "@/lib/hooks/use-transaction";

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
  const { execute: executeTx, busy: txBusy, TxToastContainer } = useTransaction();

  // Tab → backend status mapping (undefined = no filter = fetch all)
  const intentStatus = tab === "filled" ? "FILLED" : tab === "closed" ? "CANCELLED" : undefined;
  const orderStatus  = tab === "filled" ? "FILLED" : tab === "closed" ? "CANCELLED" : undefined;

  const {
    intents, total, loading, hasMore: intentsHasMore, hasPrev: intentsHasPrev,
    goNext: intentsNext, goPrev: intentsPrev, rangeStart: iFrom, rangeEnd: iTo,
  } = usePaginatedIntents({
    address: isConnected ? address ?? undefined : undefined,
    status: intentStatus,
    pageSize: 20,
    enabled: isConnected && !!address,
  });

  const {
    orders, total: ordersTotal, loading: ordersLoading, hasMore: ordersHasMore, hasPrev: ordersHasPrev,
    goNext: ordersNext, goPrev: ordersPrev, rangeStart: oFrom, rangeEnd: oTo,
    refetch: refetchOrders,
  } = usePaginatedOrders({
    creator: isConnected ? address ?? undefined : undefined,
    status: orderStatus,
    pageSize: 20,
    enabled: isConnected && !!address,
  });

  // Client-side filter for "active" tab (combines multiple statuses that backend can't merge)
  const filtered = useMemo(() => {
    if (tab === "active")
      return intents.filter(i => ["ACTIVE","PENDING","CREATED","FILLING"].includes(i.status));
    return intents;
  }, [tab, intents]);

  const filteredOrders = useMemo(() => {
    if (tab === "active") return orders.filter(o => ["ACTIVE","PARTIALLY_FILLED"].includes(o.status));
    return orders;
  }, [tab, orders]);

  const handleCancelOrder = async (orderId: string) => {
    if (!address || txBusy) return;
    await executeTx(
      () => cancelOrder(orderId, address),
      {
        buildingMsg: "Building cancel order transaction...",
        successMsg: "Order cancelled!",
        action: "cancel_order",
        extractId: (res) => ({ orderId: res.orderId }),
        onSuccess: () => refetchOrders(),
        onError: () => refetchOrders(),
      },
    );
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
      <TxToastContainer />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-2">
          {section === "intents" ? (
            loading ? <Skeleton className="h-5 w-20 rounded-full" /> :
            <Badge variant="secondary">{total.toLocaleString()} intents</Badge>
          ) : (
            ordersLoading ? <Skeleton className="h-5 w-20 rounded-full" /> :
            <Badge variant="secondary">{ordersTotal.toLocaleString()} orders</Badge>
          )}
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

      {/* Summary — simple stat strip replacing the old 4-card grid */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {section === "intents" ? (
          loading && intents.length === 0 ? (
            <div className="flex gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-24" /></div>
          ) : (
            <>
              <span><span className="font-semibold text-primary">{intents.filter(i=>["ACTIVE","PENDING","FILLING"].includes(i.status)).length}</span> active on this page</span>
              <span><span className="font-semibold text-foreground">{total.toLocaleString()}</span> total</span>
            </>
          )
        ) : (
          ordersLoading && orders.length === 0 ? (
            <div className="flex gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-24" /></div>
          ) : (
            <>
              <span><span className="font-semibold text-primary">{orders.filter(o=>["ACTIVE","PARTIALLY_FILLED"].includes(o.status)).length}</span> active on this page</span>
              <span><span className="font-semibold text-foreground">{ordersTotal.toLocaleString()}</span> total</span>
            </>
          )
        )}
      </div>

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
            loading && intents.length === 0 ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex gap-3 flex-1">
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <div className="space-y-2 flex-1"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>
                      </div>
                      <div className="space-y-2 text-right"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-20" /></div>
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No intents found for this filter.
              </div>
            ) : (
              <>
              {filtered.map((intent) => {
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
              })}
              <CursorPaginator
                total={total} rangeStart={iFrom} rangeEnd={iTo}
                hasMore={intentsHasMore} hasPrev={intentsHasPrev}
                onNext={intentsNext} onPrev={intentsPrev}
                loading={loading} className="mt-2 pt-2 border-t border-border/30"
              />
              </>
            )
          ) : (
            /* ─── Advanced Orders List ─── */
            ordersLoading && orders.length === 0 ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex gap-3 flex-1">
                        <Skeleton className="h-6 w-14 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <div className="space-y-2 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-32" /></div>
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No advanced orders found for this filter.
              </div>
            ) : (
              <>
              {filteredOrders.map((order) => {
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
                                  Remaining: {order.remainingBudget.toLocaleString()}
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
                            {/* DCA Progress Bar */}
                            {order.type === "DCA" && order.intervalSlots != null && order.intervalSlots > 0 && (
                              <div className="mt-2 space-y-1 max-w-[220px]">
                                <Progress
                                  value={Math.min(
                                    100,
                                    (order.executedIntervals / order.intervalSlots) * 100
                                  )}
                                  className="h-1.5"
                                />
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span className="text-purple-500 font-medium">
                                    DCA Progress
                                  </span>
                                  <span className="font-mono">
                                    {order.executedIntervals} / {order.intervalSlots} intervals
                                  </span>
                                </div>
                              </div>
                            )}
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
                              disabled={txBusy}
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
              })}
              <CursorPaginator
                total={ordersTotal} rangeStart={oFrom} rangeEnd={oTo}
                hasMore={ordersHasMore} hasPrev={ordersHasPrev}
                onNext={ordersNext} onPrev={ordersPrev}
                loading={ordersLoading} className="mt-2 pt-2 border-t border-border/30"
              />
              </>
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
