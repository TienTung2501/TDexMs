"use client";

import React, { useState, useMemo, useEffect } from "react";
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
}

/** Merge a raw pool asset into the TOKEN_LIST, using known metadata if available. */
function resolvePoolToken(
  policyId: string,
  assetName: string,
  ticker?: string,
  decimals?: number
): Token {
  // ADA
  if (!policyId || policyId === "") return TOKENS.ADA;
  // Known token by ticker
  if (ticker) {
    const known = Object.values(TOKENS).find(
      (t) => t.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (known) return known;
  }
  // Known token by on-chain ID
  const byId = Object.values(TOKENS).find(
    (t) => t.policyId === policyId && t.assetName === assetName
  );
  if (byId) return byId;
  // Unknown — construct minimal metadata
  return {
    policyId,
    assetName,
    ticker: ticker || assetName.slice(0, 8).toUpperCase(),
    name: ticker || "Unknown Token",
    decimals: decimals ?? 0,
    logo: "🪙",
  };
}

export function TokenSelectDialog({
  open,
  onOpenChange,
  onSelect,
  excludeTicker,
  balances = {},
}: TokenSelectProps) {
  const [search, setSearch] = useState("");
  const [dynamicTokens, setDynamicTokens] = useState<Token[]>(TOKEN_LIST);
  const [fetching, setFetching] = useState(false);

  // Fetch tokens from active pools whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setFetching(true);
    listPools({ state: "ACTIVE", limit: "100" })
      .then((res) => {
        const seen = new Set<string>();
        const merged: Token[] = [...TOKEN_LIST];

        // Track tickers from the static list so we don't double-add
        TOKEN_LIST.forEach((t) => seen.add(t.ticker.toUpperCase()));

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
        setDynamicTokens(merged);
      })
      .catch(() => {
        // Silently fall back to static list on error
        setDynamicTokens(TOKEN_LIST);
      })
      .finally(() => setFetching(false));
  }, [open]);

  const filtered = useMemo(() => {
    return dynamicTokens.filter((t) => {
      if (t.ticker === excludeTicker) return false;
      if (!search) return true;
      return (
        t.ticker.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [search, excludeTicker, dynamicTokens]);

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
                    "hover:bg-accent transition-colors cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon token={token} size="lg" />
                    <div>
                      <div className="font-medium text-sm">{token.ticker}</div>
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
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium whitespace-nowrap cursor-pointer"
    >
      {token ? (
        <>
          <TokenIcon token={token} size="sm" />
          {token.ticker}
        </>
      ) : (
        <>Select token</>
      )}
      <ArrowDownUp className="h-3 w-3 opacity-50" />
    </button>
  );
}
