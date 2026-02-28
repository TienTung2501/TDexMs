"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  AreaSeries,
  type IChartApi,
  ColorType,
  type Time,
} from "lightweight-charts";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, BarChart2 } from "lucide-react";

export type ChartTimeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
export type ChartMode = "candle" | "line";

/** Maps UI labels to API interval values */
export const TIMEFRAME_TO_INTERVAL: Record<ChartTimeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

interface PriceChartProps {
  data: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  className?: string;
  timeframe?: ChartTimeframe;
  onTimeframeChange?: (tf: ChartTimeframe) => void;
  chartMode?: ChartMode;
  onChartModeChange?: (mode: ChartMode) => void;
}

export function PriceChart({
  data,
  className,
  timeframe: controlledTf,
  onTimeframeChange,
  chartMode: controlledMode,
  onChartModeChange,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const areaSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const [internalTf, setInternalTf] = useState<ChartTimeframe>("4H");
  const [internalMode, setInternalMode] = useState<ChartMode>("candle");

  const timeframe = controlledTf ?? internalTf;
  const chartMode = controlledMode ?? internalMode;
  const handleTfChange = (tf: ChartTimeframe) => {
    setInternalTf(tf);
    onTimeframeChange?.(tf);
  };
  const handleModeChange = (mode: ChartMode) => {
    setInternalMode(mode);
    onChartModeChange?.(mode);
  };

  // Determine time-visible based on timeframe (hide time for daily/weekly)
  const showTime = !["1D", "1W"].includes(timeframe);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "hsl(0 0% 55%)",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "hsl(0 0% 15%)" },
        horzLines: { color: "hsl(0 0% 15%)" },
      },
      crosshair: {
        vertLine: { width: 1, color: "hsl(158 64% 52% / 0.3)", style: 2 },
        horzLine: { width: 1, color: "hsl(158 64% 52% / 0.3)", style: 2 },
      },
      rightPriceScale: {
        borderColor: "hsl(0 0% 18%)",
      },
      timeScale: {
        borderColor: "hsl(0 0% 18%)",
        timeVisible: showTime,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "hsl(158 64% 52%)",
      downColor: "hsl(0 62% 56%)",
      borderDownColor: "hsl(0 62% 56%)",
      borderUpColor: "hsl(158 64% 52%)",
      wickDownColor: "hsl(0 62% 40%)",
      wickUpColor: "hsl(158 64% 40%)",
      visible: chartMode === "candle",
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#10b981",
      topColor: "rgba(16, 185, 129, 0.4)",
      bottomColor: "rgba(16, 185, 129, 0.0)",
      lineWidth: 2,
      crosshairMarkerRadius: 4,
      visible: chartMode === "line",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "hsl(158 64% 52% / 0.15)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    areaSeriesRef.current = areaSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []); // Only run once — chart is created and never destroyed

  // Toggle series visibility when chart mode changes
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: chartMode === "candle" });
    areaSeriesRef.current?.applyOptions({ visible: chartMode === "line" });
  }, [chartMode]);

  // Update timeScale visibility when timeframe changes
  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: showTime, secondsVisible: false },
    });
  }, [showTime]);

  // Update data in-place — no chart destruction/recreation
  useEffect(() => {
    if (!candleSeriesRef.current || !areaSeriesRef.current || !volumeSeriesRef.current) return;

    // Filter out invalid timestamps (NaN, 0, negative) and non-finite prices
    const validData = data
      .filter((d) => d.time > 0 && !isNaN(d.time) && isFinite(d.open) && isFinite(d.close))
      // lightweight-charts v5 requires strictly ascending time — sort then deduplicate
      .sort((a, b) => a.time - b.time)
      .filter((d, i, arr) => i === 0 || d.time !== arr[i - 1].time);

    if (validData.length === 0) {
      // Clear all series when no valid data
      candleSeriesRef.current.setData([]);
      areaSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }

    candleSeriesRef.current.setData(
      validData.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    areaSeriesRef.current.setData(
      validData.map((d) => ({
        time: d.time as Time,
        value: d.close,
      }))
    );

    volumeSeriesRef.current.setData(
      validData.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color:
          d.close >= d.open
            ? "hsl(158 64% 52% / 0.2)"
            : "hsl(0 62% 56% / 0.2)",
      }))
    );

    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const allTf: ChartTimeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

  const hasValidData = data.some((d) => d.time > 0 && !isNaN(d.time) && isFinite(d.open));

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar: timeframe selector + chart mode toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {allTf.map((tf) => (
            <button
              key={tf}
              onClick={() => handleTfChange(tf)}
              className={cn(
                "px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                timeframe === tf
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Chart mode toggle */}
        <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
          <button
            onClick={() => handleModeChange("candle")}
            className={cn(
              "p-1.5 rounded-md transition-colors cursor-pointer",
              chartMode === "candle"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Candlestick"
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleModeChange("line")}
            className={cn(
              "p-1.5 rounded-md transition-colors cursor-pointer",
              chartMode === "line"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Line"
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full h-[400px] rounded-xl overflow-hidden" />
        {/* No data overlay */}
        {!hasValidData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
            <BarChart2 className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No Trading Activity</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              This pair has no trade history for the selected timeframe
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
