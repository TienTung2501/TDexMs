"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Cpu,
  Activity,
  CheckCircle,
  XCircle,
  RefreshCw,
  PlayCircle,
  Clock,
  ListTodo,
  Hash,
  TrendingUp,
  Settings,
  Timer,
} from "lucide-react";
import { getSolverStatus, triggerSolver, type SolverStatusResponse } from "@/lib/api";
import { truncateAddress, formatCompact } from "@/lib/utils";

const REFRESH_INTERVAL = 10_000;

function formatUptime(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function AdminSolverDashboardPage() {
  const [status, setStatus] = useState<SolverStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getSolverStatus();
      setStatus(data);
      setLastRefresh(new Date());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await triggerSolver();
      setTriggerMsg(res.message || "Solver triggered successfully");
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      setTriggerMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to trigger solver"}`
      );
    } finally {
      setTriggering(false);
    }
  };

  const successRate =
    status && status.batchesTotal > 0
      ? ((status.batchesSuccess / status.batchesTotal) * 100).toFixed(1)
      : null;

  const statCards = status
    ? [
        {
          label: "Active Intents",
          value: formatCompact(status.activeIntents),
          icon: ListTodo,
          color: "text-blue-600",
          bg: "bg-blue-500/10",
        },
        {
          label: "Pending Orders",
          value: formatCompact(status.pendingOrders),
          icon: Clock,
          color: "text-amber-600",
          bg: "bg-amber-500/10",
        },
        {
          label: "Queue Depth",
          value: formatCompact(status.queueDepth),
          icon: Activity,
          color: "text-purple-600",
          bg: "bg-purple-500/10",
        },
        {
          label: "Success Rate",
          value: successRate != null ? `${successRate}%` : "—",
          icon: TrendingUp,
          color: "text-emerald-600",
          bg: "bg-emerald-500/10",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            Solver Engine Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor the automated solver engine — queue depth, batch stats, and
            manual trigger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchStatus}
            disabled={loading}
            className="h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Engine Status Banner */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {loading ? (
            <Skeleton className="h-8 w-64" />
          ) : status === null ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <XCircle className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Status unavailable</p>
                <p className="text-xs mt-0.5">
                  Solver status endpoint not responding.
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">UNKNOWN</Badge>
            </div>
          ) : !status.enabled ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Solver Disabled</p>
                <p className="text-xs mt-0.5">
                  Set SOLVER_ENABLED=true in environment to activate.
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">DISABLED</Badge>
            </div>
          ) : status.running ? (
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="relative">
                <Activity className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold">Solver Engine Running</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uptime: {formatUptime(status.uptimeMs)}
                  {status.lastRun && ` · Last run: ${new Date(status.lastRun).toLocaleString()}`}
                </p>
              </div>
              <Badge variant="success" className="ml-auto">ACTIVE</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-amber-600">
              <Clock className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Solver Engine Idle</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No active batch in progress.
                </p>
              </div>
              <Badge variant="warning" className="ml-auto">IDLE</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))
          : statCards.map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">
                        {s.label}
                      </p>
                      <p className={`text-2xl font-bold mt-1 ${s.color}`}>
                        {s.value}
                      </p>
                    </div>
                    <div className={`p-3 rounded-xl ${s.bg}`}>
                      <s.icon className={`h-5 w-5 ${s.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Batch History + Manual Trigger + Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Batch Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : status ? (
              <div className="space-y-3">
                {[
                  { label: "Total Batches", value: status.batchesTotal, icon: Activity },
                  {
                    label: "Successful",
                    value: status.batchesSuccess,
                    icon: CheckCircle,
                    color: "text-emerald-600",
                  },
                  {
                    label: "Failed",
                    value: status.batchesFailed,
                    icon: XCircle,
                    color: "text-destructive",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <row.icon className={`h-3.5 w-3.5 ${row.color || ""}`} />
                      {row.label}
                    </div>
                    <span className={`text-sm font-semibold font-mono ${row.color || ""}`}>
                      {row.value.toLocaleString()}
                    </span>
                  </div>
                ))}
                {status.lastTxHash && (
                  <div className="pt-2">
                    <p className="text-[10px] text-muted-foreground mb-1">Last TX Hash</p>
                    <a
                      href={`https://${status.config.network === "Mainnet" ? "" : "preprod."}cardanoscan.io/transaction/${status.lastTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      {truncateAddress(status.lastTxHash)}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>

        {/* Manual Trigger */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              Manual Trigger
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Force the solver engine to run a settlement cycle immediately.
            </p>

            {triggerMsg && (
              <div
                className={`text-xs rounded-lg px-3 py-2 ${
                  triggerMsg.startsWith("Error")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {triggerMsg}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleTrigger}
              disabled={triggering}
              variant={status?.running ? "outline" : "default"}
            >
              {triggering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              {triggering
                ? "Triggering…"
                : status?.running
                ? "Trigger Additional Cycle"
                : "Trigger Solver Now"}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
              Auto-refresh every 10 seconds.
            </p>
          </CardContent>
        </Card>

        {/* Engine Config */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Engine Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : status?.config ? (
              <div className="space-y-3">
                {[
                  { label: "Batch Window", value: `${status.config.batchWindowMs}ms`, icon: Timer },
                  { label: "Max Retries", value: String(status.config.maxRetries), icon: RefreshCw },
                  { label: "Min Profit", value: `${Number(status.config.minProfitLovelace).toLocaleString()} lovelace`, icon: TrendingUp },
                  { label: "Network", value: status.config.network, icon: Activity },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <row.icon className="h-3.5 w-3.5" />
                      {row.label}
                    </div>
                    <span className="text-sm font-mono">{row.value}</span>
                  </div>
                ))}
                {status.config.solverAddress && (
                  <div className="pt-2">
                    <p className="text-[10px] text-muted-foreground mb-1">Solver Address</p>
                    <span className="text-xs font-mono truncate block">
                      {status.config.solverAddress.slice(0, 20)}...{status.config.solverAddress.slice(-8)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Configuration unavailable</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
