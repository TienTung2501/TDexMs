"use client";

import React, { useState, useMemo } from "react";
import {
  Target,
  TrendingDown,
  BarChart3,
  Loader2,
  Info,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TokenSelectDialog,
  TokenButton,
} from "@/components/features/wallet/token-select";
import { WalletConnectDialog } from "@/components/features/wallet/wallet-connect-dialog";
import { useWallet } from "@/providers/wallet-provider";
import { TOKENS, type Token } from "@/lib/mock-data";
import type { NormalizedPool } from "@/lib/hooks";
import { createOrder } from "@/lib/api";
import { cn, formatAmount } from "@/lib/utils";
import { useTransaction } from "@/lib/hooks/use-transaction";

/** Feature flag — set to true when advanced orders are ready for production */
const ORDER_FEATURE_ENABLED = false;

type OrderTab = "LIMIT" | "DCA" | "STOP_LOSS";

interface OrderEntryCardProps {
  pools?: NormalizedPool[];
}

export function OrderEntryCard({ pools }: OrderEntryCardProps) {
  const { isConnected, address, changeAddress } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [activeTab, setActiveTab] = useState<OrderTab>("LIMIT");
  const [inputToken, setInputToken] = useState<Token>(TOKENS.ADA);
  const [outputToken, setOutputToken] = useState<Token>(TOKENS.tBTC);
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(null);

  // Common
  const [inputAmount, setInputAmount] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [deadline, setDeadline] = useState("7"); // days

  // DCA specific
  const [amountPerInterval, setAmountPerInterval] = useState("");
  const [intervalHours, setIntervalHours] = useState("24");

  // Stop-loss specific
  const [stopPrice, setStopPrice] = useState("");

  const [txResult, setTxResult] = useState<string | null>(null);
  const [featureWarning, setFeatureWarning] = useState(false);

  // Feature disabled — all inputs read-only
  const formDisabled = !ORDER_FEATURE_ENABLED;

  // Use policyId for pool matching (tickers can be ambiguous with hex names)
  const pool = useMemo(() => {
    const matchToken = (poolToken: { policyId: string; ticker?: string }, t: Token) =>
      poolToken.policyId === t.policyId ||
      (poolToken.policyId === '' && t.policyId === '' &&
        poolToken.ticker?.toLowerCase() === t.ticker?.toLowerCase());
    return (pools || []).find(
      (p) =>
        (matchToken(p.assetA, inputToken) && matchToken(p.assetB, outputToken)) ||
        (matchToken(p.assetB, inputToken) && matchToken(p.assetA, outputToken)),
    );
  }, [pools, inputToken, outputToken]);

  const currentPrice = useMemo(() => {
    if (!pool) return 0;
    const isForward =
      pool.assetA.policyId === inputToken.policyId ||
      (pool.assetA.policyId === '' && inputToken.policyId === '' &&
        pool.assetA.ticker?.toLowerCase() === inputToken.ticker?.toLowerCase());
    // Reserves are in base units — convert to human-readable for price display
    const reserveAHuman = pool.reserveA / Math.pow(10, pool.assetA.decimals ?? 6);
    const reserveBHuman = pool.reserveB / Math.pow(10, pool.assetB.decimals ?? 0);
    return isForward ? reserveBHuman / reserveAHuman : reserveAHuman / reserveBHuman;
  }, [pool, inputToken]);

  const tabs: { key: OrderTab; label: string; icon: React.ElementType }[] = [
    { key: "LIMIT", label: "Limit", icon: Target },
    { key: "DCA", label: "DCA", icon: BarChart3 },
    { key: "STOP_LOSS", label: "Stop-Loss", icon: TrendingDown },
  ];

  const handleSubmit = async () => {
    if (!ORDER_FEATURE_ENABLED) {
      setFeatureWarning(true);
      setTimeout(() => setFeatureWarning(false), 4000);
      return;
    }
    if (!address || !changeAddress || !inputAmount) return;
    setTxResult(null);

    const deadlineMs = Date.now() + Number(deadline) * 24 * 60 * 60 * 1000;
    const inputAsset =
      inputToken.policyId === "" ? "lovelace" : `${inputToken.policyId}.${inputToken.assetName}`;
    const outputAsset =
      outputToken.policyId === "" ? "lovelace" : `${outputToken.policyId}.${outputToken.assetName}`;

    const priceVal = activeTab === "STOP_LOSS" ? Number(stopPrice) : Number(targetPrice);
    const priceDen = 1_000_000;
    const priceNum = Math.round(priceVal * priceDen);

    const decimals = inputToken.decimals || 0;
    const rawAmount = BigInt(Math.round(Number(inputAmount) * 10 ** decimals));

    const body = {
      type: activeTab as "LIMIT" | "DCA" | "STOP_LOSS",
      inputAsset,
      outputAsset,
      inputAmount: rawAmount.toString(),
      priceNumerator: priceNum.toString(),
      priceDenominator: priceDen.toString(),
      ...(activeTab === "DCA"
        ? {
            totalBudget: rawAmount.toString(),
            amountPerInterval: BigInt(
              Math.round(Number(amountPerInterval) * 10 ** decimals),
            ).toString(),
            intervalSlots: Math.round(Number(intervalHours) * 3600 / 20),
          }
        : {}),
      deadline: deadlineMs,
      senderAddress: address,
      changeAddress,
    };

    await execute(
      () => createOrder(body),
      {
        buildingMsg: `Building ${activeTab.toLowerCase()} order...`,
        successMsg: `${activeTab} order placed successfully!`,
        action: "create_order",
        onSuccess: (txHash) => setTxResult(txHash),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Advanced Orders
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-60">
                Set limit orders, DCA schedules, or stop-loss protection.
                Orders are locked on-chain and executed by solvers when conditions are met.
              </p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Feature disabled banner */}
        {formDisabled && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Tính năng chưa sẵn sàng — Advanced orders are coming soon.</span>
          </div>
        )}

        {/* Feature warning toast (on submit attempt) */}
        {featureWarning && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive animate-in fade-in duration-200">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Tính năng chưa sẵn sàng — This feature is not available yet.</span>
          </div>
        )}

        {/* Tab selector */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => !formDisabled && setActiveTab(tab.key)}
              disabled={formDisabled}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                formDisabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Token selectors */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sell</label>
            <TokenButton
              token={inputToken}
              onClick={() => !formDisabled && setSelectingFor("input")}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Buy</label>
            <TokenButton
              token={outputToken}
              onClick={() => !formDisabled && setSelectingFor("output")}
            />
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {activeTab === "DCA" ? "Total Budget" : "Amount"}
          </label>
          <Input
            type="number"
            placeholder="0.00"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            className="text-right"
            disabled={formDisabled}
          />
        </div>

        {/* Price input (Limit / StopLoss) */}
        {activeTab !== "DCA" && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              {activeTab === "LIMIT" ? "Target Price" : "Stop Price"}
              {currentPrice > 0 && (
                <span className="text-[10px]">
                  (Current: {formatAmount(currentPrice)})
                </span>
              )}
            </label>
            <Input
              type="number"
              placeholder={
                currentPrice > 0 ? formatAmount(currentPrice) : "0.00"
              }
              value={activeTab === "STOP_LOSS" ? stopPrice : targetPrice}
              onChange={(e) =>
                activeTab === "STOP_LOSS"
                  ? setStopPrice(e.target.value)
                  : setTargetPrice(e.target.value)
              }
              className="text-right"
              disabled={formDisabled}
            />
          </div>
        )}

        {/* DCA fields */}
        {activeTab === "DCA" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Amount Per Interval
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={amountPerInterval}
                onChange={(e) => setAmountPerInterval(e.target.value)}
                className="text-right"
                disabled={formDisabled}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Interval (hours)
              </label>
              <div className="flex gap-2">
                {["6", "12", "24", "48"].map((h) => (
                  <button
                    key={h}
                    onClick={() => !formDisabled && setIntervalHours(h)}
                    disabled={formDisabled}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                      intervalHours === h
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                      formDisabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Target Price (per unit)
              </label>
              <Input
                type="number"
                placeholder={currentPrice > 0 ? formatAmount(currentPrice) : "0.00"}
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="text-right"
                disabled={formDisabled}
              />
            </div>
          </>
        )}

        {/* Deadline */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Deadline
          </label>
          <div className="flex gap-2">
            {["1", "3", "7"].map((d) => (
              <button
                key={d}
                onClick={() => !formDisabled && setDeadline(d)}
                disabled={formDisabled}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                  deadline === d
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                  formDisabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        {inputAmount && Number(inputAmount) > 0 && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <Badge variant="outline" className="text-[10px]">
                {activeTab.replace("_", "-")}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span>
                {formatAmount(Number(inputAmount))} {inputToken.ticker}
              </span>
            </div>
            {activeTab === "DCA" && amountPerInterval && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Per Interval</span>
                <span>
                  {formatAmount(Number(amountPerInterval))} {inputToken.ticker} / {intervalHours}h
                </span>
              </div>
            )}
            {(targetPrice || stopPrice) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {activeTab === "STOP_LOSS" ? "Stop Price" : "Target Price"}
                </span>
                <span>
                  {formatAmount(Number(activeTab === "STOP_LOSS" ? stopPrice : targetPrice))} {outputToken.ticker}/{inputToken.ticker}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{deadline} day{deadline !== "1" ? "s" : ""}</span>
            </div>
          </div>
        )}

        {/* TX result */}
        {txResult && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-600">
            Order submitted!{" "}
            <a
              href={`https://preprod.cardanoscan.io/transaction/${txResult}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View TX
            </a>
          </div>
        )}

        {/* Submit */}
        {!isConnected ? (
          <WalletConnectDialog />
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={formDisabled || !inputAmount || Number(inputAmount) <= 0 || busy}
            onClick={handleSubmit}
          >
            {formDisabled ? (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Feature Not Available
              </>
            ) : busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Signing...
              </>
            ) : (
              `Place ${tabs.find((t) => t.key === activeTab)?.label} Order`
            )}
          </Button>
        )}
      </CardContent>

      {/* Token select dialog */}
      <TokenSelectDialog
        open={selectingFor !== null}
        onOpenChange={(open) => { if (!open) setSelectingFor(null); }}
        onSelect={(token) => {
          if (selectingFor === "input") setInputToken(token);
          else setOutputToken(token);
          setSelectingFor(null);
        }}
        excludeTicker={selectingFor === "input" ? outputToken.ticker : inputToken.ticker}
      />
      <TxToastContainer />
    </Card>
  );
}
