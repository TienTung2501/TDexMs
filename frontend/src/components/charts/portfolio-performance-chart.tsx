"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { formatCompact } from "@/lib/utils";

// ─── Types ───────────────────────────────────
interface PortfolioDataPoint {
  date: string;
  value: number;
}

interface PortfolioPerformanceChartProps {
  /** Time-series data — if empty, generates demo data from currentValue */
  data?: PortfolioDataPoint[];
  /** Current portfolio value (used for fallback display) */
  currentValue?: number;
  /** Label (e.g. "Portfolio Value", "Net Worth") */
  label?: string;
  /** Value prefix */
  prefix?: string;
}

// ─── Custom Tooltip ──────────────────────────
function ChartTooltip({ active, payload, label, prefix }: any) {
  if (!active || !payload?.[0]) return null;
  const value = payload[0].value as number;
  const dateStr = label
    ? new Date(label).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";
  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm">
      <p className="text-zinc-500 text-xs mb-1">{dateStr}</p>
      <p className="text-emerald-400 font-bold text-lg">
        {prefix ?? "₳ "}
        {value >= 1000 ? formatCompact(value) : value.toFixed(2)}
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────
export function PortfolioPerformanceChart({
  data,
  currentValue = 0,
  label = "Portfolio Value",
  prefix = "₳ ",
}: PortfolioPerformanceChartProps) {
  // Generate demo data if none provided (simulates last 30 days)
  const chartData = useMemo(() => {
    if (data && data.length > 1) return data;
    // Build synthetic 30-day curve from currentValue
    const points: PortfolioDataPoint[] = [];
    const base = currentValue * 0.85; // start at 85% of current
    for (let i = 30; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      // Smooth growth with minor noise
      const progress = (30 - i) / 30;
      const noise = 1 + (Math.sin(i * 0.7) * 0.03);
      const value = base + (currentValue - base) * progress * noise;
      points.push({
        date: d.toISOString(),
        value: Math.max(0, value),
      });
    }
    return points;
  }, [data, currentValue]);

  const startVal = chartData[0]?.value ?? 0;
  const endVal = chartData[chartData.length - 1]?.value ?? currentValue;
  const change = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0;
  const isPositive = change >= 0;

  if (currentValue <= 0 && (!data || data.length === 0)) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
        <TrendingUp className="h-8 w-8 opacity-30" />
        <p>No portfolio data available yet</p>
        <p className="text-xs text-muted-foreground/60">
          Performance chart will appear once you have balances or trading activity
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {prefix}
              {endVal >= 1000 ? formatCompact(endVal) : endVal.toFixed(2)}
            </span>
            {change !== 0 && (
              <span
                className={`flex items-center text-sm font-medium ${
                  isPositive ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">30 days</span>
      </div>

      {/* Chart */}
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradientPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isPositive ? "#10b981" : "#ef4444"}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isPositive ? "#10b981" : "#ef4444"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#27272a"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(str) => {
                const d = new Date(str);
                return `${d.getDate()}/${d.getMonth() + 1}`;
              }}
              stroke="#52525b"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              stroke="#52525b"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `${formatCompact(val)}`}
              width={50}
            />
            <Tooltip
              content={<ChartTooltip prefix={prefix} />}
              cursor={{
                stroke: "#52525b",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "#10b981" : "#ef4444"}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradientPortfolio)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
