import { Button } from "@/components/ui/button"
import { Plus, Settings, ChevronDown, BarChart3 } from "lucide-react"

interface ChartToolbarProps {
  activeTimeframe: string
  onTimeframeChange: (tf: string) => void
  options: string[]
}

export function ChartToolbar({ activeTimeframe, onTimeframeChange, options }: ChartToolbarProps) {
  return (
    // Nền tối #101418, Border mờ
    <div className="flex h-10 items-center justify-between border-b border-white/10 bg-[#101418] px-4 text-xs text-slate-400">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 border-r border-white/10 pr-4">
          <Button variant="ghost" size="sm" className="h-6 gap-2 px-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white">
            <BarChart3 className="h-3 w-3" />
            Coin Chart
          </Button>
          <div className="cursor-pointer rounded p-1 hover:bg-white/5 hover:text-white">
             <Plus className="h-3 w-3" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {options.map((tf) => (
             <button 
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`
                  rounded px-2 py-1 font-medium transition-all
                  ${activeTimeframe === tf 
                    ? 'bg-emerald-500/20 text-emerald-400' // Active: Xanh Neon
                    : 'text-slate-500 hover:bg-white/5 hover:text-white' // Inactive
                  }
                `}
             >
                {tf}
             </button>
          ))}
          <div className="cursor-pointer rounded p-1 hover:bg-white/5 hover:text-white ml-2">
            <Settings className="h-3 w-3" />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 cursor-pointer hover:text-white">
             <span>Save template</span>
             <ChevronDown className="h-3 w-3" />
        </div>
      </div>
    </div>
  )
}