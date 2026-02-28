"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface AllocationItem {
  [key: string]: any;
  name: string;
  value: number;
  color: string;
}

interface DashboardAllocationChartProps {
  data: AllocationItem[];
}

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-[10px] font-bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0]?.payload
  if (!data) return null
  return (
    <div className="bg-zinc-950/90 border border-zinc-800 p-2 rounded-lg shadow-xl backdrop-blur-sm text-xs">
      <div className="flex items-center gap-2 mb-1">
         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }}></div>
         <span className="text-slate-300 font-medium">{data.name}</span>
      </div>
      <div className="font-bold text-slate-100">
         {data.value}%
      </div>
    </div>
  )
}

export function DashboardAllocationChart({ data }: DashboardAllocationChartProps) {
  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            innerRadius={45}
            outerRadius={70}
            fill="#8884d8"
            dataKey="value"
            stroke="none"
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}