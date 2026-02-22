"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  BarChart3,
  Waves,
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  getAdminDashboardMetrics,
  type AdminDashboardMetrics,
} from "@/lib/api";
import { formatCompact } from "@/lib/utils";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminDashboardMetrics()
      .then(setMetrics)
      .catch((err) => {
        console.error('Failed to load admin dashboard metrics:', err);
        setMetrics(null);
      })
      .finally(() => setLoading(false));
  }, []);

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
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Protocol metrics overview — read-only monitoring.
        </p>
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

      {/* On-chain status */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Current Admin Hash: Loading from on-chain...</p>
        <p>Smart Contract Version: See Protocol Settings</p>
      </div>
    </div>
  );
}
