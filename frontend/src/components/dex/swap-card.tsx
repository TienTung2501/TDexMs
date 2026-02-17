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
} from "@/components/dex/token-select";
import { useWallet } from "@/providers/wallet-provider";
import { TOKENS, MOCK_POOLS, type Token } from "@/lib/mock-data";
import { cn, formatAmount } from "@/lib/utils";

interface SwapCardProps {
  inputToken?: Token;
  outputToken?: Token;
  onInputTokenChange?: (token: Token) => void;
  onOutputTokenChange?: (token: Token) => void;
}

export function SwapCard({
  inputToken: controlledInputToken,
  outputToken: controlledOutputToken,
  onInputTokenChange,
  onOutputTokenChange,
}: SwapCardProps = {}) {
  const { isConnected, balances, connect } = useWallet();

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
  const [isSwapping, setIsSwapping] = useState(false);

  // Find pool
  const pool = useMemo(() => {
    return MOCK_POOLS.find(
      (p) =>
        (p.assetA.ticker === inputToken.ticker &&
          p.assetB.ticker === outputToken.ticker) ||
        (p.assetB.ticker === inputToken.ticker &&
          p.assetA.ticker === outputToken.ticker)
    );
  }, [inputToken.ticker, outputToken.ticker]);

  // Calculate output
  const quote = useMemo(() => {
    if (!pool || !inputAmount || parseFloat(inputAmount) <= 0)
      return { output: 0, priceImpact: 0, fee: 0, rate: 0 };

    const amountIn = parseFloat(inputAmount);
    const isForward = pool.assetA.ticker === inputToken.ticker;
    const reserveIn = isForward ? pool.reserveA : pool.reserveB;
    const reserveOut = isForward ? pool.reserveB : pool.reserveA;

    const feeAmount = amountIn * (pool.feePercent / 100);
    const amountInAfterFee = amountIn - feeAmount;
    const output =
      (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
    const priceImpact = (amountInAfterFee / (reserveIn + amountInAfterFee)) * 100;
    const rate = output / amountIn;

    return { output, priceImpact, fee: feeAmount, rate };
  }, [pool, inputAmount, inputToken.ticker]);

  // Flip tokens
  const handleFlip = useCallback(() => {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount("");
  }, [inputToken, outputToken]);

  // Input balance
  const inputBalance = useMemo(() => {
    const raw = balances[inputToken.ticker] || 0;
    return inputToken.decimals > 0
      ? raw / Math.pow(10, inputToken.decimals)
      : raw;
  }, [balances, inputToken]);

  // Handle swap
  const handleSwap = useCallback(async () => {
    setIsSwapping(true);
    // Mock delay
    await new Promise((r) => setTimeout(r, 2000));
    setIsSwapping(false);
    setInputAmount("");
  }, []);

  // Price impact color
  const impactColor =
    quote.priceImpact > 5
      ? "text-destructive"
      : quote.priceImpact > 1
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
                className="flex-1 bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-semibold">
                {quote.output > 0 ? formatAmount(quote.output) : "0.00"}
              </div>
              <TokenButton
                token={outputToken}
                onClick={() => setSelectingFor("output")}
              />
            </div>
          </div>

          {/* Quote details */}
          {quote.output > 0 && (
            <div className="rounded-xl border border-border/50 p-3 space-y-2 text-xs">
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
                  {quote.priceImpact.toFixed(2)}%
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
                  {formatAmount(quote.output * (1 - slippage / 100))}{" "}
                  {outputToken.ticker}
                </span>
              </div>
            </div>
          )}

          {/* Swap button */}
          {!isConnected ? (
            <Button
              variant="trade"
              size="xl"
              className="w-full"
              onClick={connect}
            >
              Connect Wallet
            </Button>
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
              disabled={isSwapping}
            >
              {isSwapping ? (
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
    </>
  );
}
