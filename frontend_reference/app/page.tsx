import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowRight, Shield, Zap, Lock } from "lucide-react"

export default function Home() {
  const stats = [
    { label: "Total Value Locked", value: "2.5M ADA" },
    { label: "Active Baskets", value: "24" },
    { label: "Protocol Fee", value: "0.5%" },
  ]

  const baskets = [
    {
      id: 1,
      name: "bAI Index",
      description: "Top AI tokens basket",
      roi: "+12.5%",
      assets: ["AGIX", "IAG", "DJED"],
      tvl: "450K ADA",
    },
    {
      id: 2,
      name: "bGameFi",
      description: "Gaming & metaverse tokens",
      roi: "+8.3%",
      assets: ["INDY", "PLANET", "MELD"],
      tvl: "320K ADA",
    },
    {
      id: 3,
      name: "bDeFi Stable",
      description: "DeFi protocol tokens",
      roi: "+5.1%",
      assets: ["DJED", "MELD", "MINSWAP"],
      tvl: "580K ADA",
    },
  ]

  const features = [
    {
      icon: Shield,
      title: "Security First",
      description: "Audited contracts and comprehensive risk management",
    },
    {
      icon: Zap,
      title: "Fully Automated",
      description: "Rebalancing happens 24/7 without manual intervention",
    },
    {
      icon: Lock,
      title: "Open Source",
      description: "Transparent, verifiable on-chain, community auditable",
    },
  ]

  return (
    <div className="bg-background">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(22,199,132,0.18),_transparent_55%)]" />
            <div className="absolute inset-y-0 left-1/2 w-[60vw] -translate-x-1/2 bg-[radial-gradient(circle,_rgba(14,165,233,0.12),_transparent_60%)] blur-3xl" />
          </div>
          <div className="shell">
            <div className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Institutional ETF rails · Cardano
              </span>
              <h1 className="mt-6 text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
                ETF Factory for{" "}
                <span className="bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Cardano
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
                Create, invest, and manage decentralized ETF baskets on-chain. Fully automated rebalancing, transparent fees, and institutional-grade infrastructure.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/explore">
                    Explore Baskets <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/create">Create Basket</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="border-t border-border/60 bg-card/70 px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {stats.map((stat, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border/60 bg-background/80 p-6 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
                >
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-primary">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="shell">
            <h2 className="text-3xl font-bold text-center mb-12">Why Basket.Finance?</h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {features.map((feature, idx) => {
                const Icon = feature.icon
                return (
                  <Card
                    key={idx}
                    className="border-border/60 bg-card/90 p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/60 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* Featured Baskets Section */}
        <section className="border-t border-border bg-card/50 px-4 py-20 sm:px-6 lg:px-8">
          <div className="shell">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-3xl font-bold">Featured Baskets</h2>
              <Button asChild variant="soft" className="gap-2">
                <Link href="/explore">
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {baskets.map((basket) => (
                <Card
                  key={basket.id}
                  className="border-border/50 bg-background/90 p-6 shadow-[0_25px_55px_rgba(15,23,42,0.12)] hover:border-primary/60 hover:bg-primary/5"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{basket.name}</h3>
                      <p className="text-sm text-muted-foreground">{basket.description}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      {basket.roi}
                    </span>
                  </div>
                  <div className="mb-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Assets</p>
                    <div className="flex flex-wrap gap-2">
                      {basket.assets.map((asset) => (
                        <span
                          key={asset}
                          className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                        >
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-4">
                    <p className="text-xs text-muted-foreground">TVL: {basket.tvl}</p>
                    <Button asChild variant="soft" size="sm">
                      <Link href={`/basket/${basket.id}`}>View</Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="shell">
            <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Choose Assets",
                  description: "Select from our curated list of verified, oracle-backed tokens",
                },
                {
                  step: "2",
                  title: "Invest & Mint",
                  description: "Deposit ADA to mint ETF tokens with your desired allocation",
                },
                {
                  step: "3",
                  title: "Auto Rebalance",
                  description: "Our bot automatically rebalances your basket 24/7 to maintain target weights",
                },
              ].map((item, idx) => (
                <div key={idx} className="relative">
                  <div className="flex gap-4 rounded-2xl border border-border/60 bg-card/90 p-6 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
                    <div className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="mb-2 font-semibold">{item.title}</h3>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  {idx < 2 && (
                    <div className="pointer-events-none hidden md:block absolute top-1/2 left-20 h-px w-[calc(100%-80px)] bg-gradient-to-r from-primary/30 via-primary/5 to-transparent" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border/60 bg-gradient-to-r from-background via-primary/10 to-background px-4 py-20 sm:px-6 lg:px-8">
          <div className="shell text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join the Basket.Finance community and start building your first ETF basket today.
            </p>
            <Button asChild size="lg" className="gap-2">
              <Link href="/explore">
                Get Started <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
  )
}
