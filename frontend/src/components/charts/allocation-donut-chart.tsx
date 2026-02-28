"use client";

import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Sector,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TokenIcon } from "@/components/ui/token-icon";
import { TOKENS } from "@/lib/mock-data";
import { formatCompact } from "@/lib/utils";

// ─── Colors for donut slices ─────────────────
const SLICE_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#84cc16", // lime
];

// ─── Types ───────────────────────────────────
interface AllocationItem {
  asset: string;
  percentage: number;
  value_usd: number;
}

interface AllocationDonutChartProps {
  allocation: AllocationItem[];
  loading?: boolean;
}

// ─── Active shape renderer (expand on hover) ─
const renderActiveShape = (props: any) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
  } = props;

  return (
    <g>
      <text
        x={cx}
        y={cy}
        dy={-8}
        textAnchor="middle"
        fill="currentColor"
        className="text-base font-bold fill-foreground"
      >
        {payload.asset}
      </text>
      <text
        x={cx}
        y={cy}
        dy={14}
        textAnchor="middle"
        fill="currentColor"
        className="text-xs fill-muted-foreground"
      >
        {(percent * 100).toFixed(1)}%
      </text>
      {/* Expanded sector */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      {/* Outer ring indicator */}
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 12}
        fill={fill}
      />
    </g>
  );
};

// ─── Main Component ──────────────────────────
export function AllocationDonutChart({
  allocation,
  loading,
}: AllocationDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (loading) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
        Loading allocation...
      </div>
    );
  }

  if (allocation.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        No tokens found
      </div>
    );
  }

  const chartData = allocation.slice(0, 8).map((item, i) => ({
    ...item,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* Donut Chart */}
      <div className="w-full h-[200px] sm:w-1/2 sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              {...({ activeIndex, activeShape: renderActiveShape } as any)}
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={75}
              dataKey="percentage"
              onMouseEnter={(_: any, index: number) => setActiveIndex(index)}
              stroke="none"
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="w-full sm:w-1/2 space-y-1.5">
        {chartData.map((entry, index) => {
          const token = TOKENS[entry.asset];
          return (
            <div
              key={entry.asset}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                index === activeIndex
                  ? "bg-secondary"
                  : "hover:bg-secondary/50"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                {token && <TokenIcon token={token} size="sm" />}
                <div>
                  <p className="text-sm font-medium">{entry.asset}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-medium">
                  {entry.percentage.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  ${formatCompact(entry.value_usd)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
