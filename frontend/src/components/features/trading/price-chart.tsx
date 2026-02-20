"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  ColorType,
  type Time,
} from "lightweight-charts";
import { cn } from "@/lib/utils";

export type ChartTimeframe = "1H" | "4H" | "1D" | "1W";

/** Maps UI labels to API interval values */
export const TIMEFRAME_TO_INTERVAL: Record<ChartTimeframe, string> = {
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
}

export function PriceChart({ data, className, timeframe: controlledTf, onTimeframeChange }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [internalTf, setInternalTf] = useState<ChartTimeframe>("4H");

  const timeframe = controlledTf ?? internalTf;
  const handleTfChange = (tf: ChartTimeframe) => {
    setInternalTf(tf);
    onTimeframeChange?.(tf);
  };

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

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
        timeVisible: true,
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
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "hsl(158 64% 52% / 0.15)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    candleSeries.setData(
      data.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    volumeSeries.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color:
          d.close >= d.open
            ? "hsl(158 64% 52% / 0.2)"
            : "hsl(0 62% 56% / 0.2)",
      }))
    );

    chart.timeScale().fitContent();
    chartRef.current = chart;

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
    };
  }, [data]);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Timeframe selector */}
      <div className="flex gap-1">
        {(["1H", "4H", "1D", "1W"] as ChartTimeframe[]).map((tf) => (
          <button
            key={tf}
            onClick={() => handleTfChange(tf)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
              timeframe === tf
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tf}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="w-full h-[400px] rounded-xl overflow-hidden" />
    </div>
  );
}
