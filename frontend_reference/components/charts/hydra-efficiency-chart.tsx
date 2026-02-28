"use client"

import { 
  ComposedChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine, 
  ResponsiveContainer, 
  Cell,
  Scatter
} from 'recharts';
import { MonitorPoint } from '@/lib/monitor-mock';
import { JSX } from 'react';

interface HydraEfficiencyChartProps {
  data: MonitorPoint[];
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg shadow-xl">
      <p className="text-zinc-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-sm">
        Deviation: <span className={point.deviation > point.threshold ? 'text-red-400' : 'text-blue-400'}>
          {point.deviation}%
        </span>
      </p>
      {point.isRebalanced && (
        <div className="mt-2 pt-2 border-t border-zinc-800">
          <p className="text-yellow-400 font-bold text-xs flex items-center gap-1">
            ⚡ Hydra Activated
          </p>
          <p className="text-zinc-500 text-xs">Gas saved: {point.gasSaved} ADA</p>
        </div>
      )}
    </div>
  )
}

export function HydraEfficiencyChart({ data, title }: HydraEfficiencyChartProps) {
  return (
    <div className="w-full h-[350px] bg-card/30 rounded-xl border border-border p-4">
      {title && (
        <div className="flex justify-between items-center mb-4">
           <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{title}</h3>
           <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                <span className="text-zinc-400">Drift</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-zinc-400">Hydra Fix</span>
              </div>
           </div>
        </div>
      )}
      
      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#71717a" 
            tick={{fontSize: 11}} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#71717a" 
            tick={{fontSize: 11}} 
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#27272a', opacity: 0.4 }} />
          
          {/* Đường ngưỡng an toàn (Threshold) */}
          <ReferenceLine y={3} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'Trigger (3%)', position: 'right', fill: '#ef4444', fontSize: 10 }} />
          
          {/* Cột hiển thị độ lệch */}
          <Bar dataKey="deviation" barSize={20} radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.deviation > entry.threshold ? '#ef4444' : '#3b82f6'} 
                fillOpacity={entry.deviation > entry.threshold ? 0.8 : 0.5}
              />
            ))}
          </Bar>

          {/* Điểm đánh dấu sự kiện Rebalance (Scatter plot đè lên Bar) */}
          <Scatter dataKey="deviation" shape={(props: any): JSX.Element => {
             const { cx, cy, payload } = props;
             if (payload.isRebalanced) {
               return (
                 <g>
                    <circle cx={cx} cy={cy} r={6} fill="#eab308" stroke="#000" strokeWidth={2} className="animate-pulse" />
                    {/* Icon sét Hydra (Optional) */}
                 </g>
               );
             }
             // Return an empty SVG group instead of null to satisfy the expected return type
             return <g />;
          }} />

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}