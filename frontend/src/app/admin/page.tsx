"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  BarChart3,
  Waves,
  Clock,
  TrendingUp,
  Activity,
  Globe,
  Cpu,
  RefreshCw,
} from "lucide-react";
import {
  getAdminDashboardMetrics,
  getProtocolInfo,
  getSolverStatus,
  type AdminDashboardMetrics,
  type ProtocolInfo,
  type SolverStatusResponse,
} from "@/lib/api";
import { formatCompact } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [protocol, setProtocol] = useState<ProtocolInfo | null>(null);
  const [solver, setSolver] = useState<SolverStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [m, p, s] = await Promise.all([
        getAdminDashboardMetrics().catch(() => null),
        getProtocolInfo().catch(() => null),
        getSolverStatus().catch(() => null),
      ]);
      setMetrics(m);
      setProtocol(p);
      setSolver(s);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 30_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const metricCards = [
    {
      label: "Total TVL",
      value: metrics ? `$${formatCompact(metrics.total_tvl_usd)}` : "—",
      icon: DollarSign,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "24h Volume",
      value: metrics ? `$${formatCompact(metrics.volume_24h_usd)}` : "—",
      icon: BarChart3,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Active Pools",
      value: metrics ? String(metrics.active_pools) : "—",
      icon: Waves,
      color: "text-purple-600",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Pending Fees",
      value: metrics
        ? `$${formatCompact(metrics.total_pending_fees_usd)}`
        : "—",
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Protocol overview — real-time metrics and system health.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {card.label}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-24 mt-1" />
                  ) : (
                    <p className={`text-2xl font-bold mt-1 ${card.color}`}>
                      {card.value}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-xl ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* System Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Network */}
        <Card>
          <CardContent className="pt-4 pb-4">
            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10">
                  <Globe className="h-4 w-4 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Network</p>
                  <p className="text-sm font-bold capitalize">
                    {protocol?.network ?? "—"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {protocol?.network ?? "—"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Solver Status */}
        <Card>
          <CardContent className="pt-4 pb-4">
            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  solver?.running ? "bg-emerald-500/10" : "bg-amber-500/10"
                }`}>
                  <Cpu className={`h-4 w-4 ${
                    solver?.running ? "text-emerald-600" : "text-amber-600"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Solver</p>
                  <p className="text-sm font-bold">
                    {solver?.running ? "Running" : solver?.enabled ? "Idle" : "Disabled"}
                  </p>
                </div>
                <Badge
                  variant={solver?.running ? "success" : "secondary"}
                  className="text-[10px]"
                >
                  {solver?.running ? "ACTIVE" : solver?.enabled ? "IDLE" : "OFF"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardContent className="pt-4 pb-4">
            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-500/10">
                  <Activity className="h-4 w-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Database</p>
                  <p className="text-sm font-bold">
                    {protocol
                      ? `${protocol.database.pool_count}P / ${protocol.database.intent_count}I / ${protocol.database.order_count}O`
                      : "—"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {protocol ? "CONNECTED" : "—"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fee Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Protocol Fee Growth (30d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : metrics?.charts.fee_growth_30d ? (
            <div className="h-48 flex items-end gap-1">
              {metrics.charts.fee_growth_30d.map((point, i) => {
                const max = Math.max(
                  ...metrics.charts.fee_growth_30d.map((p) => p.accumulated_usd)
                );
                const height = max > 0 ? (point.accumulated_usd / max) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 group relative"
                    title={`${point.date}: $${point.accumulated_usd.toFixed(0)}`}
                  >
                    <div
                      className="w-full bg-primary/20 hover:bg-primary/40 rounded-t transition-colors"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No data available.</p>
          )}
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Info Footer */}
      {protocol && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
          <Card>
            <CardContent className="pt-4 pb-4 space-y-1.5">
              <p className="text-[11px] font-semibold text-foreground mb-2">Contract Addresses</p>
              <div className="flex justify-between">
                <span>Escrow Script</span>
                <span className="font-mono truncate ml-4 max-w-[240px]">
                  {protocol.contracts.escrow_script_address || "Not set"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pool Script</span>
                <span className="font-mono truncate ml-4 max-w-[240px]">
                  {protocol.contracts.pool_script_address || "Not set"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Settings NFT</span>
                <span className="font-mono truncate ml-4 max-w-[240px]">
                  {protocol.contracts.settings_nft_policy_id
                    ? `${protocol.contracts.settings_nft_policy_id.slice(0, 16)}...`
                    : "Not set"}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-1.5">
              <p className="text-[11px] font-semibold text-foreground mb-2">Service Config</p>
              <div className="flex justify-between">
                <span>Chain Sync</span>
                <span>every {(protocol.services.chain_sync_interval_ms / 1000).toFixed(0)}s</span>
              </div>
              <div className="flex justify-between">
                <span>Blockfrost</span>
                <span className="font-mono">{protocol.blockfrost.project_id_masked || "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span>Orders</span>
                <Badge variant={protocol.services.order_routes_enabled ? "success" : "secondary"} className="text-[9px] h-4">
                  {protocol.services.order_routes_enabled ? "ENABLED" : "DISABLED"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
