"use client"

import { useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend 
} from 'recharts';
import { format } from 'date-fns';
import { generateMarketData } from '@/lib/market-mock';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-950/90 border border-zinc-800 p-3 rounded-lg shadow-xl backdrop-blur-sm">
        <p className="text-zinc-500 text-xs mb-2">{format(new Date(label), 'dd MMM yyyy')}</p>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-4 mb-1">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{backgroundColor: entry.color}}></div>
                <span className="text-zinc-300 text-xs">{entry.name}</span>
             </div>
             <span className={`text-xs font-bold ${entry.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
               {entry.value > 0 ? '+' : ''}{entry.value.toFixed(2)}%
             </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function CorrelationChart() {
  interface MarketPoint {
    date: string;
    value: number;
    adaValue: number;
    btcValue: number;
    [key: string]: any;
  }

  const rawData = useMemo<MarketPoint[]>(() => generateMarketData(90), []); // Lấy 90 ngày

  // Chuẩn hóa dữ liệu về % thay đổi so với ngày đầu tiên (Base 0)
  const normalizedData = useMemo(() => {
    if (rawData.length === 0) return []
    const baseNav = rawData[0].value;
    const baseAda = rawData[0].adaValue;
    const baseBtc = rawData[0].btcValue;

    return rawData.map((point: MarketPoint) => ({
      ...point,
      percentNav: ((point.value - baseNav) / baseNav) * 100,
      percentAda: ((point.adaValue - baseAda) / baseAda) * 100,
      percentBtc: ((point.btcValue - baseBtc) / baseBtc) * 100,
    }));
  }, [rawData]);

  if (!normalizedData.length) {
    return (
      <div className="w-full h-[350px] bg-zinc-900/40 rounded-xl border border-zinc-800 p-4 flex items-center justify-center text-sm text-muted-foreground">
        No correlation data available
      </div>
    )
  }

  return (
    <div className="w-full h-[350px] bg-zinc-900/40 rounded-xl border border-zinc-800 p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">Performance Comparison (vs Benchmark)</h3>
      
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={normalizedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="date" 
            tickFormatter={(str) => format(new Date(str), 'dd/MM')}
            stroke="#52525b"
            tick={{fontSize: 11}}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            stroke="#52525b"
            tick={{fontSize: 11}}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `${val}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="top" 
            height={36} 
            iconType="circle"
            wrapperStyle={{fontSize: '12px', paddingTop: '0px'}}
          />
          
          {/* Basket Line (Nổi bật nhất) */}
          <Line 
            name="Your Basket"
            type="monotone" 
            dataKey="percentNav" 
            stroke="#3b82f6" 
            strokeWidth={3} 
            dot={false}
            activeDot={{r: 6}}
          />
          
          {/* ADA Line (Mờ hơn) */}
          <Line 
            name="Cardano (ADA)"
            type="monotone" 
            dataKey="percentAda" 
            stroke="#60a5fa" 
            strokeWidth={1.5} 
            strokeDasharray="4 4"
            dot={false} 
            opacity={0.7}
          />

          {/* BTC Line (Mờ nhất) */}
          <Line 
            name="Bitcoin (BTC)"
            type="monotone" 
            dataKey="percentBtc" 
            stroke="#f59e0b" 
            strokeWidth={1.5} 
            strokeDasharray="2 2"
            dot={false} 
            opacity={0.5}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}