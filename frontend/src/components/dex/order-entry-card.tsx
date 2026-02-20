"use client";

import React, { useState, useMemo } from "react";
import {
  Target,
  TrendingDown,
  BarChart3,
  Loader2,
  Info,
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
} from "@/components/dex/token-select";
import { WalletConnectDialog } from "@/components/dex/wallet-connect-dialog";
import { useWallet } from "@/providers/wallet-provider";
import { TOKENS, type Token } from "@/lib/mock-data";
import type { NormalizedPool } from "@/lib/hooks";
import { createOrder, confirmTx } from "@/lib/api";
import { cn, formatAmount } from "@/lib/utils";
import { useTxToast } from "@/lib/tx-toast";

type OrderTab = "LIMIT" | "DCA" | "STOP_LOSS";

interface OrderEntryCardProps {
  pools?: NormalizedPool[];
}

export function OrderEntryCard({ pools }: OrderEntryCardProps) {
  const { isConnected, address, changeAddress, signAndSubmitTx } = useWallet();
  const { toast, TxToastContainer } = useTxToast();

  const [activeTab, setActiveTab] = useState<OrderTab>("LIMIT");
  const [inputToken, setInputToken] = useState<Token>(TOKENS.ADA);
  const [outputToken, setOutputToken] = useState<Token>(TOKENS.HOSKY);
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);

  // Calculate price from pool
  const pool = useMemo(() => {
    return (pools || []).find(
      (p) =>
        (p.assetA.ticker === inputToken.ticker && p.assetB.ticker === outputToken.ticker) ||
        (p.assetB.ticker === inputToken.ticker && p.assetA.ticker === outputToken.ticker),
    );
  }, [pools, inputToken.ticker, outputToken.ticker]);

  const currentPrice = useMemo(() => {
    if (!pool) return 0;
    const isForward = pool.assetA.ticker === inputToken.ticker;
    return isForward
      ? pool.reserveB / pool.reserveA
      : pool.reserveA / pool.reserveB;
  }, [pool, inputToken.ticker]);

  const tabs: { key: OrderTab; label: string; icon: React.ElementType }[] = [
    { key: "LIMIT", label: "Limit", icon: Target },
    { key: "DCA", label: "DCA", icon: BarChart3 },
    { key: "STOP_LOSS", label: "Stop-Loss", icon: TrendingDown },
  ];

  const handleSubmit = async () => {
    if (!address || !changeAddress || !inputAmount) return;
    setIsSubmitting(true);
    setTxResult(null);

    try {
      toast("building", `Building ${activeTab.toLowerCase()} order...`);
      const deadlineMs = Date.now() + Number(deadline) * 24 * 60 * 60 * 1000;
      const inputAsset =
        inputToken.policyId === "" ? "lovelace" : `${inputToken.policyId}.${inputToken.assetName}`;
      const outputAsset =
        outputToken.policyId === "" ? "lovelace" : `${outputToken.policyId}.${outputToken.assetName}`;

      // Parse price as rational number (multiply by 1e6 for precision)
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
              intervalSlots: Math.round(Number(intervalHours) * 3600 / 20), // ~20s per slot
            }
          : {}),
        deadline: deadlineMs,
        senderAddress: address,
        changeAddress,
      };

      const result = await createOrder(body);

      if (result.unsignedTx && signAndSubmitTx) {
        toast("signing", "Please sign the transaction in your wallet...");
        const txHash = await signAndSubmitTx(result.unsignedTx);
        if (txHash) {
          toast("submitting", "Submitting to the network...");
          await confirmTx({ txHash, action: "create_order" });
          toast("confirmed", `${activeTab} order placed successfully!`, txHash);
          setTxResult(txHash);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast("error", msg);
      console.error("Order creation failed:", err);
    } finally {
      setIsSubmitting(false);
    }
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
        {/* Tab selector */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
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
              onClick={() => setSelectingFor("input")}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Buy</label>
            <TokenButton
              token={outputToken}
              onClick={() => setSelectingFor("output")}
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
                    onClick={() => setIntervalHours(h)}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                      intervalHours === h
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
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
                onClick={() => setDeadline(d)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                  deadline === d
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
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
            disabled={!inputAmount || Number(inputAmount) <= 0 || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
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
