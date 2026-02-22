"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  ArrowDownUp,
  Settings,
  Info,
  Loader2,
  ChevronDown,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { createIntent, getQuote, type QuoteResponse } from "@/lib/api";
import { cn, formatAmount } from "@/lib/utils";
import { useTransaction } from "@/lib/hooks/use-transaction";

interface SwapCardProps {
  inputToken?: Token;
  outputToken?: Token;
  onInputTokenChange?: (token: Token) => void;
  onOutputTokenChange?: (token: Token) => void;
  pools?: NormalizedPool[];
}

export function SwapCard({
  inputToken: controlledInputToken,
  outputToken: controlledOutputToken,
  onInputTokenChange,
  onOutputTokenChange,
  pools: externalPools,
}: SwapCardProps = {}) {
  const { isConnected, address, changeAddress, balances } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [internalInputToken, setInternalInputToken] = useState<Token>(TOKENS.ADA);
  const [internalOutputToken, setInternalOutputToken] = useState<Token>(TOKENS.HOSKY);
  
  const inputToken = controlledInputToken || internalInputToken;
  const outputToken = controlledOutputToken || internalOutputToken;
  
  const setInputToken = (token: Token) => {
    if (onInputTokenChange) {
      onInputTokenChange(token);
    } else {
      setInternalInputToken(token);
    }
  };
  
  const setOutputToken = (token: Token) => {
    if (onOutputTokenChange) {
      onOutputTokenChange(token);
    } else {
      setInternalOutputToken(token);
    }
  };
  const [inputAmount, setInputAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [selectingFor, setSelectingFor] = useState<"input" | "output" | null>(
    null
  );

  // Server-side quote (overrides local calculation when available)
  const [serverQuote, setServerQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);


  // Find pool — match by policyId (stable) then ticker as fallback
  const pool = useMemo(() => {
    const poolList = externalPools || [];
    const matchToken = (poolToken: { policyId: string; ticker?: string }, t: { policyId: string; ticker?: string }) =>
      poolToken.policyId === t.policyId ||
      (poolToken.ticker && t.ticker && poolToken.ticker.toUpperCase() === t.ticker.toUpperCase());
    return poolList.find(
      (p) =>
        (matchToken(p.assetA, inputToken) && matchToken(p.assetB, outputToken)) ||
        (matchToken(p.assetB, inputToken) && matchToken(p.assetA, outputToken))
    );
  }, [externalPools, inputToken, outputToken]);

  // Calculate output
  const quote = useMemo(() => {
    if (!pool || !inputAmount || parseFloat(inputAmount) <= 0)
      return { output: 0, priceImpact: 0, fee: 0, rate: 0 };

    // Reserves are stored in base units (lovelace for ADA, etc.).
    // Convert user input to base units so AMM arithmetic stays consistent.
    const inDecimals = inputToken.decimals ?? 0;
    const outDecimals = outputToken.decimals ?? 0;
    const amountInBase = parseFloat(inputAmount) * Math.pow(10, inDecimals);

    const isForward = pool.assetA.policyId === inputToken.policyId ||
      (pool.assetA.policyId === '' && inputToken.policyId === '' &&
        pool.assetA.ticker?.toUpperCase() === inputToken.ticker?.toUpperCase());
    const reserveIn = isForward ? pool.reserveA : pool.reserveB;
    const reserveOut = isForward ? pool.reserveB : pool.reserveA;

    const feeAmount = amountInBase * (pool.feePercent / 100);
    const amountInAfterFee = amountInBase - feeAmount;
    const outputBase = (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
    // Convert output back to human-readable units
    const output = outputBase / Math.pow(10, outDecimals);
    const priceImpact = (amountInAfterFee / (reserveIn + amountInAfterFee)) * 100;
    const rate = output / parseFloat(inputAmount);

    return { output, priceImpact, fee: feeAmount / Math.pow(10, inDecimals), rate };
  }, [pool, inputAmount, inputToken, outputToken]);

  // B8 fix: Fetch server-side quote with debounce (uses RouteOptimizer for multi-hop)
  useEffect(() => {
    setServerQuote(null);
    if (!inputAmount || parseFloat(inputAmount) <= 0) return;

    const inputAsset =
      inputToken.policyId === ""
        ? "lovelace"
        : `${inputToken.policyId}.${inputToken.assetName}`;
    const outputAsset =
      outputToken.policyId === ""
        ? "lovelace"
        : `${outputToken.policyId}.${outputToken.assetName}`;

    setQuoteLoading(true);
    const timer = setTimeout(() => {
      getQuote({
        inputAsset,
        outputAsset,
        inputAmount,
        slippage: String(Math.round(slippage * 100)),   // Convert % → basis points (0.5% → 50 BPS)
      })
        .then((q) => setServerQuote(q))
        .catch(() => setServerQuote(null))
        .finally(() => setQuoteLoading(false));
    }, 400); // 400ms debounce

    return () => {
      clearTimeout(timer);
      setQuoteLoading(false);
    };
  }, [inputAmount, inputToken, outputToken, slippage]);

  // Use server quote when available, fall back to local calculation
  const effectiveOutput = serverQuote
    ? parseFloat(serverQuote.outputAmount)
    : quote.output;
  const effectivePriceImpact = serverQuote
    ? serverQuote.priceImpact
    : quote.priceImpact;
  const effectiveMinOutput = serverQuote
    ? serverQuote.minOutput
    : String(Math.floor(quote.output * (1 - slippage / 100)));

  // Flip tokens
  const handleFlip = useCallback(() => {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount("");
  }, [inputToken, outputToken]);

  // Input balance — wallet-provider already returns human-readable amounts,
  // so no further unit conversion is needed here.
  const inputBalance = useMemo(() => {
    return (balances[inputToken.ticker] ?? balances[inputToken.ticker.toLowerCase()] ?? 0) as number;
  }, [balances, inputToken]);

  // Handle swap — submit intent to backend via centralized TX flow
  const handleSwap = useCallback(async () => {
    if (!pool || !address) return;

    const inputAsset =
      inputToken.policyId === ""
        ? "lovelace"
        : `${inputToken.policyId}.${inputToken.assetName}`;
    const outputAsset =
      outputToken.policyId === ""
        ? "lovelace"
        : `${outputToken.policyId}.${outputToken.assetName}`;

    // Convert to base units (lovelace for ADA) — backend expects positive integer string
    const inDecimals = inputToken.decimals ?? 0;
    const inputAmountBase = String(Math.round(parseFloat(inputAmount) * Math.pow(10, inDecimals)));

    // minOutput must also be in base units
    const outDecimals = outputToken.decimals ?? 0;
    let minOut: string;
    if (serverQuote) {
      // Server quote already returns base units
      minOut = serverQuote.minOutput;
    } else {
      const minOutHuman = quote.output * (1 - slippage / 100);
      minOut = String(Math.floor(minOutHuman * Math.pow(10, outDecimals)));
    }

    // Backend expects deadline as Unix timestamp in milliseconds (z.number().int().positive())
    const deadline = Date.now() + 30 * 60_000;

    await execute(
      () =>
        createIntent({
          senderAddress: address,
          inputAsset,
          inputAmount: inputAmountBase,
          outputAsset,
          minOutput: minOut,
          deadline,
          partialFill: false,
          changeAddress: changeAddress || address,
          ...(serverQuote?.quoteId ? { quoteId: serverQuote.quoteId } : {}),
        }),
      {
        buildingMsg: "Building swap transaction...",
        successMsg: `Swap submitted! ${inputAmount} ${inputToken.ticker} → ${outputToken.ticker}`,
        action: "create_intent",
        extractId: (res) => ({ intentId: res.intentId }),
        onSuccess: () => setInputAmount(""),
      },
    );
  }, [pool, address, changeAddress, inputToken, outputToken, inputAmount, quote, serverQuote, slippage, execute]);

  // Price impact color
  const impactColor =
    effectivePriceImpact > 5
      ? "text-destructive"
      : effectivePriceImpact > 1
      ? "text-yellow-500"
      : "text-primary";

  return (
    <>
      <Card className="w-full max-w-[480px] mx-auto">
        <CardContent className="p-5 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Swap</h2>
              <Badge variant="secondary" className="text-[10px]">
                <Zap className="h-3 w-3 mr-0.5" />
                Intent-Based
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          {/* Slippage settings */}
          {showSettings && (
            <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Slippage Tolerance
              </div>
              <div className="flex gap-2">
                {[0.1, 0.5, 1.0, 3.0].map((s) => (
                  <Button
                    key={s}
                    variant={slippage === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSlippage(s)}
                    className="flex-1 text-xs h-8"
                  >
                    {s}%
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input token */}
          <div className="rounded-xl bg-secondary/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">You pay</span>
              {isConnected && (
                <button
                  onClick={() =>
                    setInputAmount(inputBalance.toString())
                  }
                  className="text-xs text-primary hover:text-primary/80 cursor-pointer"
                >
                  Balance: {formatAmount(inputBalance)} {inputToken.ticker}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 w-full min-w-0 bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <TokenButton
                token={inputToken}
                onClick={() => setSelectingFor("input")}
              />
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center -my-1 relative z-10">
            <Button
              variant="outline"
              size="icon"
              onClick={handleFlip}
              className="rounded-full h-9 w-9 border-2 bg-background shadow-md hover:rotate-180 transition-transform duration-300"
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </div>

          {/* Output token */}
          <div className="rounded-xl bg-secondary/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">You receive</span>
              {quoteLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-semibold">
                {effectiveOutput > 0 ? formatAmount(effectiveOutput) : "0.00"}
              </div>
              <TokenButton
                token={outputToken}
                onClick={() => setSelectingFor("output")}
              />
            </div>
          </div>

          {/* Quote details */}
          {effectiveOutput > 0 && (
            <div className="rounded-xl border border-border/50 p-3 space-y-2 text-xs">
              {serverQuote && (
                <div className="flex items-center gap-1 text-primary mb-1">
                  <Zap className="h-3 w-3" />
                  <span className="text-[10px]">
                    {serverQuote.route.length > 1 ? `Multi-hop (${serverQuote.route.length} hops)` : "Direct route"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  Rate
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Exchange rate based on current pool reserves
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span className="font-mono">
                  1 {inputToken.ticker} = {formatAmount(quote.rate)}{" "}
                  {outputToken.ticker}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Price Impact</span>
                <span className={cn("font-mono", impactColor)}>
                  {effectivePriceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fee ({pool?.feePercent}%)</span>
                <span className="font-mono">
                  {formatAmount(quote.fee)} {inputToken.ticker}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Min. received</span>
                <span className="font-mono">
                  {formatAmount(parseFloat(effectiveMinOutput))}{" "}
                  {outputToken.ticker}
                </span>
              </div>
            </div>
          )}

          {/* Swap button */}
          {!isConnected ? (
            <div className="w-full">
              <WalletConnectDialog />
            </div>
          ) : !inputAmount || parseFloat(inputAmount) <= 0 ? (
            <Button variant="trade" size="xl" className="w-full" disabled>
              Enter an amount
            </Button>
          ) : !pool ? (
            <Button variant="trade" size="xl" className="w-full" disabled>
              No pool available
            </Button>
          ) : parseFloat(inputAmount) > inputBalance ? (
            <Button
              variant="destructive"
              size="xl"
              className="w-full"
              disabled
            >
              Insufficient {inputToken.ticker} balance
            </Button>
          ) : (
            <Button
              variant="trade"
              size="xl"
              className="w-full"
              onClick={handleSwap}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Submitting Intent...
                </>
              ) : (
                <>Swap {inputToken.ticker} → {outputToken.ticker}</>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Token select dialog */}
      <TokenSelectDialog
        open={!!selectingFor}
        onOpenChange={() => setSelectingFor(null)}
        onSelect={(token) => {
          if (selectingFor === "input") setInputToken(token);
          else setOutputToken(token);
        }}
        excludeTicker={
          selectingFor === "input" ? outputToken.ticker : inputToken.ticker
        }
        balances={balances}
      />
      <TxToastContainer />
    </>
  );
}
