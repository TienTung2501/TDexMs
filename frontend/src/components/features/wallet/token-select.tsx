"use client";

import React, { useState, useMemo } from "react";
import { ArrowDownUp, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TokenIcon } from "@/components/ui/token-icon";
import { TOKEN_LIST, type Token } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface TokenSelectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (token: Token) => void;
  excludeTicker?: string;
  balances?: Record<string, number>;
}

export function TokenSelectDialog({
  open,
  onOpenChange,
  onSelect,
  excludeTicker,
  balances = {},
}: TokenSelectProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return TOKEN_LIST.filter((t) => {
      if (t.ticker === excludeTicker) return false;
      if (!search) return true;
      return (
        t.ticker.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [search, excludeTicker]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Token</DialogTitle>
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
