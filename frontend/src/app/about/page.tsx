"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Zap,
  Shield,
  Layers,
  BarChart3,
  Globe,
  Code2,
  Github,
  ExternalLink,
  Cpu,
  Lock,
  TrendingUp,
  Users,
  Box,
  Workflow,
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   Product Overview — SolverNet DEX
   ══════════════════════════════════════════════════════ */

const FEATURES = [
  {
    icon: Zap,
    title: "Intent-Based Trading",
    description:
      "Users submit trade intents instead of interacting directly with AMM pools. Solvers aggregate, cross-match, and settle trades optimally — reducing price impact and improving execution.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: Workflow,
    title: "Solver Architecture",
    description:
      "Off-chain solver bots collect intents, run a NettingEngine to cross-match opposing trades, then use RouteOptimizer and BatchBuilder to create optimal on-chain settlement transactions.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: Shield,
    title: "MEV Protection",
    description:
      "By batching intents and netting opposing trades off-chain before settlement, users are shielded from front-running and sandwich attacks common in traditional DEX architectures.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Lock,
    title: "Plutus V3 Smart Contracts",
    description:
      "7 on-chain validators written in Aiken: Escrow, Pool, Order, Factory, Settings, LP Token Policy, and Pool NFT Policy — all auditable and deployed on Cardano Preprod Testnet.",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    icon: Layers,
    title: "Clean Architecture (DDD)",
    description:
      "Backend follows domain-driven hexagonal architecture with clear separation: Domain → Application → Infrastructure → Interface. Fully typed TypeScript with Prisma ORM and PostgreSQL.",
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
  {
    icon: TrendingUp,
    title: "Real-Time Trading UI",
    description:
      "Full-featured Next.js 16 frontend with candlestick charts, order book, portfolio management, liquidity provision, analytics dashboard, and admin panel — all connected via WebSocket for live updates.",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
];

const TECH_STACK = [
  { category: "Smart Contracts", items: ["Aiken", "Plutus V3", "CIP-68", "eUTXO"] },
  { category: "Backend", items: ["TypeScript", "Express", "Prisma", "PostgreSQL", "WebSocket"] },
  { category: "Frontend", items: ["Next.js 16", "React", "TailwindCSS", "ShadCN UI"] },
  { category: "Infrastructure", items: ["Blockfrost", "Docker", "Vercel", "Render", "Supabase"] },
];

const STATS = [
  { label: "Smart Contracts", value: "7", icon: Code2 },
  { label: "API Endpoints", value: "25+", icon: Globe },
  { label: "Architecture", value: "DDD", icon: Box },
  { label: "Network", value: "Preprod", icon: Cpu },
];

export default function AboutPage() {
  return (
    <div className="shell py-8 max-w-6xl mx-auto space-y-12">
      {/* ══════ Hero ══════ */}
      <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-primary/10 p-8 sm:p-12">
        <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative space-y-6 max-w-3xl">
          <Badge variant="outline" className="text-xs font-normal">
            <Zap className="h-3 w-3 mr-1" /> Live on Cardano Preprod Testnet
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            SolverNet DEX
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            An intent-based decentralized exchange built on Cardano with Plutus V3 smart contracts and solver architecture for optimal trade execution.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/">
                <ArrowRight className="h-4 w-4 mr-2" />
                Start Trading
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="https://github.com/TienTung2501/TDexMs" target="_blank" rel="noreferrer">
                <Github className="h-4 w-4 mr-2" />
                View Source
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ══════ Stats ══════ */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map((s) => (
          <Card key={s.label} className="border-border/50 bg-card/50 backdrop-blur text-center">
            <CardContent className="pt-5 pb-4 space-y-2">
              <s.icon className="h-5 w-5 text-primary mx-auto" />
              <p className="text-2xl font-extrabold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* ══════ How It Works ══════ */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">How It Works</h2>
          <p className="text-muted-foreground">
            SolverNet DEX replaces the traditional &ldquo;user vs pool&rdquo; model with an intent-based pipeline.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: "01",
              title: "Submit Intent",
              desc: "Users express trade intents — \"swap X of Token A for at least Y of Token B\". Each intent is locked on-chain in an escrow UTxO.",
            },
            {
              step: "02",
              title: "Solve & Net",
              desc: "Off-chain solvers collect intents, cross-match opposing trades via NettingEngine, and compute optimal routes through the AMM pool for any residual.",
            },
            {
              step: "03",
              title: "Batch Settle",
              desc: "BatchBuilder constructs an optimized transaction consuming multiple escrow UTxOs, interacting with the pool, and delivering outputs to all users atomically.",
            },
          ].map((item) => (
            <Card key={item.step} className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-primary/30">{item.step}</span>
                  <h3 className="font-bold">{item.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* ══════ Features ══════ */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Key Features</h2>
          <p className="text-muted-foreground">
            Designed for performance, security, and developer experience.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="border-border/50 bg-card/50 backdrop-blur group hover:border-primary/20 transition-colors">
              <CardContent className="pt-5 pb-5 space-y-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${f.bg}`}>
                  <f.icon className={`h-5 w-5 ${f.color}`} />
                </div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* ══════ Tech Stack ══════ */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Tech Stack</h2>
          <p className="text-muted-foreground">
            Modern, production-ready technology choices across the full stack.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TECH_STACK.map((cat) => (
            <Card key={cat.category} className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-4">
                <h3 className="font-semibold text-sm mb-3">{cat.category}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.map((item) => (
                    <Badge key={item} variant="secondary" className="text-xs font-normal">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* ══════ Architecture Overview ══════ */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Architecture</h2>
          <p className="text-muted-foreground">
            Clean Architecture with full separation of concerns.
          </p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
          <CardContent className="pt-6 pb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Backend layers */}
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> Backend (Hexagonal DDD)
                </h3>
                <div className="space-y-2">
                  {[
                    { layer: "Domain", desc: "Entities, Value Objects, Ports (interfaces)" },
                    { layer: "Application", desc: "Use Cases, Services" },
                    { layer: "Infrastructure", desc: "DB (Prisma), Chain (Blockfrost), Cache, Cron" },
                    { layer: "Interface", desc: "HTTP Routes (REST), WebSocket handlers" },
                    { layer: "Solver", desc: "IntentCollector → NettingEngine → RouteOptimizer → BatchBuilder → TxSubmitter" },
                  ].map((l) => (
                    <div key={l.layer} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="text-xs font-mono shrink-0 mt-0.5">{l.layer}</Badge>
                      <span className="text-muted-foreground">{l.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Smart Contracts */}
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" /> Smart Contracts (Aiken / Plutus V3)
                </h3>
                <div className="space-y-2">
                  {[
                    { name: "Escrow Validator", desc: "Holds user funds until settlement or cancellation" },
                    { name: "Pool Validator", desc: "Constant-product AMM (x·y=k) logic" },
                    { name: "Order Validator", desc: "On-chain limit orders" },
                    { name: "Factory Validator", desc: "Pool creation and registry" },
                    { name: "Settings Validator", desc: "Protocol configuration management" },
                    { name: "LP & Pool NFT", desc: "Minting policies for LP tokens and pool identity NFTs" },
                  ].map((c) => (
                    <div key={c.name} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="text-xs font-mono shrink-0 mt-0.5">{c.name}</Badge>
                      <span className="text-muted-foreground">{c.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* ══════ Links ══════ */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Links & Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <a
            href="https://tdexms.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border/50 p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Live Frontend</p>
              <p className="text-xs text-muted-foreground">tdexms.vercel.app</p>
            </div>
            <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>

          <a
            href="https://tdexms.onrender.com/v1/health"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border/50 p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Backend API</p>
              <p className="text-xs text-muted-foreground">tdexms.onrender.com</p>
            </div>
            <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>

          <a
            href="https://docs.tdexms.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border/50 p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Documentation</p>
              <p className="text-xs text-muted-foreground">docs.tdexms.vercel.app</p>
            </div>
            <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>

          <a
            href="https://github.com/TienTung2501/TDexMs"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border/50 p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-foreground border border-border">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Source Code</p>
              <p className="text-xs text-muted-foreground">TienTung2501/TDexMs</p>
            </div>
            <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>
        </div>
      </section>

      {/* ══════ CTA ══════ */}
      <section className="rounded-2xl border border-border/50 bg-gradient-to-r from-primary/5 to-primary/10 p-8 text-center space-y-4">
        <Users className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-xl font-bold">Built by Nguyen Tien Tung</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Fullstack &amp; Blockchain Developer — 3+ years on Cardano, Project Catalyst Grantee (Fund 10, 11, 12, 14).
          This is a solo project built from scratch to demonstrate end-to-end capabilities.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/cv">View CV</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="mailto:tientung03.nttvn@gmail.com">Contact Me</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
