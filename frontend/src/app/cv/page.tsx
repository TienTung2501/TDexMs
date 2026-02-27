"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Github,
  Mail,
  Send,
  ExternalLink,
  GraduationCap,
  Briefcase,
  Award,
  Code2,
  Globe,
  ChevronRight,
  MapPin,
  Calendar,
  Trophy,
  Rocket,
  Box,
  Cpu,
  Database,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════
   IPFS Image URLs (from .env / Pinata gateway)
   ═══════════════════════════════════════════════ */
const IPFS = {
  top1_maintrack:
    process.env.top1_maintrack ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafybeic5bdkqau46qj7u27lwrcyykfjqfmqjbx5nc5g7sqifsrrv3yhawe?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  top5_student_01:
    process.env.top5_student_track_01 ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreigfg4fzprdfb3igs5vyuahizz32zjy63chmwq2c4q5kudm3i434je?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  top5_student_02:
    process.env.top5_student_track_02 ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreihhb5lfqzlsmwltys3ulwlpgldjgrm2uiwdbaijtd2wymlgadqkym?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  slide_totnghiep:
    process.env.slide_totnghie ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafybeicwo2quphiwkqmis37ajfeccgsutmizr75oyngxdbomgg3fyobehi?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  giai3_nckh_nam2:
    process.env.giai3_nckh_nam2 ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreieeb2i533hicnn343s5bw6yz2ckvzd3nzwda3xyz4nkvelc2s3vne?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  giai2_nckh_nam3:
    process.env.giai2_nckh_nam3 ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreid7q3j3u3mlgu4b4qhitmaqfd3a4idfogpirw7kpwj2by6zc3ml5a?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  anh_luu_niem_01:
    process.env.anh_luu_niem_nckh_nam_3_01 ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreibaldtcga5sl46bmhblzbkshrven6rkwsuz65e3coxx3pv7yrxsuq?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
  anh_luu_niem_02:
    process.env.anh_luu_niem_nckh_nam_3_02 ??
    "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreidfxyhtjkqgm5f2gdb5pksureb3wodalx4ageowofkw4rl53epblq?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
};

/* ═══════════════════════════════════════════════
   Data
   ═══════════════════════════════════════════════ */

const SKILLS = {
  blockchain: [
    "Cardano / Plutus V3",
    "Aiken Smart Contracts",
    "Lucid / Blaze",
    "Blockfrost / Ogmios / Kupo",
    "UTxO Model",
    "Solidity (basic)",
  ],
  backend: [
    "Node.js / Express / NestJS",
    "TypeScript",
    "Prisma ORM",
    "PostgreSQL / Supabase",
    "Redis / Upstash",
    "REST & WebSocket APIs",
  ],
  frontend: [
    "React / Next.js",
    "TailwindCSS",
    "ShadCN UI",
    "Zustand / TanStack Query",
    "Responsive Design",
    "Web3 Wallet Integration",
  ],
  devops: [
    "Docker / Docker Compose",
    "Vercel / Render",
    "GitHub Actions CI/CD",
    "Turborepo Monorepo",
    "pnpm Workspaces",
    "Linux / Shell",
  ],
};

const PROJECTS = [
  {
    title: "SolverNet DEX",
    subtitle: "Intent-Based Decentralized Exchange on Cardano",
    period: "2024 – Present",
    description:
      "A next-generation DEX that uses solver-based intent architecture instead of traditional AMM swaps. Users submit intents, solvers aggregate and net opposing trades, then settle optimally via batched on-chain transactions.",
    tech: ["Aiken", "Plutus V3", "TypeScript", "Next.js", "Express", "Prisma", "PostgreSQL"],
    highlights: [
      "Built 7 Plutus V3 validators (Escrow, Pool, Order, Factory, Settings, LP/NFT policies)",
      "Designed solver engine with NettingEngine, RouteOptimizer, BatchBuilder pipeline",
      "Full-stack: REST API, WebSocket real-time, Next.js 16 trading UI",
      "Clean Architecture (DDD) with domain-driven hexagonal backend",
    ],
    links: {
      github: "https://github.com/TienTung2501",
      live: "https://tdexms.vercel.app/",
      api: "https://tdexms.onrender.com",
    },
    funded: true,
  },
  {
    title: "Cardano Project Catalyst Grants",
    subtitle: "Funded proposals across multiple rounds",
    period: "Fund 10 – Fund 14",
    description:
      "Successfully proposed and received funding through Cardano's decentralized innovation platform Project Catalyst for multiple blockchain research and development projects.",
    tech: ["Cardano", "Catalyst", "Research", "Community"],
    highlights: [
      "Fund 10 — Blockchain research and community building",
      "Fund 11 — DeFi protocol development",
      "Fund 12 — Smart contract tooling",
      "Fund 14 — SolverNet DEX (current project)",
    ],
    funded: true,
  },
];

