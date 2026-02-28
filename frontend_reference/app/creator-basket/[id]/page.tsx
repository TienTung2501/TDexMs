'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useWallet } from '@/contexts/wallet'
import { ArrowLeft, Edit2, Save, X, Plus, Trash2, RefreshCw } from 'lucide-react'
import { HydraEfficiencyChart } from '@/components/charts/hydra-efficiency-chart'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { CorrelationChart } from '@/components/charts/correlation-chart'
import { AdvancedMarketChart } from '@/components/charts/advanced-market-chart'

// Import Data
import { generateTimeframeData } from '@/lib/advanced-mock' 

export default function CreatorBasketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const basketId = params?.id ? String(params.id) : '1' 
  const wallet = useWallet()

  const ctxGet = (wallet as any)?.getCreatorBasket
  const ctxGetInvestment = (wallet as any)?.getBasketInvestment
  
  const [basket, setBasket] = useState<any>(() => {
    return (typeof ctxGet === 'function' ? ctxGet(basketId) : undefined)
  })
  const [investment, setInvestment] = useState<any>(() => {
    return (typeof ctxGetInvestment === 'function' ? ctxGetInvestment(basketId) : null)
  })

  // Fallback mock data
  useEffect(() => {
    if (!basket) {
      setBasket({
        id: basketId,
        basketName: 'bAI Index',
        symbol: 'bAI', 
        description: 'Top AI tokens basket managed by creator',
        status: 'active',
        totalTVL: 450000,
        totalInvestors: 234,
        performance: 12.5,
        feesEarned: 12500,
        rebalanceCount: 12,
        lastRebalance: '2025-01-15 14:32',
        createdDate: '2025-01-15',
        assets: ['AGIX', 'IAG', 'DJED'],
        composition: [
          { asset: 'AGIX', weight: 50, price: 0.85 },
          { asset: 'IAG', weight: 30, price: 2.15 },
          { asset: 'DJED', weight: 20, price: 1.05 },
        ],
        recentRebalances: [
          { date: '2025-01-15 14:32', action: 'Rebalanced', deviation: '-2.1%', result: 'Restored 50/30/20 weights' },
          { date: '2025-01-13 08:15', action: 'Rebalanced', deviation: '+3.5%', result: 'Sold excess AGIX' },
          { date: '2025-01-10 16:45', action: 'Created', deviation: '-', result: 'Initial deployment' },
        ],
      })
    }
    if (!investment) {
      setInvestment({
        shares: 120.5,
        amount: 1250,
        pnl: 125,
        pnlPercent: 11.1,
        totalInvested: 1250,
        totalRedeemed: 0,
      })
    }
  }, [basket, investment, basketId])

  const [activeTab, setActiveTab] = useState<'overview' | 'composition' | 'operations' | 'edit' | 'invest'>('overview')
  const [isEditMode, setIsEditMode] = useState(false)
  const [editData, setEditData] = useState<{ name: string; description: string; assets: string[]; feePercentage: number }>({
    name: basket?.basketName || '',
    description: basket?.description || '',
    assets: (basket?.assets as string[]) || [],
    feePercentage: 0.5,
  })

  useEffect(() => {
    if (basket) {
        setEditData({
            name: basket.basketName || '',
            description: basket.description || '',
            assets: (basket.assets as string[]) || [],
            feePercentage: 0.5,
        })
    }
  }, [basket])

  const hydraData = useMemo(() => generateTimeframeData('1D', false), [])

  const handleAddAsset = () => {
    setEditData((prev) => ({ ...prev, assets: [...prev.assets, ''] }))
  }

  const handleRemoveAsset = (index: number) => {
    setEditData((prev) => ({ ...prev, assets: prev.assets.filter((_, i) => i !== index) }))
  }

  const handleAssetChange = (index: number, value: string) => {
    setEditData((prev) => {
      const newAssets = [...prev.assets]
      newAssets[index] = value
      return { ...prev, assets: newAssets }
    })
  }

  const handleSaveChanges = () => {
    console.log('Save', editData)
    setIsEditMode(false)
  }

  if (!basket) return null

  return (
    <div className="bg-background min-h-screen">
      <div className="shell px-4 py-8 max-w-[1600px] mx-auto"> {/* Thêm max-w để tránh giãn quá mức trên màn hình siêu rộng */}
        
        {/* Header Section */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="pl-0 hover:pl-2 transition-all">
              <Link href="/creator-dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Link>
            </Button>
            <h1 className="text-3xl font-bold mt-2 flex items-center gap-3 flex-wrap">
                {basket.basketName} 
                <span className="text-lg font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-mono">
                    {basket.symbol}
                </span>
            </h1>
            <p className="text-muted-foreground mt-1">{basket.description}</p>
          </div>

          <div className="flex items-center gap-4 bg-card p-3 rounded-xl border border-border shadow-sm">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                basket.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
            }`}>
              {basket.status === 'active' ? 'Active' : 'Paused'}
            </span>
            <div className="text-right border-l border-border pl-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">NAV</div>
              <div className="text-2xl font-bold text-primary">{(basket.totalTVL / 1000).toFixed(0)}K</div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-6 mb-8 border-b border-border overflow-x-auto no-scrollbar">
          {['overview','composition','operations','edit','invest'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t as any)}
              className={`pb-3 px-1 font-medium transition-all relative whitespace-nowrap ${
                  activeTab === t 
                    ? 'text-primary after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-primary after:rounded-t-full' 
                    : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          
          {/* Main Content Area (Chiếm 8/12 cột) */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* --- TAB: OVERVIEW --- */}
            {activeTab === 'overview' && (
              <>
                {/* 1. CHART SECTION */}
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    {/* Bọc chart trong div có height cố định nếu cần thiết, nhưng AdvancedMarketChart đã có height nội tại */}
                     <AdvancedMarketChart 
                        basketSymbol={basket.symbol} 
                        composition={basket.composition || []} // Fix lỗi map undefined
                    />
                </div>

                {/* 2. Key Metrics */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="p-5 flex flex-col justify-between hover:border-primary/50 transition-colors">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total TVL</p>
                    <p className="text-2xl font-bold mt-2">{(basket.totalTVL / 1000).toFixed(0)}K <span className="text-sm font-normal text-muted-foreground">ADA</span></p>
                  </Card>
                  <Card className="p-5 flex flex-col justify-between hover:border-primary/50 transition-colors">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Investors</p>
                    <p className="text-2xl font-bold mt-2">{basket.totalInvestors}</p>
                  </Card>
                  <Card className="p-5 flex flex-col justify-between hover:border-primary/50 transition-colors">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Performance (30d)</p>
                    <p className="text-2xl font-bold mt-2 text-green-500">+{basket.performance}%</p>
                  </Card>
                </div>

                {/* 3. Recent Rebalance */}
                <Card className="p-6">
                  <h3 className="font-semibold mb-4 text-lg">Rebalance History</h3>
                  <div className="space-y-0">
                    {(basket.recentRebalances || []).map((rb: any, idx: number) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-border last:border-0 hover:bg-muted/30 -mx-6 px-6 transition-colors">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{rb.action}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                             <span>{rb.date}</span>
                             <span>•</span>
                             <span>{rb.result}</span>
                          </div>
                        </div>
                        {rb.deviation !== '-' && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-600 font-mono font-bold w-fit">
                            Drift: {rb.deviation}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {/* --- TAB: COMPOSITION --- */}
            {activeTab === 'composition' && (
              <Card className="p-6">
                <h3 className="font-semibold mb-6 text-lg">Portfolio Composition</h3>
                {/* FIX LAYOUT: Grid responsive, stack dọc trên mobile, ngang trên desktop */}
                <div className="grid gap-8 md:grid-cols-2">
                  {/* Cột trái: Chart Donut */}
                  <div className="h-[300px] w-full flex items-center justify-center"> 
                    {/* Container cố định height để Recharts không bị vỡ */}
                    <AllocationDonutChart />
                  </div>
                  
                  {/* Cột phải: List Token */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">Asset Breakdown</h4>
                    {(basket.composition || []).map((c: any) => (
                      <div key={c.asset} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary border border-primary/20">
                              {c.asset[0]}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{c.asset}</p>
                            <p className="text-xs text-muted-foreground">Oracle Price: ${c.price.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-bold text-primary">{c.weight}%</div>
                            <div className="text-xs text-muted-foreground">Target Allocation</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-8 pt-8 border-t border-border">
                    <h3 className="font-semibold mb-4 text-lg">Performance Correlation</h3>
                    <div className="h-[300px] w-full">
                        <CorrelationChart />
                    </div>
                </div>
              </Card>
            )}

            {/* --- TAB: OPERATIONS --- */}
            {activeTab === 'operations' && (
              <>
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Hydra Efficiency & Logs</h3>
                  <div className="h-[350px] w-full">
                     <HydraEfficiencyChart data={hydraData} title="Hydra Execution (simulated)" />
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Recent Operations</h3>
                  <div className="space-y-2">
                    {(basket.recentOps || []).concat(basket.lastRebalance ? [{ id: 'r1', type: 'rebalance', date: basket.lastRebalance }] : []).map((op: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:shadow-sm transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <div>
                                <p className="font-medium capitalize text-sm">{op.type || 'rebalance'}</p>
                                <p className="text-xs text-muted-foreground">{op.date}</p>
                            </div>
                        </div>
                        <div className="text-xs font-medium px-2.5 py-1 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">
                            Success
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {/* --- TAB: EDIT --- */}
            {activeTab === 'edit' && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6 border-b border-border pb-6">
                  <div>
                      <h3 className="text-lg font-semibold">Edit Basket Details</h3>
                      <p className="text-sm text-muted-foreground">Update your basket configuration</p>
                  </div>
                  <div className="flex gap-2">
                    {isEditMode ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setIsEditMode(false)}><X className="w-4 h-4 mr-2" /> Cancel</Button>
                        <Button size="sm" onClick={handleSaveChanges}><Save className="w-4 h-4 mr-2" /> Save Changes</Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)}><Edit2 className="w-4 h-4 mr-2" /> Edit Mode</Button>
                    )}
                  </div>
                </div>

                <div className="space-y-6 max-w-2xl">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Basket Name</label>
                    <Input value={editData.name} onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))} disabled={!isEditMode} />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Description</label>
                    <textarea 
                        value={editData.description} 
                        onChange={(e) => setEditData((p) => ({ ...p, description: e.target.value }))} 
                        disabled={!isEditMode} 
                        className="w-full p-3 rounded-md bg-background border border-input min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" 
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Underlying Assets</label>
                      {isEditMode && <Button size="sm" variant="ghost" onClick={handleAddAsset} className="h-8 hover:bg-muted"><Plus className="w-3 h-3 mr-1" /> Add Asset</Button>}
                    </div>

                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                      {(editData.assets || []).map((a, i) => (
                        <div key={i} className="flex gap-3">
                          <Input value={a} onChange={(e) => handleAssetChange(i, e.target.value)} disabled={!isEditMode} placeholder="Token Symbol (e.g., AGIX)" className="bg-background" />
                          {isEditMode && (
                              <Button size="icon" variant="destructive" onClick={() => handleRemoveAsset(i)}>
                                  <Trash2 className="w-4 h-4" />
                              </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* --- TAB: INVEST --- */}
            {activeTab === 'invest' && (
              <Card className="p-6">
                <h3 className="font-semibold mb-6 text-lg">Your Position</h3>
                <div className="space-y-8">
                  {investment && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 bg-muted/30 rounded-lg border border-border text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Shares</p>
                        <p className="text-xl font-bold">{investment.shares.toFixed(2)}</p>
                      </div>
                      <div className="p-4 bg-muted/30 rounded-lg border border-border text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Invested Value</p>
                        <p className="text-xl font-bold">{investment.amount} ₳</p>
                      </div>
                      <div className="p-4 bg-muted/30 rounded-lg border border-border text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Unrealized P&L</p>
                        <p className="text-xl font-bold text-green-500">+{investment.pnl} ₳</p>
                      </div>
                    </div>
                  )}

                  <div className="p-6 border border-dashed border-border rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Amount to Invest (ADA)</label>
                        <span className="text-xs text-muted-foreground">Balance: 5,420 ADA</span>
                    </div>
                    <div className="flex gap-3">
                        <Input type="number" placeholder="Min 100 ADA" className="text-lg h-12" />
                        <Button className="px-8 font-bold h-12 text-base">Mint Shares</Button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Smart Contract will automatically split your ADA to buy underlying tokens via Hydra aggregator.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar (Sticky - Chiếm 4/12 cột) */}
          <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-6 h-fit">
            <Card className="p-5 shadow-sm">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Quick Actions</h4>
              <div className="flex flex-col gap-3">
                <Button className="w-full justify-start h-10" variant="secondary">
                    <RefreshCw className="w-4 h-4 mr-2 text-primary" /> Run Manual Rebalance
                </Button>
                <Button variant="outline" className="w-full justify-start h-10">
                    Pause/Resume Basket
                </Button>
                <Button variant="ghost" className="w-full justify-start h-10 hover:bg-muted">
                    Export Report (CSV)
                </Button>
              </div>
            </Card>

            <Card className="p-5 shadow-sm">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Current Allocation</h4>
              {/* FIX LAYOUT: Cố định chiều cao cho container chart ở sidebar */}
              <div className="h-[330px] w-full flex items-center justify-center">
                 <AllocationDonutChart />
              </div>
            </Card>

            <Card className="p-5 shadow-sm">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">On-chain Info</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Validator</span> 
                    <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs cursor-pointer hover:bg-muted/80">addr1q...8x9z</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Policy ID</span> 
                    <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs cursor-pointer hover:bg-muted/80">a029...c812</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-muted-foreground">Last Rebalance</span> 
                    <span className="font-medium">{basket.lastRebalance}</span>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}