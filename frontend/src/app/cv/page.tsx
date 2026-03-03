"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  Layers,
  X,
  Phone,
  Star,
  BookOpen,
  Users,
  Target,
  Heart,
  Sparkles,
  FlaskConical,
  Medal,
  Building,
  FileText,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   IPFS Image URLs (from .env / Pinata gateway)
   ═══════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════
   All images for the carousel showcase
   ═══════════════════════════════════════════════════════════ */
const ALL_IMAGES = [
  { src: IPFS.slide_totnghiep, title: "Lễ Tốt nghiệp - Thủ khoa Khoa CNTT" },
  { src: IPFS.top1_maintrack, title: "Giải Nhất Main Track - Cardano Hackathon 2025" },
  { src: IPFS.top5_student_01, title: "Top 5 Student Track - Aptos Hackathon" },
  { src: IPFS.top5_student_02, title: "Certificate - Vietnam Aptos Hackathon" },
  // { src: IPFS.giai3_nckh_nam2, title: "Giải Ba NCKH - Năm 2" },
  // { src: IPFS.giai2_nckh_nam3, title: "Giải Nhì NCKH - Năm 3" },
  { src: IPFS.anh_luu_niem_01, title: "Ảnh lưu niệm NCKH" },
  { src: IPFS.anh_luu_niem_02, title: "Ảnh lưu niệm NCKH (2)" },
];

/* ═══════════════════════════════════════════════════════════
   Data - from CV.pdf + GitHub README
   ═══════════════════════════════════════════════════════════ */

const CONTACT_INFO = {
  name: "Nguyen Tien Tung",
  title: "Cử nhân Công nghệ Thông tin",
  role: "Fullstack & Blockchain Developer",
  dob: "15/01/2003",
  phone: "0368942026",
  email: "tientung03.nttvn@gmail.com",
  telegram: "@TungTM0",
  github: "TienTung2501",
  address: "Thôn Yên Nội, xã Hưng Đạo, TP Hà Nội",
};

const EDUCATION = {
  school: "Trường Đại học Giao thông Vận tải",
  major: "Công nghệ Thông tin",
  gpa: "3.78 / 4.0",
  honor: "Tốt nghiệp Thủ khoa xuất sắc - Khoa Công nghệ Thông tin",
  scholarship: "Học bổng xuất sắc 6/8 kỳ",
  role: "Phó Bí thư lớp",
};

const TECHNICAL_SKILLS = {
  blockchain: [
    "Aiken",
    "Lucid / MeshJS",
    "CIP-68",
    "eUTXO Model",
    "Blockfrost",
    "Hydra / Midnight",
    "Cardano-CLI",
    "Aptos / Core DAO",
    "Solidity / EVM (Basic)",
  ],
  fullstack: [
    "React / Next.js",
    "TypeScript",
    "TailwindCSS / ShadCN UI",
    "Figma",
    "Node.js / Express",
    "Python / FastAPI",
    "PostgreSQL / MySQL",
    "Redis (Basic)",
    "REST APIs / IPFS",
    "Wallet Integrations",
  ],
  ai_devops: [
    "AI-Assisted Architecture & Code Generation",
    "Rapid MVP → Production Pipelines",
    "Smart Contract Simulation & Optimization",
    "Docker / CI/CD / GitHub Actions",
    "Automated Testing & Debugging",
  ],
};

const SOFT_SKILLS = [
  "Tư duy logic",
  "Tự học & nghiên cứu tài liệu",
  "Làm việc nhóm",
  "Lãnh đạo",
  "Giải quyết vấn đề",
  "Giao tiếp & kết nối",
  "Chịu đựng áp lực",
];

const STRENGTHS = [
  { label: "Tư duy logic, thích nghi tốt", icon: Cpu },
  { label: "Khả năng làm việc nhóm", icon: Users },
  { label: "Khả năng giao tiếp kết nối", icon: Globe },
  { label: "Khả năng giải quyết vấn đề", icon: Target },
  { label: "Khả năng tự học, nghiên cứu", icon: BookOpen },
  { label: "Chịu đựng áp lực", icon: Sparkles },
];

const HOBBIES = ["Đọc sách", "Nghe nhạc", "Du lịch", "Bơi", "Chạy bộ"];

