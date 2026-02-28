// ...existing code...
"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search, Users } from "lucide-react"

export default function ExplorePage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState<"tvl" | "roi" | "date">("tvl")

  const categories = ["AI", "DeFi", "GameFi", "NFT", "Infrastructure"]

  const allBaskets = [
    // ...existing mock data...
    {
      id: 1,
      name: "bAI Index",
      symbol: "bAI",
      description: "Top AI tokens basket",
      roi: "+12.5%",
      roi30d: "+8.2%",
      tvl: 450000,
      holders: 234,
      assets: ["AGIX", "IAG", "DJED"],
      category: "AI",
      createdAt: "2025-01-15",
    },
    {
      id: 2,
      name: "bGameFi",
      symbol: "bGF",
      description: "Gaming & metaverse tokens",
      roi: "+8.3%",
      roi30d: "+5.1%",
      tvl: 320000,
      holders: 156,
      assets: ["INDY", "PLANET", "MELD"],
      category: "GameFi",
      createdAt: "2025-01-10",
    },
    {
      id: 3,
      name: "bDeFi Stable",
      symbol: "bDFS",
      description: "DeFi protocol tokens",
      roi: "+5.1%",
      roi30d: "+3.8%",
      tvl: 580000,
      holders: 312,
      assets: ["DJED", "MELD", "MINSWAP"],
      category: "DeFi",
      createdAt: "2025-01-05",
    },
    {
      id: 4,
      name: "bNFT Index",
      symbol: "bNFT",
      description: "NFT ecosystem tokens",
      roi: "+6.7%",
      roi30d: "+4.2%",
      tvl: 210000,
      holders: 89,
      assets: ["SPACEBUDZ", "CLAY", "NMKR"],
      category: "NFT",
      createdAt: "2025-01-08",
    },
    {
      id: 5,
      name: "bInfra",
      symbol: "bINFRA",
      description: "Cardano infrastructure tokens",
      roi: "+4.2%",
      roi30d: "+2.5%",
      tvl: 750000,
      holders: 456,
      assets: ["MINSWAP", "EUTXO", "JPG"],
      category: "Infrastructure",
      createdAt: "2025-01-03",
    },
    {
      id: 6,
      name: "bAI+ Advanced",
      symbol: "bAI+",
      description: "Advanced AI strategy basket",
      roi: "+15.8%",
      roi30d: "+10.3%",
      tvl: 320000,
      holders: 123,
      assets: ["AGIX", "IAG", "INDY"],
      category: "AI",
      createdAt: "2025-01-12",
    },
  ]

  const filtered = allBaskets
    .filter((b) => !selectedCategory || b.category === selectedCategory)
    .filter(
      (b) =>
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.symbol.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "tvl") return b.tvl - a.tvl
      if (sortBy === "roi") return Number.parseFloat(b.roi) - Number.parseFloat(a.roi)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  const totalTVL = allBaskets.reduce((sum, basket) => sum + basket.tvl, 0)
  const totalInvestors = allBaskets.reduce((sum, basket) => sum + basket.holders, 0)
  const avgRoi = (allBaskets.reduce((sum, basket) => sum + Number.parseFloat(basket.roi), 0) / allBaskets.length).toFixed(1)
  const avgRoi30d = (allBaskets.reduce((sum, basket) => sum + Number.parseFloat(basket.roi30d), 0) / allBaskets.length).toFixed(1)

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border bg-card/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="shell">
          <h1 className="text-3xl font-bold mb-2">Explore Baskets</h1>
          <p className="text-muted-foreground">Discover and invest in curated ETF baskets</p>
        </div>
      </section>

      {/* Filters & Search (restructured) */}
      <section className="border-b border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="shell grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* Left: search + sort + categories */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  placeholder="Search by name or symbol..."
                  className="h-11 rounded-lg border-border/70 bg-background/80 pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="mt-3 sm:mt-0 flex gap-2">
                {(["tvl", "roi", "date"] as const).map((opt) => {
                  const isActive = sortBy === opt
                  return (
                    <button
                      key={opt}
                      onClick={() => setSortBy(opt)}
                      className={`px-3 py-2 rounded-full text-sm font-medium transition ${
                        isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent border border-border/60 text-muted-foreground'
                      }`}
                    >
                      {opt === "tvl" ? "TVL" : opt === "roi" ? "ROI" : "Newest"}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold tracking-wide text-muted-foreground">Categories</p>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`text-sm ${selectedCategory === null ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                >
                  View All
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => {
                  const active = selectedCategory === cat
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(active ? null : cat)}
                      className={`px-3 py-1.5 rounded-full text-sm transition ${
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right: snapshot */}
          <div className="rounded-2xl border border-border/70 bg-background/80 p-5 shadow-[0_16px_32px_rgba(15,23,42,0.06)]">
            <p className="text-xs uppercase tracking-[0.2em] text-primary/80 mb-3">Snapshot</p>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total TVL</span>
                <span className="font-semibold">{(totalTVL / 1000).toFixed(0)}K ADA</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg ROI</span>
                <span className="font-semibold text-green-400">+{avgRoi}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg 30d</span>
                <span className="font-semibold text-emerald-300">+{avgRoi30d}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Investors</span>
                <span className="font-semibold">{totalInvestors.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Baskets Grid */}
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="shell">
          <div className="mb-6 text-sm text-muted-foreground">
            Showing {filtered.length} basket{filtered.length !== 1 ? "s" : ""}
          </div>
          {filtered.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((basket) => (
                <Link key={basket.id} href={`/basket/${basket.id}`}>
                  <Card className="p-6 hover:border-primary transition-colors group cursor-pointer h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                            {basket.name}
                          </h3>
                          <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">
                            {basket.symbol}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{basket.description}</p>
                      </div>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 flex-shrink-0 ml-2">
                        {basket.roi}
                      </span>
                    </div>

                    <div className="mb-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">24h Change</p>
                          <p className="text-sm font-semibold">{basket.roi}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">30d Change</p>
                          <p className="text-sm font-semibold">{basket.roi30d}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Assets</p>
                        <div className="flex gap-2 flex-wrap">
                          {basket.assets.map((asset) => (
                            <span key={asset} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">
                              {asset}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>TVL: {(basket.tvl / 1000).toFixed(0)}K ADA</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>{basket.holders} holders</span>
                        </div>
                      </div>

                      {/* View styled as badge (non-interactive) to avoid nested link elements */}
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary text-white">
                        View
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No baskets found matching your criteria.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("")
                  setSelectedCategory(null)
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
// ...existing code...