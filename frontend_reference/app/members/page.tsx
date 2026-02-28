import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Sparkles, Compass, Globe, Shield } from 'lucide-react'

const teamMembers = [
  {
    name: 'Mai Nguyen',
    role: 'Protocol Lead',
    focus: 'Product + Governance',
    bio: 'Former Catalyst proposer and core contributor at several L2 research collectives.',
    timezone: 'GMT+7',
    avatar: 'MN',
  },
  {
    name: 'Darius Lee',
    role: 'Quant Engineering',
    focus: 'Index design + risk',
    bio: 'Built structured products at TradFi desks before moving on-chain full time.',
    timezone: 'GMT+8',
    avatar: 'DL',
  },
  {
    name: 'Ivy Tran',
    role: 'Design Systems',
    focus: 'UX + contributor ops',
    bio: 'Leads our contributor program and keeps the Basket.Finance brand coherent.',
    timezone: 'GMT+7',
    avatar: 'IT',
  },
  {
    name: 'Rafael Costa',
    role: 'Smart Contracts',
    focus: 'Audits + automation',
    bio: 'Wrote the rebalancing automation and keeps our scripts humming 24/7.',
    timezone: 'GMT-3',
    avatar: 'RC',
  },
]

const advisors = [
  {
    name: 'Linh Vu',
    specialty: 'Risk Committee',
    note: 'Ex-JPM risk officer, advises on ETF guardrails.',
  },
  {
    name: 'Thomas Meyer',
    specialty: 'Liquidity',
    note: 'Runs a Cardano market-making desk ensuring basket depth.',
  },
  {
    name: 'Yuki Aoki',
    specialty: 'Operations',
    note: 'Helps coordinate cross-timezone contributor pods.',
  },
]

const culturePillars = [
  {
    icon: Sparkles,
    title: 'Composability first',
    description: 'Everything we deploy is audited, documented, and meant to plug into the broader Cardano stack.',
  },
  {
    icon: Globe,
    title: 'Global operator',
    description: 'Contributors span 7 time zones so investors always reach a live steward.',
  },
  {
    icon: Shield,
    title: 'Risk obsessed',
    description: 'We maintain dual review on basket changes and rehearse incident playbooks quarterly.',
  },
]

export default function MembersPage() {
  return (

      <main className="bg-background">
        <section className="border-b border-border/60 bg-card/60 px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
              <div>
                <Badge variant="outline" className="mb-4 rounded-full border-primary/40 text-primary">
                  Team & Contributors
                </Badge>
                <h1 className="text-4xl font-bold leading-tight tracking-tight text-balance">
                  A distributed team building institutional ETF rails for Cardano
                </h1>
                <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
                  Basket.Finance blends protocol engineers, index researchers, and governance stewards. Meet the crew keeping the rails balanced and investors informed.
                </p>
              </div>
              <Card className="bg-background/60 border-border/60 p-6 shadow-[0_30px_70px_rgba(15,23,42,0.14)]">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Contributors</p>
                    <p className="text-3xl font-semibold">18 core · 42 extended</p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-foreground/60">Regions</p>
                    <p className="text-lg font-semibold text-foreground">APAC + EU + LATAM</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-foreground/60">Coverage</p>
                    <p className="text-lg font-semibold text-foreground">24/7 operations</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell space-y-10">
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-semibold">Core Team</h2>
              <p className="text-muted-foreground max-w-2xl">
                Small, autonomous pods own the end-to-end lifecycle: research → automation → monitoring.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {teamMembers.map((member) => (
                <Card key={member.name} className="h-full border-border/60 bg-card/90">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-lg font-semibold text-primary">
                      {member.avatar}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{member.name}</p>
                      <p className="text-sm text-muted-foreground">{member.role}</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto rounded-full">
                      {member.timezone}
                    </Badge>
                  </div>
                  <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                    <p className="text-foreground">Focus · {member.focus}</p>
                    <p>{member.bio}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/40 px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell grid gap-8 md:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="text-3xl font-semibold mb-3">Contributor Pillars</h2>
              <p className="text-muted-foreground mb-8">
                The same standards that govern our basket design now guide how we collaborate with operators and analysts.
              </p>
              <div className="space-y-5">
                {culturePillars.map((pillar) => {
                  const Icon = pillar.icon
                  return (
                    <div key={pillar.title} className="flex gap-4 rounded-2xl border border-border/60 bg-background/80 p-5">
                      <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold">{pillar.title}</p>
                        <p className="text-sm text-muted-foreground">{pillar.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <Card className="bg-background/70 border-border/50">
              <div className="flex items-center gap-3 mb-6">
                <Compass className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">Advisory loop</p>
              </div>
              <div className="space-y-4">
                {advisors.map((advisor) => (
                  <div key={advisor.name} className="rounded-2xl border border-border/50 bg-muted/10 p-4">
                    <p className="font-semibold">{advisor.name}</p>
                    <p className="text-sm text-primary">{advisor.specialty}</p>
                    <p className="text-sm text-muted-foreground mt-1">{advisor.note}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="shell grid gap-8 lg:grid-cols-2">
            <Card className="border-border/60 bg-primary/5">
              <p className="text-sm uppercase tracking-[0.25em] text-primary">Contributor Onboarding</p>
              <h3 className="mt-4 text-2xl font-semibold">Join an index pod</h3>
              <p className="mt-2 text-muted-foreground">
                New contributors shadow an existing pod for two rebalance cycles before proposing independent models. Reach out via Discord for the latest bounty briefs.
              </p>
            </Card>
            <Card className="border-border/60 bg-background/80">
              <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Community Calls</p>
              <h3 className="mt-4 text-2xl font-semibold">Thursdays · 13:00 UTC</h3>
              <p className="mt-2 text-muted-foreground">
                We host live sessions covering roadmap, audit updates, and governance votes. Notes post in #announcements for async review.
              </p>
            </Card>
          </div>
        </section>
      </main>
  )
}
