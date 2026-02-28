"use client"

import { useState } from 'react';
import { PieChart, Pie, Sector, ResponsiveContainer, Cell } from 'recharts';
import { mockAllocationData } from '@/lib/market-mock';

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;

  return (
    <g>
      <text x={cx} y={cy} dy={-10} textAnchor="middle" fill="#fff" className="text-lg font-bold">
        {payload.symbol}
      </text>
      <text x={cx} y={cy} dy={15} textAnchor="middle" fill="#9ca3af" className="text-xs">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6} // Nở ra 6px
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 12}
        fill={fill}
      />
    </g>
  );
};

export function AllocationDonutChart() {
  const [activeIndex, setActiveIndex] = useState(0);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="w-full h-[350px] bg-zinc-900/40 rounded-xl border border-zinc-800 p-4 flex flex-col">
       <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-zinc-400">Current Allocation</h3>
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">Rebalanced 2h ago</span>
       </div>

       <div className="flex-1 flex flex-col sm:flex-row items-center">
          {/* Phần Chart */}
          <div className="w-full h-[200px] sm:w-1/2 sm:h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                    {...({ activeIndex, activeShape: renderActiveShape } as any)}
                    data={mockAllocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                    stroke="none"
                  >
                    {mockAllocationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Phần Legend (Chú thích) */}
          <div className="w-full sm:w-1/2 pl-0 sm:pl-4 mt-4 sm:mt-0">
             <div className="space-y-3">
                {mockAllocationData.map((entry, index) => (
                   <div 
                      key={entry.symbol} 
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${index === activeIndex ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
                      onMouseEnter={() => setActiveIndex(index)}
                   >
                      <div className="flex items-center gap-3">
                         <div className="w-3 h-3 rounded-full" style={{backgroundColor: entry.color}}></div>
                         <div>
                            <p className="text-sm font-bold text-zinc-200">{entry.symbol}</p>
                            <p className="text-xs text-zinc-500">{entry.name}</p>
                         </div>
                      </div>
                      <span className="text-sm font-mono font-bold text-zinc-300">{entry.value}%</span>
                   </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );
}