const ACHIEVEMENTS = [
  {
    title: "Top 1 – Main Track",
    event: "National Blockchain Hackathon / Competition",
    image: IPFS.top1_maintrack,
    type: "trophy" as const,
  },
  {
    title: "Top 5 – Student Track",
    event: "Blockchain Student Competition",
    image: IPFS.top5_student_01,
    type: "award" as const,
  },
  {
    title: "Top 5 – Student Track (Certificate)",
    event: "Blockchain Student Competition",
    image: IPFS.top5_student_02,
    type: "award" as const,
  },
  {
    title: "Giải 3 – NCKH Năm 2",
    event: "Nghiên cứu khoa học sinh viên cấp trường",
    image: IPFS.giai3_nckh_nam2,
    type: "award" as const,
  },
  {
    title: "Giải 2 – NCKH Năm 3",
    event: "Nghiên cứu khoa học sinh viên cấp trường",
    image: IPFS.giai2_nckh_nam3,
    type: "award" as const,
  },
  {
    title: "Ảnh lưu niệm NCKH",
    event: "Nghiên cứu khoa học năm 3",
    image: IPFS.anh_luu_niem_01,
    type: "photo" as const,
  },
  {
    title: "Ảnh lưu niệm NCKH (2)",
    event: "Nghiên cứu khoa học năm 3",
    image: IPFS.anh_luu_niem_02,
    type: "photo" as const,
  },
  {
    title: "Slide Tốt Nghiệp",
    event: "Đồ án tốt nghiệp",
    image: IPFS.slide_totnghiep,
    type: "education" as const,
  },
];

