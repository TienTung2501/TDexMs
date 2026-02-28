"use client"

import { useMemo, useState } from "react"
import { useWallet } from "@/contexts/wallet"
import { useParams } from "next/navigation" // <--- THÊM IMPORT NÀY
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Info, ArrowUpRight, ArrowDownLeft, ExternalLink, History } from "lucide-react"
import { MintModal } from "@/components/baskets/mint-modal"
import { RedeemModal } from "@/components/baskets/redeem-modal"
import { AdvancedMarketChart } from "@/components/charts/advanced-market-chart"
import { HydraEfficiencyChart } from "@/components/charts/hydra-efficiency-chart"
import { AllocationDonutChart } from "@/components/charts/allocation-donut-chart"
import { CorrelationChart } from "@/components/charts/correlation-chart"
import { generateTimeframeData } from "@/lib/advanced-mock"

// Minimal mock store
const BASKETS: Record<string, any> = {
  "1": {
    id: 1,
    name: "bAI Index",
    symbol: "bAI",
    description: "Top AI tokens basket optimized for AI sector exposure",
    creator: "Basket.Finance DAO",
    createdAt: "2025-01-15",
    nav: 1.0542,
    change24h: "+2.3%",
    change7d: "+5.8%",
    change30d: "+12.5%",
    tvl: 450000,
    holders: 234,
    volume24h: 85000,
    composition: [
      { asset: "AGIX", weight: 50, price: 0.85 },
      { asset: "IAG", weight: 30, price: 2.15 },
      { asset: "DJED", weight: 20, price: 1.05 },
    ],
    recentRebalances: [
      { date: "2025-01-15 14:32", action: "Rebalanced", deviation: "-2.1%", result: "Restored 50/30/20 weights" },
      { date: "2025-01-13 08:15", action: "Rebalanced", deviation: "+3.5%", result: "Sold excess AGIX" },
      { date: "2025-01-10 16:45", action: "Created", deviation: "-", result: "Initial deployment" },
    ],
  },
}

// MOCK GLOBAL ACTIVITY DATA (Dữ liệu giả lập lịch sử đầu tư/redeem toàn cục)
const GLOBAL_ACTIVITY = [
  { id: "1", type: "Mint", user: "addr1...a8s2", amountADA: 1500, amountTokens: 1423.5, time: "2 mins ago", txHash: "3a1b..." },
  { id: "2", type: "Redeem", user: "addr1...9k2p", amountADA: 450, amountTokens: 426.8, time: "15 mins ago", txHash: "8c2d..." },
  { id: "3", type: "Mint", user: "addr1...3j5l", amountADA: 5000, amountTokens: 4745.1, time: "45 mins ago", txHash: "1f4e..." },
  { id: "4", type: "Mint", user: "addr1...7m4n", amountADA: 200, amountTokens: 189.8, time: "2 hours ago", txHash: "9g5h..." },
  { id: "5", type: "Redeem", user: "addr1...2q1w", amountADA: 1200, amountTokens: 1138.2, time: "5 hours ago", txHash: "2b6v..." },
  { id: "6", type: "Mint", user: "addr1...xp9y", amountADA: 10000, amountTokens: 9485.3, time: "1 day ago", txHash: "7k8l..." },
]

