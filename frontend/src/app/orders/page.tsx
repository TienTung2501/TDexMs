"use client";

import React, { useState, useMemo } from "react";
import {
  ClipboardList,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/providers/wallet-provider";
import { MOCK_INTENTS, type IntentStatus } from "@/lib/mock-data";
import { truncateAddress, cn } from "@/lib/utils";

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
  const { isConnected, connect } = useWallet();
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => {
    if (tab === "all") return MOCK_INTENTS;
    if (tab === "active")
      return MOCK_INTENTS.filter(
        (i) =>
          i.status === "ACTIVE" ||
          i.status === "PENDING" ||
          i.status === "CREATED" ||
          i.status === "FILLING"
      );
    if (tab === "filled")
      return MOCK_INTENTS.filter((i) => i.status === "FILLED");
    return MOCK_INTENTS.filter(
      (i) =>
        i.status === "CANCELLED" ||
        i.status === "EXPIRED" ||
        i.status === "RECLAIMED"
    );
  }, [tab]);

  if (!isConnected) {
    return (
      <div className="shell py-16 text-center space-y-4">
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-bold">Connect Your Wallet</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Connect your wallet to view your trade intents and order history.
        </p>
        <Button variant="trade" size="lg" onClick={connect}>
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="shell py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Badge variant="secondary">
          {MOCK_INTENTS.length} total intents
        </Badge>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Active",
            count: MOCK_INTENTS.filter(
              (i) => i.status === "ACTIVE" || i.status === "PENDING"
            ).length,
            color: "text-primary",
          },
          {
            label: "Filled",
            count: MOCK_INTENTS.filter((i) => i.status === "FILLED").length,
            color: "text-primary",
          },
          {
            label: "Cancelled",
            count: MOCK_INTENTS.filter((i) => i.status === "CANCELLED").length,
            color: "text-muted-foreground",
          },
          {
            label: "Total",
            count: MOCK_INTENTS.length,
            color: "text-foreground",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/50 bg-card/50 p-3 text-center"
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn("text-xl font-bold mt-1", s.color)}>
              {s.count}
            </div>
          </div>
        ))}
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
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No intents found for this filter.
            </div>
          ) : (
            filtered.map((intent) => {
              const cfg = STATUS_CONFIG[intent.status];
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
