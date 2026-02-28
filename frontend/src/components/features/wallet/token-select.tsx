"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, Loader2, ArrowDownUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TokenIcon } from "@/components/ui/token-icon";
import { TOKEN_LIST, TOKENS, type Token } from "@/lib/mock-data";
import { listPools } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TokenSelectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (token: Token) => void;
  excludeTicker?: string;
  balances?: Record<string, number>;
  /** Pool list for showing "no pool" indicators (display only, no filtering) */
  availablePools?: Array<{ assetA: { policyId: string; ticker?: string }; assetB: { policyId: string; ticker?: string } }>;
  /** The token on the other side — used for "no pool" indicator display */
  pairedWith?: Token;
}

/** Decode a Cardano hex-encoded asset name to UTF-8. Returns hex if not valid UTF-8. */
function hexToUtf8(hex: string): string {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return hex;
  try {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return hex;
  }
}

/** Resolve a raw pool asset to a Token, hex-decoding the assetName and looking up known metadata. */
function resolvePoolToken(
  policyId: string,
  assetName: string,
  ticker?: string,
  decimals?: number
): Token {
  // ADA
  if (!policyId || policyId === "" || assetName === "lovelace") return TOKENS.ADA;
  // Decode hex assetName for display (e.g. "484f534b59" → "HOSKY")
  const decodedName = hexToUtf8(assetName);
  const displayTicker = ticker || decodedName;
  // Known token by explicit ticker
  if (ticker) {
    const known = Object.values(TOKENS).find(
      (t) => t.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (known) return known;
  }
  // Match by decoded assetName as ticker
  if (decodedName !== assetName) {
    const byDecoded = Object.values(TOKENS).find(
      (t) => t.ticker.toUpperCase() === decodedName.toUpperCase()
    );
    if (byDecoded) return byDecoded;
  }
  // Known token by on-chain ID
  const byId = Object.values(TOKENS).find(
    (t) => t.policyId === policyId && t.assetName === assetName
  );
  if (byId) return byId;
  // Unknown — construct minimal metadata using decoded name
  return {
    policyId,
    assetName,
    ticker: displayTicker.slice(0, 10),
    name: displayTicker,
    decimals: decimals ?? 0,
    logo: "🪙",
  };
}

// ─── Module-level token cache ───────────────
// Avoids re-fetching pool tokens every time the dialog opens.
// Cache is valid for 60 seconds — subsequent opens reuse cached tokens instantly.
let _cachedTokens: Token[] | null = null;
let _cacheTimestamp = 0;
const TOKEN_CACHE_TTL = 60_000; // 60s

export function TokenSelectDialog({
  open,
  onOpenChange,
  onSelect,
  excludeTicker,
  balances = {},
  pairedWith,
  availablePools,
}: TokenSelectProps) {
  const [search, setSearch] = useState("");
  const [dynamicTokens, setDynamicTokens] = useState<Token[]>(_cachedTokens ?? [TOKENS.ADA]);
  const [fetching, setFetching] = useState(false);

  // Fetch tokens from active pools — uses module-level cache to avoid redundant calls
  useEffect(() => {
    if (!open) return;
    // If cache is fresh, use it immediately
    if (_cachedTokens && Date.now() - _cacheTimestamp < TOKEN_CACHE_TTL) {
      setDynamicTokens(_cachedTokens);
      return;
    }
    setFetching(true);
    listPools({ state: "ACTIVE", limit: "100" })
      .then((res) => {
        const seen = new Set<string>();
        // Start with ADA only — show only tokens that exist in real pools
        const merged: Token[] = [TOKENS.ADA];
        seen.add("ADA");

        for (const pool of res.data) {
          for (const asset of [pool.assetA, pool.assetB]) {
            const t = resolvePoolToken(
              asset.policyId,
              asset.assetName,
              asset.ticker,
              asset.decimals
            );
            if (!seen.has(t.ticker.toUpperCase())) {
              seen.add(t.ticker.toUpperCase());
              merged.push(t);
            }
          }
        }
        // If no pools returned, fall back to static list so UI is never empty
        const result = merged.length > 1 ? merged : TOKEN_LIST;
        _cachedTokens = result;
        _cacheTimestamp = Date.now();
        setDynamicTokens(result);
      })
      .catch(() => {
        // Silently fall back to static list on error
        setDynamicTokens(TOKEN_LIST);
      })
      .finally(() => setFetching(false));
  }, [open]);

  // Build set of tickers that have pool pairings with the paired token (for UI indicators only)
  const pairedTickers = useMemo(() => {
    if (!pairedWith || !availablePools || availablePools.length === 0) return null;
    const matchesPaired = (asset: { policyId: string; ticker?: string }) =>
      asset.policyId === pairedWith.policyId ||
      (asset.ticker && pairedWith.ticker && asset.ticker.toUpperCase() === pairedWith.ticker.toUpperCase());
    const tickers = new Set<string>();
    for (const pool of availablePools) {
      if (matchesPaired(pool.assetA)) {
        tickers.add((pool.assetB.ticker ?? "").toUpperCase());
      } else if (matchesPaired(pool.assetB)) {
        tickers.add((pool.assetA.ticker ?? "").toUpperCase());
      }
    }
    return tickers;
  }, [pairedWith, availablePools]);

  const filtered = useMemo(() => {
    const tokens = dynamicTokens.filter((t) => {
      // Only exclude the same token that's already selected on the other side
      if (t.ticker === excludeTicker) return false;
      // No pair filtering — always show ALL tokens (Uniswap standard)
      if (!search) return true;
      return (
        t.ticker.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase())
      );
    });
    // Sort: tokens with pool pairing first, then alphabetically
    if (pairedTickers) {
      tokens.sort((a, b) => {
        const aHasPool = pairedTickers.has(a.ticker.toUpperCase()) ? 0 : 1;
        const bHasPool = pairedTickers.has(b.ticker.toUpperCase()) ? 0 : 1;
        if (aHasPool !== bHasPool) return aHasPool - bHasPool;
        return a.ticker.localeCompare(b.ticker);
      });
    }
    return tokens;
  }, [search, excludeTicker, dynamicTokens, pairedTickers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Select Token
            {fetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or ticker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <ScrollArea className="h-[320px] -mx-2">
          <div className="space-y-0.5 px-2">
            {filtered.map((token) => {
              const balance = balances[token.ticker] || 0;
              const displayBalance =
                token.decimals > 0
                  ? (balance / Math.pow(10, token.decimals)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 2 }
                    )
                  : balance.toLocaleString();
              const hasPool = !pairedTickers || pairedTickers.has(token.ticker.toUpperCase());

              return (
                <button
                  key={token.ticker}
                  onClick={() => {
                    onSelect(token);
                    onOpenChange(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left",
                    "hover:bg-accent transition-colors cursor-pointer",
                    !hasPool && "opacity-60"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon token={token} size="lg" />
                    <div>
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        {token.ticker}
                        {!hasPool && (
                          <span className="text-[9px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-normal">
                            No pool
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {token.name}
                      </div>
                    </div>
                  </div>
                  {balance > 0 && (
                    <div className="text-xs text-muted-foreground font-mono">
                      {displayBalance}
                    </div>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No tokens found
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline Token Selector Button ───────────
interface TokenButtonProps {
  token: Token | null;
  onClick: () => void;
}

export function TokenButton({ token, onClick }: TokenButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium cursor-pointer"
    >
      {token ? (
        <>
          <TokenIcon token={token} size="sm" />
          <span className="max-w-[90px] truncate">{token.ticker}</span>
        </>
      ) : (
        <span className="whitespace-nowrap">Select token</span>
      )}
      <ArrowDownUp className="h-3 w-3 opacity-50 shrink-0" />
    </button>
  );
}
