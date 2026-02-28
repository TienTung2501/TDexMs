"use client"

import { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { format, subDays, addDays } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

// Mock Data Generator cho Portfolio
const generatePortfolioData = (days: number) => {
  const data = [];
  const now = new Date();
  const startDate = subDays(now, days);
  let value = 5000; // Vốn ban đầu giả định

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    // Tăng trưởng nhẹ + Random biến động
    value = value * (1 + (Math.random() - 0.4) * 0.02); 
    data.push({
      date: date.toISOString(),
      value: parseFloat(value.toFixed(2)),
    });
  }
  return data;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]
  const value = typeof point?.value === 'number' ? point.value : null
  if (value === null) return null
  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm">
      <p className="text-zinc-500 text-xs mb-1">{label ? format(new Date(label), 'dd MMM yyyy') : ''}</p>
      <p className="text-blue-400 font-bold text-lg">
        {value.toLocaleString()} ₳
      </p>
    </div>
  )
}

const TIMEFRAMES = ['1W', '1M', '3M', '1Y', 'ALL'];

export function PortfolioPerformanceChart() {
  const [timeframe, setTimeframe] = useState('1M');
  
  const data = useMemo(() => {
    const days = timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : timeframe === '3M' ? 90 : 365;
    return generatePortfolioData(days);
  }, [timeframe]);

  const startVal = data[0]?.value || 0;
  const endVal = data[data.length - 1]?.value || 0;
  const pnl = endVal - startVal;
  const pnlPercent = (pnl / startVal) * 100;
  const isPositive = pnl >= 0;

  return (
    <div className="w-full h-[350px] flex flex-col">
      <div className="flex justify-between items-start mb-4 px-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Net Worth
          </h3>
          <div className="flex items-baseline gap-2 mt-1">
            <h2 className="text-3xl font-bold">{endVal.toLocaleString()} ₳</h2>
            <span className={`flex items-center text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(pnlPercent).toFixed(2)}%
            </span>
          </div>
        </div>
        
        <div className="flex bg-muted p-0.5 rounded-lg">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === tf 
                  ? 'bg-background text-primary shadow-sm' 
                  : 'text-muted-foreground hover:text-primary'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
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
              width={40}
              tickFormatter={(val) => `${(val/1000).toFixed(1)}k`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1 }} />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke={isPositive ? "#10b981" : "#ef4444"} 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorPortfolio)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}