const COMPETITIONS = [
  {
    title: "Giải Nhất Main Track",
    event: "Cardano Blockchain Hackathon 2025",
    org: "Đại học Giao thông Vận tải - Tài trợ bởi Cardano",
    image: IPFS.top1_maintrack,
    badge: "🥇",
    color: "text-amber-500 border-amber-500/30 bg-amber-500/5",
  },
  {
    title: "Top 5 Student Track",
    event: "Vietnam Aptos Hackathon - GMVN 2025",
    org: "GMVN 2025",
    image: IPFS.top5_student_01,
    badge: "🏅",
    color: "text-blue-500 border-blue-500/30 bg-blue-500/5",
  },
  {
    title: "Top 5 Student Track (Certificate)",
    event: "Vietnam Aptos Hackathon - GMVN 2025",
    org: "GMVN 2025",
    image: IPFS.top5_student_02,
    badge: "🏅",
    color: "text-blue-500 border-blue-500/30 bg-blue-500/5",
  },
];

const RESEARCH = [
  {
    title: "Giải Ba NCKH (Năm 2)",
    topic: "Ứng dụng Blockchain trong quản lý tài sản NFT",
    image: IPFS.giai3_nckh_nam2,
    badge: "🥉",
  },
  {
    title: "Giải Nhì NCKH (Năm 3)",
    topic:
      "Xây dựng nền tảng đấu giá trên Cardano - Blockchain & Smart Contract",
    image: IPFS.giai2_nckh_nam3,
    badge: "🥈",
  },
  {
    title: "Giải Nhì NCKH (Năm 3)",
    topic:
      "Phát triển sàn giao dịch tài sản số trên Cardano - Blockchain & Smart Contract",
    image: IPFS.anh_luu_niem_01,
    badge: "🥈",
  },
];

const GALLERY = [
  { title: "Ảnh lưu niệm NCKH năm 3", image: IPFS.anh_luu_niem_01 },
  { title: "Ảnh lưu niệm NCKH năm 3 (2)", image: IPFS.anh_luu_niem_02 },
  { title: "Slide Tốt nghiệp", image: IPFS.slide_totnghiep },
];

const PROJECTS = [
  {
    title: "SolverNet DEX",
    subtitle: "Intent-Based Decentralized Exchange on Cardano",
    period: "2026 – Present",
    description:
      "Dự án solo xây dựng sàn DEX thế hệ mới sử dụng kiến trúc solver-based intent. Cung cấp cho mọi người nền tảng để tạo liquidity pool, đặt lệnh, swap, theo dõi phân tích và quản lý danh mục tài sản trên Cardano một cách tối ưu và thân thiện. Cung cấp module quản trịcho admin và người dùng để điều chỉnh tham số, quản lý pool, theo dõi hiệu suất.",
    tech: [
      "Aiken",
      "Plutus V3",
      "Lucid",
      "CIP 30 Wallet Integrations",
      "TypeScript",
      "Nextjs",
      "Nodejs",
      "Express",
      "Prisma",
      "PostgreSQL",
      "Redis",
      "Docker",
    ],
    highlights: [
      "Smartcontract (Escrow, Pool, Order, Factory, Settings, LP/NFT policies)",
      "Solver engine: NettingEngine → RouteOptimizer → BatchBuilder pipeline",
      "Full-stack: REST API, WebSocket real-time, Next.js 16 trading UI",
      "Clean Architecture (DDD) với hexagonal backend",
    ],
    links: {
      github: "https://github.com/TienTung2501/TDexMs",
      live: "https://tdexms.vercel.app/",
      docs: "https://docs-tdexms.vercel.app",
    },
    solo: true,
  },
];

const CATALYST_PROJECTS = [
  {
    fund: "Fund 14",
    title: "PyCardano - The Ultimate Course for Python & AI Developers",
    description:
      "Khóa học toàn diện xây dựng Cardano dApps bằng Python/PyCardano, bao gồm off-chain architecture, transaction construction, smart contract interaction.",
    link: "https://projectcatalyst.io/funds/14/cardano-open-ecosystem/pycardano-the-ultimate-course-for-python-and-ai-developers",
  },
  {
    fund: "Fund 12",
    title: "Open Source Dynamic Assets Generator (CIP-68)",
    description:
      "Framework mã nguồn mở tạo dynamic Tokens/NFTs tuân thủ hoàn toàn chuẩn CIP-68.",
    link: "https://projectcatalyst.io/funds/12/cardano-use-cases-concept/open-source-dynamic-assets-tokennft-generator-cip68",
  },
  {
    fund: "Fund 11",
    title: "The Complete Aiken Course - Cardano from Zero to Expert",
    description:
      "Khóa học chuyên sâu để thành thạo Aiken - ngôn ngữ smart contract của Cardano - từ cơ bản đến nâng cao.",
    link: "https://projectcatalyst.io/funds/11/cardano-open-ecosystem/the-complete-aiken-course-cardano-from-zero-to-expert",
  },
  {
    fund: "Fund 10",
    title: "Vietnam Cardano Catalyst NFT Exchange",
    description:
      "Môi trường thử nghiệm & phát triển giúp sinh viên Việt Nam tiếp cận Web3 thông qua các use case NFT thực tế.",
    link: "https://projectcatalyst.io/funds/10/startups-and-onboarding-for-students/vietnam-cardano-catalyst-nft-exchange-testing-and-development-environment-helps-young-people-approach-with-the-web30-platform",
  },
];

