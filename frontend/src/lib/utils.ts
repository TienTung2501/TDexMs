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

/**
 * Format a token amount from BASE UNITS to human-readable.
 * e.g. formatTokenAmount(5_000_000, 6) → "5.00" (5 ADA)
 *      formatTokenAmount(100_000_000, 8) → "1.00" (1 tBTC)
 *      formatTokenAmount(42, 0) → "42" (42 HOSKY)
 */
export function formatTokenAmount(
  rawAmount: number | bigint | string,
  tokenDecimals: number,
  displayDecimals?: number,
): string {
  const raw = typeof rawAmount === "bigint" ? Number(rawAmount)
            : typeof rawAmount === "string" ? Number(rawAmount)
            : rawAmount;
  if (!Number.isFinite(raw) || raw === 0) return "0";
  const human = tokenDecimals > 0 ? raw / Math.pow(10, tokenDecimals) : raw;
  const maxDp = displayDecimals ?? Math.min(tokenDecimals, 6);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(maxDp, 2),
    maximumFractionDigits: maxDp,
  }).format(human);
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

/**
 * Human-readable number from base units.
 * No formatting — just divides. Useful for arithmetic.
 */
export function toHuman(raw: number | bigint | string, decimals: number): number {
  const v = typeof raw === "bigint" ? Number(raw) : typeof raw === "string" ? Number(raw) : raw;
  return decimals > 0 ? v / Math.pow(10, decimals) : v;
}
