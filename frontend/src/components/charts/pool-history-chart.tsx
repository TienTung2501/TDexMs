"use client";

import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatCompact } from "@/lib/utils";

// ─── Types ───────────────────────────────────
interface HistoryPoint {
  timestamp: string;
  tvlAda: number;
  volume?: number;
  feeRevenue?: number;
  price?: number;
}

interface PoolHistoryChartProps {
  data: HistoryPoint[];
  loading?: boolean;
}

type MetricKey = "tvlAda" | "volume" | "price";

const METRICS: { key: MetricKey; label: string; prefix: string; color: string }[] = [
  { key: "tvlAda", label: "TVL", prefix: "₳ ", color: "#10b981" },
  { key: "volume", label: "Volume", prefix: "₳ ", color: "#3b82f6" },
  { key: "price", label: "Price", prefix: "", color: "#a855f7" },
];

// ─── Custom Tooltip ──────────────────────────
function ChartTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.[0]) return null;
  const value = payload[0].value as number;
  const m = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const dateStr = label
    ? new Date(label).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : "";
  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm">
      <p className="text-zinc-500 text-xs mb-1">{dateStr}</p>
      <p className="font-bold text-lg" style={{ color: m.color }}>
        {m.prefix}{value >= 1000 ? formatCompact(value) : value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────
export function PoolHistoryChart({ data, loading }: PoolHistoryChartProps) {
  const [metric, setMetric] = useState<MetricKey>("tvlAda");

  const currentMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.timestamp,
        value: d[metric] ?? 0,
      })),
    [data, metric]
  );

  // Performance stats
  const startVal = chartData[0]?.value ?? 0;
  const endVal = chartData[chartData.length - 1]?.value ?? 0;
  const change = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0;
  const isPositive = change >= 0;

  if (loading || data.length === 0) {
    return (
      <div className="w-full h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        {loading ? "Loading chart..." : "No history data available."}
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold" style={{ color: currentMetric.color }}>
              {currentMetric.prefix}
              {endVal >= 1000
                ? formatCompact(endVal)
                : endVal.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </span>
            {change !== 0 && (
              <span
                className={`flex items-center text-xs font-medium ${
                  isPositive ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Metric Selector */}
        <div className="flex bg-zinc-950 dark:bg-zinc-950 bg-zinc-100 p-0.5 rounded-lg border border-zinc-800 dark:border-zinc-800 border-zinc-300">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                metric === m.key
                  ? "bg-zinc-800 dark:bg-zinc-800 bg-white text-white dark:text-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={currentMetric.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={currentMetric.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(str) => {
                const d = new Date(str);
                return `${d.getDate()} ${d.toLocaleString(undefined, { month: "short" })}`;
              }}
              stroke="#52525b"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              stroke="#52525b"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) =>
                metric === "price" ? val.toPrecision(3) : `₳${formatCompact(val)}`
              }
              width={60}
            />
            <Tooltip
              content={<ChartTooltip metric={metric} />}
              cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={currentMetric.color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#gradient-${metric})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
