"use client"

import { useEffect, useRef } from "react"
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  CandlestickSeries, 
  HistogramSeries 
} from "lightweight-charts"
import { generateCandleData } from "@/lib/chart-utils"

export function ChartArea({ timeframe }: { timeframe: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const candleSeriesRef = useRef<any>(null)
  const volumeSeriesRef = useRef<any>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    // --- CẤU HÌNH DARK MODE CHO CHART ---
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#101418' }, // Nền tối chuẩn
        textColor: '#94a3b8', // Text màu xám sáng (slate-400)
      },
      grid: {
        vertLines: { color: '#1e293b' }, // Lưới tối (slate-800)
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#334155', timeVisible: true }, // Border slate-700
      rightPriceScale: { borderColor: '#334155' },
    })
    
    chartRef.current = chart

    // Series Nến
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',   // Emerald-500
      downColor: '#ef4444', // Red-500
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })
    candleSeriesRef.current = candleSeries

    // Series Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', 
    })
    volumeSeriesRef.current = volumeSeries
    
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // Update Data khi Timeframe đổi
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const data = generateCandleData(200, timeframe)
    
    candleSeriesRef.current.setData(data.map(d => ({
        time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
    })))

    volumeSeriesRef.current.setData(data.map(d => ({
        time: d.time, value: d.volume, color: d.color === '#22c55e' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
    })))
    
    chartRef.current?.timeScale().fitContent();
  }, [timeframe])

  return (
    <div className="relative h-full w-full bg-[#101418]">
      {/* Overlay Info Dark Mode */}
      <div className="absolute left-4 top-4 z-20 pointer-events-none bg-[#0b0e11]/90 backdrop-blur-sm p-2 rounded-lg border border-white/10 shadow-lg">
        <div className="text-sm font-bold text-slate-200">
          COIN/ADA <span className="text-xs font-normal text-slate-500">• {timeframe} • Live</span>
        </div>
        <div className="flex items-center gap-3 text-xs mt-1">
             <span className="text-emerald-400 font-bold">0.0045 (+5.2%)</span>
             <span className="text-slate-500">Vol: <span className="text-slate-300">2.4M</span></span>
        </div>
      </div>
      <div ref={chartContainerRef} className="h-full w-full" />
    </div>
  )
}