export default function BasketDetailPage() {
  const params = useParams()
  const id = params?.id ? String(params.id) : "1" 
  const { isConnected, getBasketInvestment, getBasketTransactions } = useWallet()
  const basket = useMemo(() => BASKETS[id] ?? BASKETS["1"], [id])

  const userInvestment = isConnected ? getBasketInvestment(id) : null
  const userTransactions = isConnected ? getBasketTransactions(id) : []

  // Mock Hydra Data
  const hydraData = useMemo(() => generateTimeframeData("1D", true), [id])

  // Modals
  const [mintOpen, setMintOpen] = useState(false)
  const [redeemOpen, setRedeemOpen] = useState(false)

  // Activity Filter State
  const [activityFilter, setActivityFilter] = useState<'All' | 'Mint' | 'Redeem'>('All')

  // Filter logic
  const filteredActivity = useMemo(() => {
    if (activityFilter === 'All') return GLOBAL_ACTIVITY
    return GLOBAL_ACTIVITY.filter(item => item.type === activityFilter)
  }, [activityFilter])

  return (
    <div className="bg-background min-h-screen">
      <section className="border-b border-border bg-card/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-4xl font-bold">{basket.name}</h1>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {basket.symbol}
                </span>
              </div>
              <p className="text-muted-foreground max-w-2xl">{basket.description}</p>
              <div className="flex gap-6 mt-4 text-sm text-muted-foreground">
                <span>Creator: {basket.creator}</span>
                <span>Created: {basket.createdAt}</span>
              </div>
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-4xl font-bold text-primary">{basket.nav.toFixed(4)}</p>
              <p className="text-sm text-muted-foreground">NAV per token</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground mb-1">24h Change</p>
              <p className="text-lg font-semibold text-green-400">{basket.change24h}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">7d Change</p>
              <p className="text-lg font-semibold text-green-400">{basket.change7d}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">30d Change</p>
              <p className="text-lg font-semibold text-green-400">{basket.change30d}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">TVL</p>
              <p className="text-lg font-semibold">{(basket.tvl / 1000).toFixed(0)}K ADA</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Holders</p>
              <p className="text-lg font-semibold">{basket.holders}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl grid gap-8 lg:grid-cols-3">
          
          {/* CỘT TRÁI: CHART & STATS (2/3) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* --- MAIN CHART SECTION --- */}
            <div className="space-y-4">
               <AdvancedMarketChart 
                  basketSymbol={basket.symbol} 
                  composition={basket.composition}
               />
            </div>

            {/* Quick stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Total TVL</p>
                <p className="text-xl font-semibold">{(basket.tvl / 1000).toFixed(0)}K ADA</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Investors</p>
                <p className="text-xl font-semibold">{basket.holders}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Performance</p>
                <p className="text-xl font-semibold text-green-400">+{basket.change30d}</p>
              </Card>
            </div>

            {/* Composition & Correlation */}
            <Card className="p-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-3">Portfolio Composition</h3>
                  <div className="space-y-3">
                    {basket.composition.map((c: any) => (
                      <div key={c.asset} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-zinc-800/30 flex items-center justify-center text-xs font-bold">{c.asset}</div>
                          <div>
                            <p className="font-medium">{c.asset}</p>
                            <p className="text-xs text-muted-foreground">${c.price.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-primary">{c.weight}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <AllocationDonutChart />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border">
                <CorrelationChart />
              </div>
            </Card>

            {/* --- NEW SECTION: RECENT ACTIVITY (INVEST/REDEEM HISTORY) --- */}
            <Card className="p-6">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold flex items-center gap-2">
                     <History className="w-5 h-5 text-muted-foreground" />
                     Recent Activity
                  </h3>
                  <div className="flex bg-muted p-1 rounded-lg">
                     {(['All', 'Mint', 'Redeem'] as const).map((tab) => (
                        <button
                           key={tab}
                           onClick={() => setActivityFilter(tab)}
                           className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                              activityFilter === tab 
                                 ? 'bg-background shadow-sm text-primary' 
                                 : 'text-muted-foreground hover:text-primary'
                           }`}
                        >
                           {tab}
                        </button>
                     ))}
                  </div>
               </div>

               <div className="space-y-1">
                  {/* Table Header */}
                  <div className="grid grid-cols-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase bg-muted/30 rounded-t-lg">
                     <div>Type</div>
                     <div>Amount (ADA)</div>
                     <div>Wallet / Time</div>
                     <div className="text-right">Tx Hash</div>
                  </div>

                  {/* Activity Rows */}
                  {filteredActivity.map((item) => (
                     <div key={item.id} className="grid grid-cols-4 px-4 py-4 text-sm border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2">
                           {item.type === 'Mint' ? (
                              <div className="p-1.5 rounded-full bg-green-500/10 text-green-400">
                                 <ArrowUpRight className="w-3.5 h-3.5" />
                              </div>
                           ) : (
                              <div className="p-1.5 rounded-full bg-red-500/10 text-red-400">
                                 <ArrowDownLeft className="w-3.5 h-3.5" />
                              </div>
                           )}
                           <span className={`font-medium ${item.type === 'Mint' ? 'text-green-400' : 'text-red-400'}`}>
                              {item.type}
                           </span>
                        </div>
                        
                        <div className="flex flex-col justify-center">
                           <span className="font-bold">{item.amountADA.toLocaleString()} ₳</span>
                           <span className="text-xs text-muted-foreground">{item.amountTokens.toFixed(2)} {basket.symbol}</span>
                        </div>
                        
                        <div className="flex flex-col justify-center">
                           <span className="font-mono text-xs text-primary">{item.user}</span>
                           <span className="text-xs text-muted-foreground">{item.time}</span>
                        </div>
                        
                        <div className="flex items-center justify-end">
                           <a href="#" className="text-muted-foreground hover:text-blue-400 transition-colors flex items-center gap-1 text-xs">
                              {item.txHash} <ExternalLink className="w-3 h-3" />
                           </a>
                        </div>
                     </div>
                  ))}
               </div>
            </Card>

            {/* Rebalance history */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Rebalance History</h3>
              <div className="space-y-4">
                {basket.recentRebalances.map((rb: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-4 pb-4 border-b border-border last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rb.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{rb.date}</p>
                      <p className="text-xs text-muted-foreground mt-1">{rb.result}</p>
                    </div>
                    {rb.deviation !== "-" && (
                      <span className="text-xs px-2 py-1 rounded-md bg-yellow-500/10 text-yellow-600">{rb.deviation}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* CỘT PHẢI: SIDEBAR (1/3) */}
          <aside className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-col gap-3">
                <Button onClick={() => setMintOpen(true)} className="w-full font-bold py-6 text-lg">Invest Now</Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={() => setRedeemOpen(true)} variant="outline" className="w-full">Redeem</Button>
                  <Button variant="ghost" className="w-full">Export CSV</Button>
                </div>
              </div>
            </Card>

            {!isConnected && (
              <Card className="p-4 bg-blue-500/5 border-blue-500/20">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium mb-1 text-blue-100">Connect Wallet</p>
                    <p className="text-xs text-blue-200/70">Connect to see your specific holdings and P&L.</p>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                Hydra Efficiency <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Live</span>
              </h4>
              <HydraEfficiencyChart data={hydraData as any} title="" />
            </Card>

            <Card className="p-4">
              <h4 className="text-sm font-medium mb-2">On-chain Details</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Validator</span> <span className="font-mono text-zinc-300">addr1q...8x9z</span></div>
                <div className="flex justify-between"><span>Policy ID</span> <span className="font-mono text-zinc-300">1234...abcd</span></div>
                <div className="flex justify-between"><span>Rebalance Freq</span> <span className="text-zinc-300">~4h</span></div>
              </div>
            </Card>
          </aside>
        </div>
      </section>

      <MintModal
        open={mintOpen}
        onOpenChange={setMintOpen}
        basketName={basket.name}
        basketSymbol={basket.symbol}
        composition={basket.composition}
      />
      <RedeemModal
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
        basketName={basket.name}
        basketSymbol={basket.symbol}
        composition={basket.composition}
        balance={userInvestment?.shares || 0}
      />
    </div>
  )
}