"use client";

import React, { useState, useMemo } from "react";
import { ArrowRight, ExternalLink, Loader2, XCircle, Clock, CheckCircle, AlertCircle, RefreshCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { truncateAddress, formatTokenAmount, toHuman, cn } from "@/lib/utils";
import { useIntents, useOrders, type NormalizedIntent, type NormalizedOrder } from "@/lib/hooks";
import { useWallet } from "@/providers/wallet-provider";
import { cancelIntent } from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";
import type { Token } from "@/lib/mock-data";

type TabId = "trades" | "intents";

interface TradingFooterProps {
  poolId?: string;
  inputToken?: Token;
  outputToken?: Token;
}

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon?: React.ReactNode; label?: string }> = {
  ACTIVE: { variant: "default", icon: <Clock className="h-3 w-3" />, label: "Active" },
  PENDING: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "Pending" },
  FILLED: { variant: "default", icon: <CheckCircle className="h-3 w-3" />, label: "Filled" },
  CANCELLED: { variant: "destructive", icon: <XCircle className="h-3 w-3" />, label: "Cancelled" },
  EXPIRED: { variant: "outline", icon: <AlertCircle className="h-3 w-3" />, label: "Expired" },
  RECLAIMED: { variant: "outline", icon: <RefreshCw className="h-3 w-3" />, label: "Reclaimed" },
  FILLING: { variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Filling" },
  CANCELLING: { variant: "destructive", icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Cancelling" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { variant: "secondary" as const };
  return (
    <Badge variant={cfg.variant} className="text-[9px] gap-0.5">
      {cfg.icon}
      {cfg.label ?? status}
    </Badge>
  );
}

/** Relative time like "2m ago", "1h ago", "3d ago" */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function TradingFooter({ poolId, inputToken, outputToken }: TradingFooterProps) {
  const [tab, setTab] = useState<TabId>("trades");
  const { isConnected, address } = useWallet();
  const { execute: executeTx, busy: txBusy, TxToastContainer } = useTransaction();

  // All intents (unfiltered) for market trades
  const { intents: allIntents, loading: tradesLoading } = useIntents({});

  // User intents for "My Intents" tab
  const { intents: userIntents, loading: intentsLoading, refetch: refetchIntents } = useIntents({
    address: isConnected ? address ?? undefined : undefined,
  });

  // Filter intents to current pair if inputToken & outputToken are provided
  const pairFilter = (intent: NormalizedIntent): boolean => {
    if (!inputToken || !outputToken) return true;
    return (
      (intent.inputTicker === inputToken.ticker && intent.outputTicker === outputToken.ticker) ||
      (intent.inputTicker === outputToken.ticker && intent.outputTicker === inputToken.ticker)
    );
  };

  const filteredTrades = useMemo(
    () => allIntents
      .filter(pairFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allIntents, inputToken?.ticker, outputToken?.ticker]
  );

  const filteredUserIntents = useMemo(
    () => userIntents.filter(pairFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userIntents, inputToken?.ticker, outputToken?.ticker]
  );

  const openCount = filteredUserIntents.filter(
    (i) => i.status === "ACTIVE" || i.status === "PENDING"
  ).length;

  const handleCancelIntent = async (intentId: string) => {
    if (!address) return;
    await executeTx(
      () => cancelIntent(intentId, address),
      {
        buildingMsg: "Building cancel intent transaction...",
        successMsg: "Intent cancelled!",
        action: "cancel_intent",
        extractId: (res) => ({ intentId: res.intentId }),
        onSuccess: () => refetchIntents(),
      },
    );
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "trades", label: "Market Trades" },
    { id: "intents", label: "My Intents", count: openCount },
  ];

  return (
    <>
    <TxToastContainer />
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border/30">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 cursor-pointer ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {t.count}
              </span>
            )}
          </button>
        ))}
        {/* Pair context badge */}
        {inputToken && outputToken && (
          <div className="ml-auto flex items-center px-3">
            <Badge variant="outline" className="text-[9px]">
              {inputToken.ticker}/{outputToken.ticker}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-h-[300px] overflow-y-auto">
        {tab === "trades" && (
          <MarketTradesTab trades={filteredTrades} loading={tradesLoading} />
        )}
        {tab === "intents" && (
          <MyIntentsTab
            intents={filteredUserIntents}
            loading={intentsLoading}
            isConnected={isConnected}
            onCancel={handleCancelIntent}
            cancelBusy={txBusy}
          />
        )}
      </div>
    </div>
    </>
  );
}

// ─── Market Trades ─────────────────────────