/* ═══════════════════════════════════════════════
   Components
   ═══════════════════════════════════════════════ */

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function SkillCategory({
  title,
  icon: Icon,
  skills,
}: {
  title: string;
  icon: React.ElementType;
  skills: string[];
}) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <Badge
              key={s}
              variant="secondary"
              className="text-xs font-normal"
            >
              {s}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project }: { project: (typeof PROJECTS)[0] }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base">{project.title}</h3>
              {project.funded && (
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
                  <Rocket className="h-3 w-3 mr-1" />
                  Funded
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.subtitle}
            </p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {project.period}
          </span>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          {project.description}
        </p>

        <ul className="space-y-1.5 mb-4">
          {project.highlights.map((h, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-foreground/80"
            >
              <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              {h}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {project.tech.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="text-xs font-normal"
            >
              {t}
            </Badge>
          ))}
        </div>

        {project.links && (
          <div className="flex gap-2 pt-1">
            {project.links.github && (
              <a
                href={project.links.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-3.5 w-3.5" /> GitHub
              </a>
            )}
            {project.links.live && (
              <a
                href={project.links.live}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="h-3.5 w-3.5" /> Live
              </a>
            )}
            {project.links.api && (
              <a
                href={project.links.api}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> API
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AchievementCard({
  achievement,
  onOpen,
}: {
  achievement: (typeof ACHIEVEMENTS)[0];
  onOpen: () => void;
}) {
  const iconMap = {
    trophy: Trophy,
    award: Award,
    photo: GraduationCap,
    education: GraduationCap,
  };
  const Icon = iconMap[achievement.type];

  return (
    <Card
      className="group border-border/50 bg-card/50 backdrop-blur overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onOpen}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={achievement.image}
          alt={achievement.title}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-white drop-shadow">
              {achievement.title}
            </span>
          </div>
          <p className="text-[10px] text-white/70 mt-0.5 line-clamp-1">
            {achievement.event}
          </p>
        </div>
      </div>
    </Card>
  );
}

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors z-10"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      <div
        className="relative max-w-5xl max-h-[90vh] w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain"
          sizes="100vw"
          priority
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */
export default function CVPage() {
  const [lightbox, setLightbox] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  return (
    <>
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="shell py-8 max-w-5xl mx-auto space-y-10">
        {/* ═══════ Hero / About ═══════ */}
        <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-6 sm:p-8">
          <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row items-start gap-6">
            {/* Avatar placeholder */}
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary text-3xl font-bold flex-shrink-0">
              TT
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Nguyen Tien Tung
                </h1>
                <p className="text-primary font-semibold mt-1">
                  Fullstack &amp; Blockchain Developer
                </p>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                Passionate blockchain developer with 3+ years of experience building on Cardano.
                Specialized in smart contract development (Aiken/Plutus V3), full-stack DApp
                architecture, and DeFi protocol design. Project Catalyst grantee across
                Fund&nbsp;10, 11, 12 &amp; 14. Currently building SolverNet&nbsp;DEX — an
                intent-based decentralized exchange with solver architecture.
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> Vietnam
                </span>
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5" /> Information Technology
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://github.com/TienTung2501"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github className="h-4 w-4 mr-1.5" />
                    GitHub
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="mailto:tientung03.nttvn@gmail.com">
                    <Mail className="h-4 w-4 mr-1.5" />
                    Email
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://t.me/TungTM0"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    Telegram
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ Skills ═══════ */}
        <section>
          <SectionHeader
            icon={Code2}
            title="Technical Skills"
            subtitle="Technologies I work with daily"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SkillCategory
              title="Blockchain / Cardano"
              icon={Box}
              skills={SKILLS.blockchain}
            />
            <SkillCategory
              title="Backend"
              icon={Database}
              skills={SKILLS.backend}
            />
            <SkillCategory
              title="Frontend"
              icon={Layers}
              skills={SKILLS.frontend}
            />
            <SkillCategory
              title="DevOps & Tools"
              icon={Cpu}
              skills={SKILLS.devops}
            />
          </div>
        </section>

        <Separator />

        {/* ═══════ Projects ═══════ */}
        <section>
          <SectionHeader
            icon={Briefcase}
            title="Projects & Experience"
            subtitle="Funded blockchain projects and open-source work"
          />
          <div className="space-y-4">
            {PROJECTS.map((p) => (
              <ProjectCard key={p.title} project={p} />
            ))}
          </div>
        </section>

        <Separator />

        {/* ═══════ Achievements ═══════ */}
        <section>
          <SectionHeader
            icon={Award}
            title="Achievements & Certificates"
            subtitle="Competition results and academic recognition"
          />

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="competitions">Competitions</TabsTrigger>
              <TabsTrigger value="academic">Academic</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ACHIEVEMENTS.map((a, i) => (
                  <AchievementCard
                    key={i}
                    achievement={a}
                    onOpen={() =>
                      setLightbox({ src: a.image, alt: a.title })
                    }
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="competitions">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ACHIEVEMENTS.filter(
                  (a) => a.type === "trophy" || a.type === "award"
                ).map((a, i) => (
                  <AchievementCard
                    key={i}
                    achievement={a}
                    onOpen={() =>
                      setLightbox({ src: a.image, alt: a.title })
                    }
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="academic">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ACHIEVEMENTS.filter(
                  (a) => a.type === "education" || a.type === "photo"
                ).map((a, i) => (
                  <AchievementCard
                    key={i}
                    achievement={a}
                    onOpen={() =>
                      setLightbox({ src: a.image, alt: a.title })
                    }
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <Separator />

        {/* ═══════ Contact ═══════ */}
        <section>
          <SectionHeader
            icon={Mail}
            title="Contact"
            subtitle="Let's connect and build together"
          />
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardContent className="pt-5 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <a
                  href="mailto:tientung03.nttvn@gmail.com"
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">tientung03.nttvn@gmail.com</p>
                  </div>
                </a>

                <a
                  href="https://t.me/TungTM0"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Send className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telegram</p>
                    <p className="text-sm font-medium">@TungTM0</p>
                  </div>
                </a>

                <a
                  href="https://github.com/TienTung2501"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Github className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">GitHub</p>
                    <p className="text-sm font-medium">TienTung2501</p>
                  </div>
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ═══════ Footer note ═══════ */}
        <div className="text-center text-xs text-muted-foreground pb-4">
          <p>
            Built with Next.js, TailwindCSS &amp; ShadCN UI • Images hosted on
            IPFS via Pinata
          </p>
        </div>
      </div>
    </>
  );
}
