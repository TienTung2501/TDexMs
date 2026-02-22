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
} from "lucide-react";
import { getSolverStatus, triggerSolver, type SolverStatusResponse } from "@/lib/api";
import { truncateAddress, formatCompact } from "@/lib/utils";

const REFRESH_INTERVAL = 10_000; // 10 seconds auto-refresh

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
      // Backend may not have this endpoint yet — show degraded state
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
      // Refresh status after a short delay
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
                  Solver status endpoint not responding — engine may still be
                  running.
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">UNKNOWN</Badge>
            </div>
          ) : status.running ? (
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="relative">
                <Activity className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold">Solver Engine Running</p>
                {status.lastRun && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last run: {new Date(status.lastRun).toLocaleString()}
                  </p>
                )}
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

      {/* Batch History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      href={`https://preprod.cardanoscan.io/transaction/${status.lastTxHash}`}
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
              Use this when the automatic cron is disabled or you need to
              process pending intents right away.
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
              The solver will process all ACTIVE intents in the queue.
              Auto-refresh every 10 seconds.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
