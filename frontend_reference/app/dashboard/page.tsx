"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PieChart, 
  History, 
  Wallet, 
  ExternalLink, 
  ChevronRight 
} from "lucide-react"
import { AllocationDonutChart } from "@/components/charts/allocation-donut-chart"
import { PortfolioPerformanceChart } from "@/components/charts/portfolio-performance-chart"
import { DashboardAllocationChart } from "@/components/charts/dashboard-allocation-chart"
import { useWallet } from '@/contexts/wallet'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardPage() {
  const { isConnected, walletAddress, walletBalance } = useWallet()
  const router = useRouter()
  const [activityFilter, setActivityFilter] = useState<'All' | 'Mint' | 'Redeem'>('All')

  // Redirect to home if not connected
  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  if (!isConnected) {
    return null
  }

  const portfolio = {
    totalInvested: 5000,
    currentValue: 5625,
    totalPnL: 625,
    totalPnLPercent: 12.5,
  }

  const holdings = [
    {
      id: 1,
      name: "bAI Index",
      symbol: "bAI",
      quantity: 450,
      nav: 1.0542,
      currentValue: 474.39,
      invested: 420,
      pnl: 54.39,
      pnlPercent: 12.95,
      color: "#3b82f6", // Blue
      allocation: 45
    },
    {
      id: 2,
      name: "bDeFi Stable",
      symbol: "bDFS",
      quantity: 320,
      nav: 1.0315,
      currentValue: 329.95,
      invested: 300,
      pnl: 29.95,
      pnlPercent: 9.98,
      color: "#a855f7", // Purple
      allocation: 32
    },
    {
      id: 3,
      name: "bGameFi",
      symbol: "bGF",
      quantity: 180,
      nav: 1.0128,
      currentValue: 182.3,
      invested: 175,
      pnl: 7.3,
      pnlPercent: 4.17,
      color: "#eab308", // Yellow
      allocation: 23
    },
  ]

  // Chuẩn bị data cho Chart từ userHoldings
  const allocationData = useMemo(() => 
    holdings.map(h => ({
      name: h.symbol,
      value: h.allocation,
      color: h.color
    })), 
  [holdings])

  const transactions = [
    { id: 1, date: "2025-01-15 14:30", type: "Mint", basket: "bAI", amount: 450, hash: "tx_abc1...", status: "completed" },
    { id: 2, date: "2025-01-14 09:15", type: "Mint", basket: "bDFS", amount: 320, hash: "tx_def2...", status: "completed" },
    { id: 3, date: "2025-01-12 18:45", type: "Mint", basket: "bGF", amount: 180, hash: "tx_ghi3...", status: "completed" },
    { id: 4, date: "2025-01-10 11:20", type: "Redeem", basket: "bAI", amount: 50, hash: "tx_jkl4...", status: "completed" },
    { id: 5, date: "2025-01-08 16:00", type: "Mint", basket: "bAI", amount: 100, hash: "tx_mno5...", status: "completed" },
  ]

  const filteredTransactions = useMemo(() => {
    if (activityFilter === 'All') return transactions
    return transactions.filter(t => t.type === activityFilter)
  }, [activityFilter, transactions])

  return (
      <div className="min-h-screen bg-background">
        {/* Page Header */}
        <section className="border-b border-border bg-card/50 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h1 className="text-3xl font-bold mb-2">Investment Portfolio</h1>
            <p className="text-muted-foreground">
              Connected wallet: <span className="text-primary font-medium font-mono bg-muted px-2 py-0.5 rounded text-xs">{walletAddress?.substring(0, 12)}...{walletAddress?.substring(walletAddress.length - 8)}</span>
            </p>
          </div>
        </section>

        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl grid gap-8 lg:grid-cols-3">
            
            {/* LEFT COLUMN (2/3) */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* 1. Performance Chart Section */}
              <Card className="p-6 bg-card/50 border-border">
                 <PortfolioPerformanceChart />
                 <div className="grid grid-cols-3 gap-4 mt-6 border-t border-border pt-6">
                    <div>
                       <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Invested Capital</p>
                       <p className="text-lg font-bold">{portfolio.totalInvested.toLocaleString()} ₳</p>
                    </div>
                    <div>
                       <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Current Value</p>
                       <p className="text-lg font-bold">{portfolio.currentValue.toLocaleString()} ₳</p>
                    </div>
                    <div>
                       <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">Net Profit</p>
                       <p className="text-lg font-bold text-green-400">+{portfolio.totalPnL.toLocaleString()} ₳</p>
                    </div>
                 </div>
              </Card>

              {/* 2. Holdings List (Cards) */}
              <Card className="bg-card/50 border-border">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div className="flex items-center justify-between">
                      <div>
                          <CardTitle className="text-lg">Your Holdings</CardTitle>
                          <CardDescription>Overview of your basket investments</CardDescription>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/explore">Explore More</Link>
                      </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-6 md:grid-cols-3 mb-6">
                      {/* Chart Area */}
                      <div className="md:col-span-1 flex flex-col items-center justify-center border-r border-border/50 pr-4">
                          <DashboardAllocationChart data={allocationData} />
                          <p className="text-xs text-muted-foreground mt-2 text-center">Portfolio Distribution</p>
                      </div>

                      {/* List Area */}
                      <div className="md:col-span-2 space-y-3 pl-0 md:pl-4">
                        {holdings.map((holding) => (
                          <div key={holding.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-all group">
                            <div className="flex items-center gap-3">
                               <div className="w-1 h-10 rounded-full" style={{ backgroundColor: holding.color }}></div>
                               <div>
                                  <p className="font-bold text-sm">{holding.name}</p>
                                  <p className="text-xs text-muted-foreground">{holding.quantity.toLocaleString()} {holding.symbol}</p>
                               </div>
                            </div>
                            <div className="text-right min-w-[100px]">
                              <p className="font-mono font-medium text-sm">{holding.currentValue.toLocaleString()} ₳</p>
                              <p className={`text-xs font-medium ${holding.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {holding.pnl >= 0 ? '+' : ''}{holding.pnl.toFixed(2)} ₳
                              </p>
                            </div>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Link href={`/basket/${holding.id}`} title="Click to detail">
                                <ArrowUpRight className="w-4 h-4" />
                              </Link>
                            </Button>

                          </div>
                        ))}
                      </div>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* RIGHT COLUMN (1/3) */}
            <div className="lg:col-span-1 space-y-8">
               
               {/* 1. Stats Grid (Vertical for Sidebar) */}
                <div className="grid grid-cols-1 gap-4">
                    <Card className="bg-card/50 border-border hover:border-primary/30 transition-colors p-4 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Wallet Balance</p>
                            <p className="text-xl font-bold">{walletBalance.toLocaleString()} ₳</p>
                        </div>
                    </Card>
                    <Card className="bg-card/50 border-border hover:border-primary/30 transition-colors p-4 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-green-500/10 text-green-500">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Return (ROI)</p>
                            <p className="text-xl font-bold text-green-500">+{portfolio.totalPnLPercent}%</p>
                        </div>
                    </Card>
                </div>

               {/* 2. Recent Activity (List Style) */}
               <Card className="bg-card/50 border-border h-fit">
                  <div className="p-6 pb-0 flex items-center justify-between mb-4">
                     <h3 className="font-semibold flex items-center gap-2 text-lg">
                        <History className="w-5 h-5 text-muted-foreground" /> Activity
                     </h3>
                     <div className="flex bg-muted p-1 rounded-lg">
                        {(['All', 'Mint', 'Redeem'] as const).map((tab) => (
                           <button
                              key={tab}
                              onClick={() => setActivityFilter(tab)}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                 activityFilter === tab 
                                    ? 'bg-background shadow-sm text-foreground' 
                                    : 'text-muted-foreground hover:text-primary'
                              }`}
                           >
                              {tab}
                           </button>
                        ))}
                     </div>
                  </div>

                  <CardContent>
                    <div className="space-y-1">
                        {filteredTransactions.map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
                            <div className="flex items-center gap-3">
                                {/* Icon Type */}
                                <div className={`p-2 rounded-full ${tx.type === 'Mint' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {tx.type === 'Mint' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium capitalize">{tx.type} <span className="text-muted-foreground text-xs font-normal">({tx.basket})</span></p>
                                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold">{tx.amount} ₳</p>
                                <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                    <span className="capitalize">{tx.status}</span>
                                </div>
                            </div>
                            </div>
                        ))}
                    </div>
                    <Button variant="ghost" className="w-full mt-4 text-xs text-muted-foreground hover:text-primary">View All History</Button>
                  </CardContent>
               </Card>

            </div>
          </div>
        </div>
      </div>
  )
}