function MarketTradesTab({
  trades,
  loading,
}: {
  trades: NormalizedIntent[];
  loading: boolean;
}) {
  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        No recent trades for this pair
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-border/30 text-muted-foreground">
          <th className="text-left px-3 py-2 font-medium">Time</th>
          <th className="text-left px-3 py-2 font-medium">Pair</th>
          <th className="text-right px-3 py-2 font-medium">Amount</th>
          <th className="text-right px-3 py-2 font-medium">Received</th>
          <th className="text-center px-3 py-2 font-medium">Status</th>
          <th className="text-right px-3 py-2 font-medium">TX</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => {
          const received = trade.actualOutput ?? trade.minOutput;
          const receivedDecimals = trade.outputDecimals;
          const txHash = trade.settlementTxHash || trade.escrowTxHash;

          return (
            <tr
              key={trade.id}
              className="border-b border-border/20 hover:bg-muted/30 transition-colors"
            >
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                <Clock className="h-3 w-3 inline mr-1" />
                {timeAgo(trade.createdAt)}
                <br />
                <span className="text-[9px] opacity-70">
                  {new Date(trade.createdAt).toLocaleTimeString()}
                </span>
              </td>
              <td className="px-3 py-2 font-medium whitespace-nowrap">
                {trade.inputTicker}
                <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                {trade.outputTicker}
              </td>
              <td className="px-3 py-2 text-right font-mono text-destructive">
                {formatTokenAmount(trade.inputAmount, trade.inputDecimals)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-primary">
                {trade.actualOutput
                  ? formatTokenAmount(received, receivedDecimals)
                  : <span className="text-muted-foreground">~{formatTokenAmount(trade.minOutput, receivedDecimals)}</span>
                }
              </td>
              <td className="px-3 py-2 text-center">
                <StatusBadge status={trade.status} />
              </td>
              <td className="px-3 py-2 text-right">
                {txHash ? (
                  <a
                    href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
                  >
                    <span className="font-mono">{truncateAddress(txHash, 4, 4)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── My Intents ────────────────────────────

function MyIntentsTab({
  intents,
  loading,
  isConnected,
  onCancel,
  cancelBusy,
}: {
  intents: NormalizedIntent[];
  loading: boolean;
  isConnected: boolean;
  onCancel: (id: string) => void;
  cancelBusy: boolean;
}) {
  if (!isConnected) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        Connect wallet to see your intents
      </div>
    );
  }

  if (loading && intents.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (intents.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        No intents for this pair
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-border/30 text-muted-foreground">
          <th className="text-left px-3 py-2 font-medium">Time</th>
          <th className="text-left px-3 py-2 font-medium">Pair</th>
          <th className="text-right px-3 py-2 font-medium">Amount</th>
          <th className="text-right px-3 py-2 font-medium">Min Output</th>
          <th className="text-right px-3 py-2 font-medium">Received</th>
          <th className="text-center px-3 py-2 font-medium">Status</th>
          <th className="text-center px-3 py-2 font-medium">Funds</th>
          <th className="text-right px-3 py-2 font-medium">TX</th>
          <th className="text-right px-3 py-2 font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {intents.map((intent) => {
          const canCancel = intent.status === "ACTIVE" || intent.status === "PENDING";
          const canReclaim = intent.status === "EXPIRED";
          const txHash = intent.settlementTxHash || intent.escrowTxHash;
          const deadlineDate = new Date(intent.deadline);
          const isExpiringSoon = canCancel && deadlineDate.getTime() - Date.now() < 10 * 60_000;

          // Fund location indicator
          let fundLocation: { label: string; color: string } = { label: "Wallet", color: "text-primary" };
          if (intent.status === "ACTIVE" || intent.status === "PENDING" || intent.status === "FILLING") {
            fundLocation = { label: "In Escrow", color: "text-amber-500" };
          } else if (intent.status === "EXPIRED") {
            fundLocation = { label: "Stuck in Escrow", color: "text-destructive" };
          } else if (intent.status === "FILLED") {
            fundLocation = { label: "Received", color: "text-primary" };
          } else if (intent.status === "RECLAIMED" || intent.status === "CANCELLED") {
            fundLocation = { label: "Returned", color: "text-muted-foreground" };
          }

          return (
            <tr
              key={intent.id}
              className={cn(
                "border-b border-border/20 hover:bg-muted/30 transition-colors",
                intent.status === "EXPIRED" && "bg-destructive/5",
              )}
            >
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                {timeAgo(intent.createdAt)}
                <br />
                <span className="text-[9px] opacity-70">
                  {new Date(intent.createdAt).toLocaleTimeString()}
                </span>
              </td>
              <td className="px-3 py-2 font-medium whitespace-nowrap">
                {intent.inputTicker}
                <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground" />
                {intent.outputTicker}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {formatTokenAmount(intent.inputAmount, intent.inputDecimals)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                {formatTokenAmount(intent.minOutput, intent.outputDecimals)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-primary">
                {intent.actualOutput
                  ? formatTokenAmount(intent.actualOutput, intent.outputDecimals)
                  : "—"
                }
              </td>
              <td className="px-3 py-2 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <StatusBadge status={intent.status} />
                  {isExpiringSoon && (
                    <span className="text-[9px] text-yellow-500">Expiring soon</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-center">
                <span className={cn("text-[10px] font-medium", fundLocation.color)}>
                  {fundLocation.label}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                {txHash ? (
                  <a
                    href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
                  >
                    <span className="font-mono">{truncateAddress(txHash, 4, 4)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {canCancel && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-destructive hover:text-destructive text-[10px]"
                    onClick={() => onCancel(intent.id)}
                    disabled={cancelBusy}
                  >
                    <XCircle className="h-3 w-3 mr-0.5" />
                    Cancel
                  </Button>
                )}
                {canReclaim && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-amber-600 border-amber-500/30 hover:bg-amber-500/10 text-[10px] animate-pulse"
                    onClick={() => onCancel(intent.id)}
                    disabled={cancelBusy}
                  >
                    <Undo2 className="h-3 w-3 mr-0.5" />
                    Reclaim
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
