// ...existing code...
"use client"

import { useMemo, useState, useEffect } from "react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { format } from "date-fns"

type Point = {
  time: string | number
  open?: number
  high?: number
  low?: number
  close: number
}

const TIMEFRAMES = ["1W", "1M", "3M", "1Y", "ALL"]

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload as Point
  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl text-xs">
      <div className="text-zinc-400 mb-1">{String(label)}</div>
      <div className="font-semibold">₳ {Number(p.close).toFixed(4)}</div>
      {p.open !== undefined && (
        <div className="text-zinc-500 mt-1">O:{p.open} H:{p.high} L:{p.low}</div>
      )}
    </div>
  )
}

export function TokenDetailChart({
  data,
  symbol,
  title,
}: {
  data?: Point[]
  symbol?: string
  title?: string
}) {
  const [timeframe, setTimeframe] = useState<string>("1Y")

  useEffect(() => {
    // ensure default timeframe when data small
    if (data && data.length < 60) setTimeframe("ALL")
  }, [data])

  // compat: accept any incoming points, fallback to empty
  const fullData = useMemo(() => (data ?? []), [data])

  const chartData = useMemo(() => {
    if (!fullData || fullData.length === 0) return []
    if (timeframe === "ALL") return fullData
    const days =
      timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : timeframe === "3M" ? 90 : 365
    // take last N points (if data is hourly/daily close mapping depends on source)
    return fullData.slice(-Math.min(days, fullData.length))
  }, [fullData, timeframe])

  useEffect(() => {
    // debug: log small trace if no data
    // eslint-disable-next-line no-console
    console.log("TokenDetailChart: points =", chartData?.length ?? 0)
  }, [chartData])

  if (!chartData || chartData.length === 0) {
    return (
      <div className="w-full h-[320px] rounded-xl border border-border/60 bg-card/80 p-4 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">No chart data available</div>
      </div>
    )
  }

  const start = chartData[0].close
  const end = chartData[chartData.length - 1].close
  const change = ((end - start) / (start || 1)) * 100
  const positive = change >= 0

  return (
    <div className="w-full h-[320px] rounded-xl border border-border/60 bg-card/80 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">{title ?? `${symbol ?? "Token"} Price`}</h4>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-bold">₳ {end.toFixed(4)}</div>
            <div className={`text-sm font-semibold ${positive ? "text-green-400" : "text-red-400"}`}>
              {positive ? "+" : ""}
              {change.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="flex gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${timeframe === tf ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="tokenDetailGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={positive ? "#10b981" : "#ef4444"} stopOpacity={0.28} />
              <stop offset="95%" stopColor={positive ? "#10b981" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(t) => {
              try {
                const d = new Date(String(t))
                if (!isNaN(d.getTime())) return format(d, "dd MMM")
              } catch {}
              return String(t)
            }}
            stroke="#52525b"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="#52525b"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₳${Number(v).toFixed(2)}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 4" }} />
          <Area type="monotone" dataKey="close" stroke={positive ? "#10b981" : "#ef4444"} strokeWidth={2} fill="url(#tokenDetailGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
// ...existing code...