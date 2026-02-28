import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Workflow, Layers, ShieldCheck, Gauge, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const lifecycle = [
  {
    title: '1 · Basket design',
    description: 'Risk pod pairs oracles with index rules. Every basket references a transparent policy file stored on IPFS.',
    details: ['Constituent whitelist with collateral ratios', 'Deviation triggers for rebalance bots', 'Governance + fee parameters'],
  },
  {
    title: '2 · Mint & monitor',
    description: 'Investors deposit ADA, mint ETF tokens, and receive live NAV plus PnL telemetry in the dashboard.',
    details: ['Streaming NAV + weight drift cards', 'Circuit breakers tied to oracle heartbeat', 'Wallet UX that surfaces provider + role'],
  },
  {
    title: '3 · Automation + audits',
    description: 'Rebalance bots execute via managed scripts, producing signed proofs stored in the monitor page.',
    details: ['Crankless execution (no user gas)', 'Dual-sign review for parameter changes', 'Weekly audit diff exported to CSV'],
  },
]

const architecture = [
  {
    title: 'Oracles + Pricing',
    copy: 'TWAP-sourced price feeds plus redundancy from Indigo + Minswap pools. Each basket stores oracle provenance metadata.',
    metric: '6 feeds / basket',
  },
  {
    title: 'Automation Layer',
    copy: 'Managed bots execute rebalances via Hydra scripts. Operators receive PagerDuty-style alerts when variance > 2%.',
    metric: '24/7 coverage',
  },
  {
    title: 'Risk Controls',
    copy: 'NAV caps, redemption throttles, and staged parameter rollouts keep ETF baskets aligned with TradFi-grade guardrails.',
    metric: '0 incidents',
  },
]

const guarantees = [
  {
    icon: Layers,
    title: 'Transparent components',
    description: 'Contracts, off-chain scripts, and dashboards live in public repos with SPDX headers and semantic versioning.',
  },
  {
    icon: ShieldCheck,
    title: 'Defense-in-depth',
    description: 'Automated policies + human committees; both must agree before fee or allocation changes propagate to mainnet.',
  },
  {
    icon: Gauge,
    title: 'Performance telemetry',
    description: 'Realtime monitoring across NAV, oracle freshness, and bot execution with exports for regulators and DAO ops.',
  },
]

export default function OverviewPage() {
  return (
    
      <main className="bg-background">
        <section className="border-b border-border/60 bg-gradient-to-br from-background via-primary/5 to-background px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell grid gap-10 lg:grid-cols-[1.2fr_0.8fr] items-center">
            <div>
              <Badge variant="outline" className="mb-5 rounded-full border-primary/40 text-primary">
                System Overview
              </Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-balance">
                Institutional-grade ETF factory, explained.
              </h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
                Understand the rails powering Basket.Finance: composable contracts, automation bots, and a governance loop tuned for Cardano.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2 text-white">
                  <a href="/docs">
                    View Docs
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="soft"  size="lg">
                  <a href="/monitor">Live Monitor</a>
                </Button>
              </div>
            </div>
            <Card className="bg-background/70 border-border/60">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                  <Workflow className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Lifecycle</p>
                  <p className="text-3xl font-semibold">Design → Mint → Monitor</p>
                </div>
              </div>
              <Separator className="my-6" />
              <div className="grid gap-4 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-foreground/60">Runtime</p>
                  <p className="text-lg font-semibold text-foreground">Hydra scripts + bot playbooks</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-foreground/60">Audits</p>
                  <p className="text-lg font-semibold text-foreground">Quarterly external · weekly diff</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell space-y-10">
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-semibold">Architecture Snapshot</h2>
              <p className="text-muted-foreground max-w-2xl">
                Three independent subsystems coordinate basket health. Each subsystem exposes metrics inside Monitor → System Health.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {architecture.map((layer) => (
                <Card key={layer.title} className="h-full border-border/50 bg-card/90">
                  <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{layer.title}</p>
                  <p className="mt-3 text-lg font-semibold">{layer.metric}</p>
                  <p className="mt-4 text-sm text-muted-foreground">{layer.copy}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/40 px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell space-y-8">
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-semibold">Lifecycle in practice</h2>
              <p className="text-muted-foreground max-w-2xl">
                From proposal to automated rebalances—here is the human + bot loop that keeps ETFs aligned with mandate.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {lifecycle.map((stage) => (
                <Card key={stage.title} className="h-full border-border/50 bg-background/80">
                  <p className="text-sm font-semibold text-primary">{stage.title}</p>
                  <p className="mt-2 text-base text-muted-foreground">{stage.description}</p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {stage.details.map((detail) => (
                      <li key={detail} className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
                        {detail}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <h2 className="text-3xl font-semibold">Reliability guarantees</h2>
              <p className="text-muted-foreground max-w-2xl">
                Twice-weekly chaos drills, multi-sig automation, and transparent dashboards reduce operational risk.
              </p>
              <div className="space-y-4">
                {guarantees.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.title} className="flex gap-4 rounded-2xl border border-border/60 bg-card/80 p-5">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <Card className="border-border/60 bg-primary/5">
              <p className="text-sm uppercase tracking-[0.25em] text-primary">Need deeper access?</p>
              <h3 className="mt-4 text-2xl font-semibold text-primary">Request the infrastructure brief</h3>
              <p className="mt-2 text-muted-foreground">
                We share process docs, monitoring dashboards, and incident templates with institutional partners under NDA.
              </p>
              <Button variant="soft" className="mt-6">
                Email ops@basket.finance
              </Button>
            </Card>
          </div>
        </section>
      </main>
    
  )
}