const ACTIVITIES = [
  {
    title: "Blockchain UTC Club",
    role: "Thành viên Ban Cố vấn Học thuật",
    org: "CLB Blockchain - Đại học Giao thông Vận tải Hà Nội",
    icon: Building,
  },
  {
    title: "Sinh viên gọi vốn Cardano",
    role: "Thành viên nhóm gọi vốn & triển khai dự án",
    org: "Cộng đồng Blockchain Cardano - Project Catalyst",
    icon: Rocket,
  },
  {
    title: "Nghiên cứu Khoa học",
    role: "Sinh viên nghiên cứu (Năm 2 & Năm 3)",
    org: "Đại học Giao thông Vận tải - Cấp trường",
    icon: FlaskConical,
  },
];

/* ═══════════════════════════════════════════════════════════
   Lightbox for images
   ═══════════════════════════════════════════════════════════ */
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
        className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Auto-cycling image showcase carousel
   ═══════════════════════════════════════════════════════════ */
function ImageShowcase({
  images,
  onImageClick,
}: {
  images: { src: string; title: string }[];
  onImageClick: (src: string, alt: string) => void;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((p) => (p + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Main cycling image */}
      <button
        onClick={() => {
          const img = images[active];
          onImageClick(img.src, img.title);
        }}
        className="relative w-full aspect-[4/3] rounded-xl overflow-hidden ring-2 ring-white/20 shadow-2xl cursor-pointer group"
      >
        {images.map((img, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={i}
            src={img.src}
            alt={img.title}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-in-out",
              i === active ? "opacity-100 scale-100" : "opacity-0 scale-105"
            )}
          />
        ))}
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors duration-300" />
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent h-12" />
      </button>

      {/* Animated dots */}
      <div className="flex gap-1.5 items-center">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500",
              i === active
                ? "bg-white w-5"
                : "bg-white/40 w-1.5 hover:bg-white/60"
            )}
          />
        ))}
      </div>

      {/* Title with fade */}
      <p className="text-center text-xs text-white/60 h-4 transition-all duration-500">
        {images[active]?.title}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Section Header
   ═══════════════════════════════════════════════════════════ */
