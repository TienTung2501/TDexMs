'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useWallet } from '@/contexts/wallet'
import { TrendingUp, Users, Zap, ArrowUpRight, Plus, Settings } from 'lucide-react'

export default function CreatorDashboard() {
  const router = useRouter()
  const { isConnected, isCreator, createdBaskets, walletAddress } = useWallet()

  useEffect(() => {
    if (!isConnected || !isCreator) {
      router.push('/')
    }
  }, [isConnected, isCreator, router])

  if (!isConnected || !isCreator) {
    return null
  }

  const totalTVL = createdBaskets.reduce((sum, basket) => sum + basket.totalTVL, 0)
  const totalInvestors = createdBaskets.reduce((sum, basket) => sum + basket.totalInvestors, 0)
  const totalFeesEarned = createdBaskets.reduce((sum, basket) => sum + basket.feesEarned, 0)
  const avgPerformance =
    createdBaskets.length > 0
      ? (createdBaskets.reduce((sum, basket) => sum + basket.performance, 0) / createdBaskets.length).toFixed(2)
      : '0'

  const displayAddress = walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 6)}` : ''

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          {/* Header Section */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold mb-2">Creator Dashboard</h1>
                <p className="text-muted-foreground">Manage and monitor your ETF baskets</p>
              </div>
              <Button asChild className="gap-2 text-white">
                <Link href="/create">
                  <Plus className="w-4 h-4" />
                  Create New Basket
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total TVL</p>
                  <p className="text-2xl font-bold">${(totalTVL / 1000).toFixed(0)}K</p>
                  <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +12.5% this month
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Investors</p>
                  <p className="text-2xl font-bold">{totalInvestors.toLocaleString()}</p>
                  <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +240 this week
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-secondary" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Avg Performance</p>
                  <p className="text-2xl font-bold">{avgPerformance}%</p>
                  <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    Outperforming
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Fees Earned</p>
                  <p className="text-2xl font-bold">${(totalFeesEarned / 1000).toFixed(1)}K</p>
                  <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +15% YoY
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </Card>
          </div>

          {/* Baskets Section */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Your Baskets</h2>
            {createdBaskets.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground mb-4">You haven't created any baskets yet</p>
                <Button asChild >
                  <Link href="/create" className='text-white'>Create Your First Basket</Link>
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {createdBaskets.map((basket) => (
                  <Card key={basket.basketId} className="p-6 hover:border-primary transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1">{basket.basketName}</h3>
                        <p className="text-sm text-muted-foreground">{basket.description}</p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          basket.status === 'active'
                            ? 'bg-green-500/10 text-green-400'
                            : basket.status === 'paused'
                              ? 'bg-yellow-500/10 text-yellow-400'
                              : 'bg-gray-500/10 text-gray-400'
                        }`}
                      >
                        {basket.status === 'active'
                          ? 'Active'
                          : basket.status === 'paused'
                            ? 'Paused'
                            : 'Retired'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-border">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">TVL</p>
                        <p className="text-lg font-bold">${(basket.totalTVL / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Performance</p>
                        <p className="text-lg font-bold text-green-400">+{basket.performance}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Investors</p>
                        <p className="text-lg font-bold">{basket.totalInvestors}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Fees Earned</p>
                        <p className="text-lg font-bold">${(basket.feesEarned / 1000).toFixed(1)}K</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground mb-2">Assets</p>
                      <div className="flex gap-2 flex-wrap">
                        {basket.assets.map((asset) => (
                          <span key={asset} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">
                            {asset}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground mb-4">
                      <p>Last Rebalance: {basket.lastRebalance}</p>
                      <p>Total Rebalances: {basket.rebalanceCount}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button asChild className="flex-1 text-white" size="sm">
                        <Link href={`/creator-basket/${basket.basketId}`}>View</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <Link href={`/creator-basket/${basket.basketId}?tab=edit`}>
                          <Settings className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
      </div>
    </div>
  )
}
