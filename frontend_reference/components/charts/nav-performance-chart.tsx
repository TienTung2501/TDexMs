"use client"

import { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { format } from 'date-fns';
import { generateMarketData } from '@/lib/market-mock';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const TIMEFRAMES = ['1W', '1M', '3M', '1Y', 'ALL'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const pointValue = typeof payload[0]?.value === 'number' ? payload[0].value : null
  if (pointValue === null) return null
  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm">
      <p className="text-zinc-500 text-xs mb-1">{label ? format(new Date(label), 'dd MMM yyyy') : ''}</p>
      <p className="text-blue-400 font-bold text-lg">
        ₳ {pointValue.toFixed(2)}
      </p>
    </div>
  )
}

export function NavPerformanceChart() {
  const [timeframe, setTimeframe] = useState('1Y');
  
  // Memoize data để không render lại lung tung
  const fullData = useMemo(() => generateMarketData(365), []);
  
  const chartData = useMemo(() => {
    const days = timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : timeframe === '3M' ? 90 : 365;
    return fullData.slice(-days);
  }, [timeframe, fullData]);

  // Tính toán % thay đổi
  const startPrice = chartData[0]?.value || 100;
  const endPrice = chartData[chartData.length - 1]?.value || 100;
  const change = ((endPrice - startPrice) / startPrice) * 100;
  const isPositive = change >= 0;

  return (
    <div className="w-full h-[400px] bg-zinc-900/40 rounded-xl border border-zinc-800 p-4 flex flex-col">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-400">Net Asset Value (NAV)</h3>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-3xl font-bold text-zinc-100">₳ {endPrice.toFixed(2)}</h2>
            <span className={`flex items-center text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(change).toFixed(2)}%
            </span>
          </div>
        </div>
        
        {/* Timeframe Selector */}
        <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === tf 
                  ? 'bg-zinc-800 text-white' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorNav" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="date" 
            tickFormatter={(str) => format(new Date(str), 'dd MMM')}
            stroke="#52525b"
            tick={{fontSize: 11}}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis 
            domain={['auto', 'auto']}
            stroke="#52525b"
            tick={{fontSize: 11}}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `₳${val}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={isPositive ? "#10b981" : "#ef4444"} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorNav)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}