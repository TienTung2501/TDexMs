"use client"

import { useState, useEffect, JSX } from 'react';
import { 
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ReferenceLine, ResponsiveContainer, Cell, Scatter, Brush 
} from 'recharts';
import { format } from 'date-fns';
import { generateTimeframeData, TimeFrame, MonitorPoint } from '@/lib/advanced-mock';
import { Zap, RefreshCw } from 'lucide-react';

interface AdvancedHydraChartProps {
  isVolatile?: boolean; // Truyền vào để giả lập rổ biến động hay không
  basketName: string;
}

const TIMEFRAMES: TimeFrame[] = ['1H', '4H', '1D', '1W', '1M'];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-lg shadow-2xl backdrop-blur-sm min-w-[200px]">
      <p className="text-zinc-400 text-xs mb-2 border-b border-zinc-800 pb-1">
        {format(new Date(point.time), 'dd MMM yyyy - HH:mm')}
      </p>
      <div className="flex justify-between items-center mb-1">
         <span className="text-zinc-300 text-sm">Drift:</span>
         <span className={`font-mono font-bold ${point.deviation > point.threshold ? 'text-red-400' : 'text-blue-400'}`}>
           {point.deviation}%
         </span>
      </div>
      <div className="flex justify-between items-center mb-2">
         <span className="text-zinc-500 text-xs">Threshold:</span>
         <span className="text-zinc-500 text-xs font-mono">3.0%</span>
      </div>
      
      {point.isRebalanced && (
        <div className="mt-2 pt-2 border-t border-zinc-800 bg-yellow-500/10 -mx-3 px-3 pb-1 rounded-b-lg">
          <p className="text-yellow-400 font-bold text-xs flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3" /> Hydra Executed
          </p>
          <p className="text-zinc-400 text-xs flex justify-between">
             <span>Gas Saved:</span>
             <span className="text-green-400 font-mono">{point.gasSaved} ₳</span>
          </p>
        </div>
      )}
    </div>
  )
}

export function AdvancedHydraChart({ isVolatile = false, basketName }: AdvancedHydraChartProps) {
  const [timeframe, setTimeframe] = useState<TimeFrame>('1D');
  const [data, setData] = useState<MonitorPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Effect để load dữ liệu khi đổi timeframe hoặc loại rổ
  useEffect(() => {
    setIsLoading(true);
    // Giả lập delay mạng một chút cho cảm giác thật
    const timer = setTimeout(() => {
      const newData = generateTimeframeData(timeframe, isVolatile);
      setData(newData);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [timeframe, isVolatile]);

  // Formatter cho trục X dựa trên timeframe
  const xAxisTickFormatter = (timestamp: number) => {
    const date = new Date(timestamp);
    if (timeframe === '1H' || timeframe === '4H') return format(date, 'HH:mm');
    if (timeframe === '1D') return format(date, 'HH:mm');
    return format(date, 'dd/MM');
  };

  return (
    <div className="w-full h-[500px] bg-zinc-900/40 rounded-xl border border-zinc-800 flex flex-col overflow-hidden">
      
      {/* --- HEADER TOOLBAR --- */}
      <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-b border-zinc-800 gap-4">
        <div className="flex items-center gap-4">
           <div className="flex flex-col">
              <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                {basketName} <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Deviation Monitor</span>
              </h3>
              <p className="text-xs text-zinc-500">Hydra Head Execution & Drift Tracking</p>
           </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === tf 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      
      {/* --- CHART AREA --- */}
      <div className="flex-1 w-full relative min-h-0 p-2">
        {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3}/>
              </linearGradient>
              <linearGradient id="barAlertGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            
            <XAxis 
              dataKey="timestamp" 
              scale="time" 
              type="number" 
              domain={['auto', 'auto']}
              tickFormatter={xAxisTickFormatter}
              stroke="#71717a" 
              tick={{fontSize: 11}} 
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            
            <YAxis 
              stroke="#71717a" 
              tick={{fontSize: 11}} 
              tickLine={false} 
              axisLine={false} 
              unit="%"
              domain={[0, (dataMax: number) => Math.max(dataMax * 1.2, 4)]} // Luôn giữ khoảng trống phía trên
            />
            
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#27272a', opacity: 0.4 }} />
            
            {/* Threshold Line */}
            <ReferenceLine y={3} stroke="#dc2626" strokeDasharray="3 3">
                {/* Label cho Reference Line phức tạp hơn cần dùng SVG custom, ở đây dùng label mặc định */}
            </ReferenceLine>

            {/* Deviation Bars */}
            <Bar dataKey="deviation" barSize={10} radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.deviation > entry.threshold ? "url(#barAlertGradient)" : "url(#barGradient)"} 
                />
              ))}
            </Bar>

            {/* Hydra Events (Scatter) */}
            <Scatter dataKey="deviation" shape={(props: any): JSX.Element => {
               const { cx, cy, payload } = props;
               if (payload.isRebalanced) {
                 return (
                   <g className="cursor-pointer hover:scale-150 transition-transform">
                      <circle cx={cx} cy={cy} r={8} fill="#eab308" stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                      <path d={`M${cx-3} ${cy-4} L${cx+4} ${cy-4} L${cx} ${cy+5} Z`} fill="black" /> {/* Tia sét nhỏ */}
                   </g>
                 );
               }
               // return an empty group instead of null to satisfy Recharts' required return type
               return <g />;
            }} />

            {/* Brush (Zoom Slider) - Feature giống TradingView */}
            <Brush 
                dataKey="timestamp" 
                height={30} 
                stroke="#3f3f46" 
                fill="#18181b" 
                tickFormatter={xAxisTickFormatter}
                startIndex={Math.floor(data.length * 0.3)} // Mặc định zoom vào 70% dữ liệu cuối
            />

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}