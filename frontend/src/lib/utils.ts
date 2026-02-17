import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format token amount with decimals */
export function formatAmount(amount: bigint | number, decimals: number = 2): string {
  const n = typeof amount === "number" ? amount : Number(amount) / Math.pow(10, decimals);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(decimals, 2),
    maximumFractionDigits: Math.min(decimals, 6),
  }).format(n);
}

/** Compact large numbers */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

/** Format ADA with symbol */
export function formatAda(lovelace: bigint | number): string {
  const ada = typeof lovelace === "number" ? lovelace : Number(lovelace) / 1_000_000;
  return `₳ ${formatCompact(ada)}`;
}

/** Format percentage */
export function formatPercent(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** Truncate address */
export function truncateAddress(addr: string, start = 8, end = 6): string {
  if (addr.length <= start + end) return addr;
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}