function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main CV Page
   ═══════════════════════════════════════════════════════════ */
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

      <div className="shell py-6 max-w-6xl mx-auto space-y-6">
        {/* ══════════════════════════════════════
           HERO - Background graduation photo + image carousel
           ══════════════════════════════════════ */}
        <section className="relative min-h-[420px] sm:min-h-[460px] overflow-hidden rounded-2xl border border-border/50">
          {/* Background: graduation photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IPFS.slide_totnghiep}
            alt="Graduation"
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/50" />

          {/* Subtle animated glow accent */}
          <div className="absolute top-1/2 right-[25%] -translate-y-1/2 h-72 w-72 rounded-full bg-primary/15 blur-[120px] animate-pulse pointer-events-none" />

          {/* Content */}
          <div className="relative flex items-center p-6 sm:p-10 min-h-[420px] sm:min-h-[460px]">
            <div className="flex flex-col lg:flex-row items-start gap-8 w-full">
              {/* Left: Name + Bio + Contact */}
              <div className="flex-1 text-white space-y-4 min-w-0">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white text-2xl font-black flex-shrink-0 ring-2 ring-white/20 backdrop-blur-sm">
                    TT
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {CONTACT_INFO.name}
                    </h1>
                    <p className="text-primary font-semibold text-sm">
                      {CONTACT_INFO.role}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">
                      {CONTACT_INFO.title}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-white/70 leading-relaxed max-w-xl">
                  Fullstack & Blockchain Developer chuyên xây dựng ứng dụng phi
                  tập trung (dApps) trên hệ sinh thái Cardano. Hơn 3 năm kinh
                  nghiệm, thành thạo Aiken, Lucid, CIP-68, MeshJS, Blockfrost,
                  Hydra, Midnight và mô hình eUTXO. Được gọi vốn thành công qua
                  nhiều vòng Project Catalyst (Fund 10, 11, 12, 14).
                </p>

                {/* Contact info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    { icon: Calendar, label: CONTACT_INFO.dob },
                    { icon: Phone, label: CONTACT_INFO.phone },
                    { icon: Mail, label: CONTACT_INFO.email },
                    {
                      icon: Send,
                      label: `Telegram: ${CONTACT_INFO.telegram}`,
                    },
                    { icon: MapPin, label: CONTACT_INFO.address },
                  ].map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-white/60"
                    >
                      <c.icon className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                      <span className="text-xs truncate">{c.label}</span>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                    asChild
                  >
                    <a
                      href="https://github.com/TienTung2501"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Github className="h-3 w-3 mr-1" /> GitHub
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                    asChild
                  >
                    <a href="mailto:tientung03.nttvn@gmail.com">
                      <Mail className="h-3 w-3 mr-1" /> Email
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                    asChild
                  >
                    <a
                      href="https://t.me/TungTM0"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Send className="h-3 w-3 mr-1" /> Telegram
                    </a>
                  </Button>
                </div>
              </div>

              {/* Right: Image carousel showcase */}
              <div className="lg:w-64 w-full max-w-[280px] flex-shrink-0 mx-auto lg:mx-0">
                <ImageShowcase
                  images={ALL_IMAGES}
                  onImageClick={(src, alt) => setLightbox({ src, alt })}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
           TWO-COLUMN LAYOUT: Left (main) + Right (sidebar)
           ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               LEFT COLUMN (2/3)
               ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="lg:col-span-2 space-y-6">
            {/* - Technical Skills - Colored categories - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle
                  icon={Code2}
                  title="Kỹ năng Chuyên môn"
                  subtitle="Blockchain, Fullstack & AI-Augmented Development"
                />
                <div className="space-y-3">
                  {/* Blockchain - amber */}
                  <div className="rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent p-3 pl-4 border-l-4 border-l-amber-500">
                    <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Box className="h-3 w-3" /> Blockchain & Smart Contracts
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {TECHNICAL_SKILLS.blockchain.map((s) => (
                        <Badge
                          key={s}
                          className="text-xs font-normal bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Fullstack - blue */}
                  <div className="rounded-lg border border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-transparent p-3 pl-4 border-l-4 border-l-blue-500">
                    <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Layers className="h-3 w-3" /> Fullstack Development
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {TECHNICAL_SKILLS.fullstack.map((s) => (
                        <Badge
                          key={s}
                          className="text-xs font-normal bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* AI & DevOps - purple */}
                  <div className="rounded-lg border border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-transparent p-3 pl-4 border-l-4 border-l-purple-500">
                    <h3 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Cpu className="h-3 w-3" /> AI-Augmented & DevOps
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {TECHNICAL_SKILLS.ai_devops.map((s) => (
                        <Badge
                          key={s}
                          className="text-xs font-normal bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* - Solo Project: SolverNet DEX - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle
                  icon={Briefcase}
                  title="Dự án Cá nhân"
                  subtitle="Solo project chứng minh năng lực"
                />
                {PROJECTS.map((p) => (
                  <div key={p.title} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold">{p.title}</h3>
                          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                            <Code2 className="h-3 w-3 mr-1" /> Solo
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.subtitle}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {p.period}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {p.description}
                    </p>
                    <ul className="space-y-1">
                      {p.highlights.map((h, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground/80"
                        >
                          <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />{" "}
                          {h}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-1.5">
                      {p.tech.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-3 text-xs">
                      {/* <a
                        href={p.links.github}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Github className="h-3.5 w-3.5" /> GitHub
                      </a> */}
                      <a
                        href={p.links.live}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Globe className="h-3.5 w-3.5" /> Live Demo
                      </a>
                      <a
                        href={p.links.docs}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" /> Documentation
                      </a>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* - Catalyst Funded Projects - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                 <div className="flex items-start justify-between gap-3">

                <SectionTitle
                  icon={Rocket}
                  title="Dự án gọi vốn - Project Catalyst"
                  subtitle="Cardano community-funded projects"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 2023-2025
                </span>
                 </div>
                <div className="space-y-4">
                  {CATALYST_PROJECTS.map((p) => (
                    <div key={p.fund} className="flex gap-3">
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs h-fit mt-0.5 shrink-0">
                        {p.fund}
                      </Badge>
                      <div className="space-y-1 min-w-0">
                        <h4 className="font-semibold text-sm">{p.title}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {p.description}
                        </p>
                        <a
                          href={p.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> View Proposal
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Competitions - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between gap-3">

                <SectionTitle
                  icon={Trophy}
                  title="Cuộc thi"
                  subtitle="Hackathons & competitions"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 2025
                </span>
                 </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {COMPETITIONS.map((c, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setLightbox({ src: c.image, alt: c.title })
                      }
                      className={cn(
                        "rounded-xl border p-4 text-left space-y-2 hover:scale-[1.02] transition-all cursor-pointer",
                        c.color
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{c.badge}</span>
                        <h4 className="font-bold text-sm">{c.title}</h4>
                      </div>
                      <p className="text-xs opacity-80">{c.event}</p>
                      <p className="text-[10px] opacity-60">{c.org}</p>
                      <p className="text-[10px] text-primary/70 mt-1">
                        Nhấn để xem ảnh →
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Scientific Research - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                 <div className="flex items-start justify-between gap-3">

                <SectionTitle
                  icon={FlaskConical}
                  title="Nghiên cứu Khoa học"
                  subtitle="Nghiên cứu sinh viên cấp trường"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 2022-2024
                </span>
                 </div>
                
                <div className="space-y-3">
                  {RESEARCH.map((r, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setLightbox({ src: r.image, alt: r.title })
                      }
                      className="w-full flex items-start gap-3 rounded-lg border border-border/50 p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors text-left cursor-pointer"
                    >
                      <span className="text-lg">{r.badge}</span>
                      <div className="space-y-0.5 min-w-0">
                        <h4 className="font-semibold text-sm">{r.title}</h4>
                        <p className="text-xs text-muted-foreground">
                          {r.topic}
                        </p>
                        <p className="text-[10px] text-primary/70">
                          Nhấn để xem ảnh →
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Gallery - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={Award} title="Hình ảnh Hoạt động" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {GALLERY.map((g, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setLightbox({ src: g.image, alt: g.title })
                      }
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/50 bg-muted cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.image}
                        alt={g.title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute bottom-2 left-2 right-2 text-xs font-semibold text-white drop-shadow">
                        {g.title}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               RIGHT COLUMN / SIDEBAR (1/3)
               ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div className="space-y-6">
            {/* - Education - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={GraduationCap} title="Học vấn" />
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-sm">
                      {EDUCATION.school}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Ngành: {EDUCATION.major}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-medium">
                        GPA: {EDUCATION.gpa}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Trophy className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs">{EDUCATION.honor}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Medal className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs">{EDUCATION.scholarship}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs">{EDUCATION.role}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* - Strengths - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={Sparkles} title="Điểm mạnh" />
                <div className="space-y-2">
                  {STRENGTHS.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <s.icon className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                      <span className="text-xs">{s.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Soft Skills - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={Users} title="Kỹ năng mềm" />
                <div className="flex flex-wrap gap-1.5">
                  {SOFT_SKILLS.map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="text-xs font-normal"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Activities - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={Building} title="Hoạt động" />
                <div className="space-y-3">
                  {ACTIVITIES.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <a.icon className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-xs font-semibold">{a.title}</h4>
                        <p className="text-[10px] text-muted-foreground">
                          {a.role}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">
                          {a.org}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Hobbies - */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={Heart} title="Sở thích" />
                <div className="flex flex-wrap gap-1.5">
                  {HOBBIES.map((h) => (
                    <Badge
                      key={h}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {h}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* - Goals - */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent backdrop-blur">
              <CardContent className="pt-5 pb-5">
                <SectionTitle icon={Target} title="Mục tiêu" />
                <ul className="space-y-2">
                  {[
                    "Mở rộng sang multi-chain infrastructure (Aptos, CoreDAO, L2s)",
                    "Xây dựng & hợp tác trên DAO, DID, decentralized funding",
                    "Đưa Web3 vào giáo dục, creator economy & ứng dụng thực tế",
                    "Tiên phong AI-accelerated development cho sản phẩm phi tập trung",
                  ].map((g, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <ChevronRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                      {g}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ══════════════════════════════════════
           FOOTER NOTE
           ══════════════════════════════════════ */}
        <div className="text-center text-xs text-muted-foreground pb-2">
          <p>
            Built with Next.js, TailwindCSS &amp; ShadCN UI &bull; Images hosted
            on IPFS via Pinata
          </p>
        </div>
      </div>
    </>
  );
}
