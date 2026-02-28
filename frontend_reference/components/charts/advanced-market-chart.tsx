"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  CandlestickSeries, 
  AreaSeries,
  HistogramSeries,
  ISeriesApi,
  Time
} from "lightweight-charts"
import { 
  CandlestickChart, 
  LineChart, 
  ChevronDown, 
  RefreshCw, 
  Settings,
  Lock,
  Layers
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"
import { generateOHLCData, TimeFrame } from "@/lib/ohlc-mock"

interface AssetOption {
  symbol: string
  name: string
  type: 'Price' | 'NAV' | 'Token' 
  basePrice: number
}

interface AdvancedMarketChartProps {
  basketSymbol?: string
  composition?: { asset?: string; weight?: number }[]
}

const DEFAULT_SYMBOL = 'BFI'

const formatSymbol = (symbol?: string) => {
  if (!symbol) return DEFAULT_SYMBOL
  const trimmed = symbol.trim()
  return trimmed.length ? trimmed.toUpperCase() : DEFAULT_SYMBOL
}

const TIMEFRAMES: TimeFrame[] = ['1H', '4H', '1D', '1W']

export function AdvancedMarketChart({ basketSymbol, composition }: AdvancedMarketChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)

  const [timeframe, setTimeframe] = useState<TimeFrame>('1D')

  
  // 1. Chart Type mặc định là 'area'
  const [chartType, setChartType] = useState<'area' | 'candle'>('area')
  
  // 2. Asset mặc định là 'Index NAV' (thay vì Index Price)
  const safeSymbol = useMemo(() => formatSymbol(basketSymbol), [basketSymbol])
  const defaultAsset = useMemo<AssetOption>(() => ({
    symbol: safeSymbol,
    name: 'Index NAV (Intrinsic)',
    type: 'NAV',
    basePrice: 1.05,
  }), [safeSymbol])

  const [selectedAsset, setSelectedAsset] = useState<AssetOption>(defaultAsset)

  useEffect(() => {
    setSelectedAsset((prev) => {
      if (prev.symbol === defaultAsset.symbol) {
        return prev
      }
      return defaultAsset
    })
  }, [defaultAsset])

  const [isLoading, setIsLoading] = useState(false)
  const [currentPrice, setCurrentPrice] = useState<number>(0)
  const [priceChange, setPriceChange] = useState<number>(0)

  useEffect(() => {
    if (selectedAsset.type === 'NAV' && chartType !== 'area') {
      setChartType('area')
    }
  }, [selectedAsset.type, chartType])

  // List Assets
    const indexAssets: AssetOption[] = useMemo(() => [
      { symbol: safeSymbol, name: 'Index Price (Market)', type: 'Price', basePrice: 1.05 },
      { symbol: safeSymbol, name: 'Index NAV (Intrinsic)', type: 'NAV', basePrice: 1.05 },
    ], [safeSymbol])

    const tokenAssets: AssetOption[] = useMemo(() => {
      if (!Array.isArray(composition)) return []
      return composition
      .filter((c): c is { asset: string } => typeof c?.asset === 'string' && c.asset.trim().length > 0)
      .map((c) => ({
        symbol: formatSymbol(c.asset),
        name: `${formatSymbol(c.asset)} Token`,
        type: 'Token' as const,
        basePrice: Math.random() * 2 + 0.5,
      }))
    }, [composition])

  // --- XỬ LÝ KHI ĐỔI TÀI SẢN ---
  const handleAssetChange = (asset: AssetOption) => {
      setSelectedAsset(asset)
      
      if (asset.type === 'NAV') {
          // NAV -> Bắt buộc Area
          setChartType('area')
      } else {
          // Price -> Reset về Candle
          setChartType('candle')
      }
  }

  // --- 1. INIT CHART (STYLE CŨ CỦA BẠN) ---
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Style nền tối #101418 giống file chart-area.tsx
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#101418' }, 
        textColor: '#94a3b8', // Slate-400 cho text dịu mắt
      },
      grid: {
        vertLines: { color: '#1e293b' }, // Slate-800 (Lưới rất mờ)
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 450,
      crosshair: { 
        mode: CrosshairMode.Normal,
        vertLine: {
            labelBackgroundColor: '#1e293b',
        },
        horzLine: {
            labelBackgroundColor: '#1e293b',
        }
      },
      timeScale: { 
        borderColor: '#334155', // Slate-700
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { 
        borderColor: '#334155',
        scaleMargins: { top: 0.1, bottom: 0.2 }, // Chừa đáy cho volume
      },
    })
    
    chartRef.current = chart

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

  // --- 2. UPDATE DATA (COLORS UPDATED) ---
  useEffect(() => {
    if (!chartRef.current) return

    setIsLoading(true)
    
    const timer = setTimeout(() => {
        // Xóa series cũ
        if (areaSeriesRef.current) {
            chartRef.current?.removeSeries(areaSeriesRef.current)
            areaSeriesRef.current = null
        }
        if (candleSeriesRef.current) {
            chartRef.current?.removeSeries(candleSeriesRef.current)
            candleSeriesRef.current = null
        }
        if (volumeSeriesRef.current) {
            chartRef.current?.removeSeries(volumeSeriesRef.current)
            volumeSeriesRef.current = null
        }

        // Chuẩn bị dữ liệu
        const volatility = selectedAsset.type === 'NAV' ? 0.005 : 0.05 
        const base = selectedAsset.basePrice
        const offset = selectedAsset.type === 'Price' ? (Math.random() * 0.02 - 0.01) : 0
        const finalBasePrice = base + offset

        const rawOhlcData = generateOHLCData(timeframe, finalBasePrice, volatility)
        const sortedData = rawOhlcData.map(d => ({
           time: (d.timestamp / 1000) as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            value: d.close,
            volume: d.volume,
        })).sort((a, b) => (a.time as number) - (b.time as number))

        // Vẽ Chart
        if (chartType === 'area') {
            // --- AREA MODE (NAV STYLE) ---
            const areaSeries = chartRef.current!.addSeries(AreaSeries, {
                lineColor: '#10b981', // Emerald-500
                topColor: 'rgba(16, 185, 129, 0.4)', // Gradient đậm hơn chút để đỡ "trống"
                bottomColor: 'rgba(16, 185, 129, 0.0)', 
                lineWidth: 2,
                priceLineVisible: true,
            })
            areaSeries.setData(sortedData.map(d => ({ time: d.time, value: d.value })))
            areaSeriesRef.current = areaSeries

        } else {
            // --- CANDLE MODE (PRICE STYLE) ---
            const candleSeries = chartRef.current!.addSeries(CandlestickSeries, {
                upColor: '#10b981',     // Emerald-500 (Màu cũ bạn thích)
                downColor: '#ef4444',   // Red-500
                borderVisible: false,
                wickUpColor: '#10b981',
                wickDownColor: '#ef4444',
            })
            candleSeries.setData(sortedData)
            candleSeriesRef.current = candleSeries
        }

        // Volume
        const volumeSeries = chartRef.current!.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: '', 
        })
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 }, 
        })
        volumeSeries.setData(sortedData.map(d => ({ time: d.time, value: d.volume,color: d.open < d.close ? '#10b981' : '#ef4444' })))
        volumeSeriesRef.current = volumeSeries

        // Update Header
        if (sortedData.length > 0) {
            const last = sortedData[sortedData.length - 1].close
            const first = sortedData[0].open
            setCurrentPrice(last)
            setPriceChange(((last - first) / first) * 100)
        }

        chartRef.current?.timeScale().fitContent()
        setIsLoading(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [chartType, timeframe, selectedAsset])

  return (
    <div className="w-full bg-[#101418] rounded-xl border border-zinc-800 flex flex-col overflow-hidden shadow-xl">
      
      {/* --- TOOLBAR (STYLE FILE GỐC) --- */}
      <div className="flex flex-col md:flex-row justify-between items-center px-4 py-2 border-b border-zinc-800 gap-4 bg-[#101418]">
         
         {/* LEFT: Asset Selector */}
         <div className="flex items-center gap-4 w-full md:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 text-slate-200 hover:bg-white/5 hover:text-white font-bold text-lg px-2 h-10">
                   {/* Icon Assets */}
                     <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] ${
                       selectedAsset.type === 'Price' ? 'bg-blue-600' : 
                       selectedAsset.type === 'NAV' ? 'bg-[#10b981]' : 'bg-purple-600'
                     } text-white border border-white/10 shadow-sm`}>
                      {selectedAsset.symbol?.charAt(0) ?? safeSymbol.charAt(0)}
                     </div>
                   
                   <div className="flex flex-col items-start leading-none gap-0.5">
                       <span className="text-sm">{selectedAsset.symbol} / ADA</span>
                       <span className="text-[10px] font-normal text-slate-500 uppercase tracking-wider">{selectedAsset.type} Chart</span>
                   </div>
                   <ChevronDown className="w-4 h-4 opacity-50 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#1a1d21] border-zinc-700 text-slate-200 min-w-[220px]">
                <DropdownMenuLabel className="text-xs text-slate-500 font-normal uppercase tracking-wider px-2 py-1.5">Index Metrics</DropdownMenuLabel>
                {indexAssets.map((asset) => (
                   <DropdownMenuItem 
                      key={asset.name} 
                      onClick={() => handleAssetChange(asset)}
                      className="cursor-pointer focus:bg-zinc-800 focus:text-white gap-3 py-2"
                   >
                      <Layers className={`w-4 h-4 ${asset.type === 'NAV' ? 'text-[#10b981]' : 'text-blue-400'}`} />
                      <div className="flex flex-col">
                          <span className="font-medium">{asset.name}</span>
                          <span className="text-[10px] text-slate-500">
                              {asset.type === 'NAV' ? 'Giá trị tài sản ròng' : 'Giá thị trường'}
                          </span>
                      </div>
                   </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-zinc-700" />
                <DropdownMenuLabel className="text-xs text-slate-500 font-normal uppercase tracking-wider px-2 py-1.5">Underlying Assets</DropdownMenuLabel>
                {tokenAssets.map((asset) => (
                   <DropdownMenuItem 
                      key={asset.name} 
                      onClick={() => handleAssetChange(asset)}
                      className="cursor-pointer focus:bg-zinc-800 focus:text-white gap-3 py-2"
                   >
                        <div className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[9px] font-bold">
                          {asset.symbol?.charAt(0) ?? '?'}
                        </div>
                      <span>{asset.symbol}</span>
                   </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex flex-col border-l border-zinc-800 pl-4">
               <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-mono font-bold ${priceChange >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {currentPrice.toFixed(4)}
                  </span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priceChange >= 0 ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>
                     {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                  </span>
               </div>
            </div>
         </div>

         {/* RIGHT: Controls */}
         <div className="flex items-center gap-1 bg-[#0b0e11] p-1 rounded-lg border border-zinc-800">
            
            {/* Chart Type Switcher */}
            {selectedAsset.type !== 'NAV' ? (
                <div className="flex gap-0.5 mr-2 border-r border-zinc-800 pr-2">
                   <Button 
                      variant="ghost" size="sm" 
                      className={`h-7 w-8 p-0 rounded hover:bg-zinc-800 hover:text-white ${chartType === 'area' ? 'text-[#10b981] bg-zinc-800' : 'text-slate-500'}`}
                      onClick={() => setChartType('area')}
                      title="Area Chart"
                   >
                      <LineChart className="w-4 h-4" />
                   </Button>
                   <Button 
                      variant="ghost" size="sm" 
                      className={`h-7 w-8 p-0 rounded hover:bg-zinc-800 hover:text-white ${chartType === 'candle' ? 'text-[#10b981] bg-zinc-800' : 'text-slate-500'}`}
                      onClick={() => setChartType('candle')}
                      title="Candlestick Chart"
                   >
                      <CandlestickChart className="w-4 h-4" />
                   </Button>
                </div>
            ) : (
                <div className="flex items-center gap-1.5 mr-3 border-r border-zinc-800 pr-3 text-xs text-[#10b981] font-medium select-none bg-[#10b981]/5 px-2 py-1 rounded">
                    <Lock className="w-3 h-3" /> Area View
                </div>
            )}

            {TIMEFRAMES.map((tf) => (
               <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${
                     timeframe === tf 
                        ? 'bg-zinc-700 text-slate-100 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-300 hover:bg-zinc-800'
                  }`}
               >
                  {tf}
               </button>
            ))}
            
            <div className="w-px h-4 bg-zinc-800 mx-1"></div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-white hover:bg-zinc-800 rounded">
                <Settings className="w-3.5 h-3.5" />
            </Button>
         </div>
      </div>

      {/* --- CHART CANVAS --- */}
      <div className="relative w-full h-[450px] bg-[#101418]">
         {isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#101418]/80 backdrop-blur-[2px]">
               <RefreshCw className="w-8 h-8 text-[#10b981] animate-spin" />
            </div>
         )}
         
         {/* Overlay Info (Góc trái trên) */}
         {!isLoading && (
             <div className="absolute left-4 top-4 z-10 pointer-events-none p-2 rounded-lg bg-[#0b0e11]/80 backdrop-blur border border-white/5 shadow-lg">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                    {selectedAsset.name}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                            chartType === 'area' ? (selectedAsset.type === 'NAV' ? 'bg-[#10b981]' : 'bg-blue-500') : 'bg-[#10b981]'
                        } animate-pulse`}></div>
                        <span className="text-slate-300 font-medium">
                            {chartType === 'area' ? 'Line View' : 'Candle View'}
                        </span>
                    </div>
                    <span>•</span>
                    <span className={`${selectedAsset.type === 'NAV' ? 'text-[#10b981]' : 'text-slate-400'}`}>
                        {selectedAsset.type === 'NAV' ? 'Intrinsic Value' : 'Market Price'}
                    </span>
                </div>
             </div>
         )}

         <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  )
}