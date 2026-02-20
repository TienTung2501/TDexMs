"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TokenIcon } from "@/components/ui/token-icon";
import { TokenSelectDialog } from "@/components/dex/token-select";
import { TOKENS, TOKEN_LIST, type Token } from "@/lib/mock-data";
import { useWallet } from "@/providers/wallet-provider";
import { createPool } from "@/lib/api";
import { useTxToast } from "@/lib/tx-toast";
import { confirmTx } from "@/lib/api";
import {
  Plus,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Info,
} from "lucide-react";

export default function CreatePoolPage() {
  const router = useRouter();
  const { isConnected, address, signAndSubmitTx } = useWallet();
  const { toast, TxToastContainer } = useTxToast();

  const [tokenA, setTokenA] = useState<Token>(TOKENS.ADA);
  const [tokenB, setTokenB] = useState<Token | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [feeRate, setFeeRate] = useState("0.3");
  const [submitting, setSubmitting] = useState(false);
  const [showTokenSelectA, setShowTokenSelectA] = useState(false);
  const [showTokenSelectB, setShowTokenSelectB] = useState(false);

  const feeNumerator = useMemo(() => {
    const pct = parseFloat(feeRate);
    if (isNaN(pct) || pct <= 0 || pct > 3) return 30; // default 0.3%
    return Math.round(pct * 100);
  }, [feeRate]);

  const canSubmit = useMemo(() => {
    if (!isConnected || !tokenB) return false;
    if (!amountA || !amountB) return false;
    const a = parseFloat(amountA);
    const b = parseFloat(amountB);
    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) return false;
    if (tokenA.ticker === tokenB.ticker) return false;
    return true;
  }, [isConnected, tokenA, tokenB, amountA, amountB]);

  const initialPrice = useMemo(() => {
    if (!amountA || !amountB) return null;
    const a = parseFloat(amountA);
    const b = parseFloat(amountB);
    if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) return null;
    return { aPerB: (a / b).toFixed(6), bPerA: (b / a).toFixed(6) };
  }, [amountA, amountB]);

  function toSmallestUnit(amount: string, decimals: number): string {
    const n = parseFloat(amount);
    return Math.floor(n * Math.pow(10, decimals)).toString();
  }

  function assetId(token: Token): string {
    if (!token.policyId) return "lovelace";
    return `${token.policyId}.${token.assetName}`;
  }

  async function handleCreatePool() {
    if (!canSubmit || !tokenB || !address) return;
    setSubmitting(true);

    try {
      toast("building", "Building pool creation transaction...");

      const result = await createPool({
        assetA: assetId(tokenA),
        assetB: assetId(tokenB),
        initialAmountA: toSmallestUnit(amountA, tokenA.decimals),
        initialAmountB: toSmallestUnit(amountB, tokenB.decimals),
        feeNumerator,
        creatorAddress: address,
        changeAddress: address,
      });

      if (result.unsignedTx) {
        toast("signing", "Please sign the transaction in your wallet...");
        const txHash = await signAndSubmitTx(result.unsignedTx);
        if (txHash) {
          toast("submitting", "Submitting to the network...");
          await confirmTx({ txHash, action: "create_pool" }).catch(() => {});
          toast("confirmed", `Pool created! TX: ${txHash.slice(0, 16)}...`, txHash);
        }
      } else {
        toast("confirmed", `Pool created! ID: ${result.poolId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast("error", msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shell py-8">
      <TxToastContainer />
      {/* Back button */}
      <button
        onClick={() => router.push("/pools")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pools
      </button>

      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Create a New Pool</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Provide initial liquidity for a new trading pair. You will receive LP tokens
            representing your share of the pool.
          </p>
        </div>

        {/* Token Pair Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Trading Pair</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Token A */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Token A</label>
                <button
                  onClick={() => setShowTokenSelectA(true)}
                  className="w-full flex items-center gap-2 h-12 px-3 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <TokenIcon token={tokenA} size="sm" />
                  <span className="font-semibold">{tokenA.ticker}</span>
                </button>
              </div>

              {/* Token B */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Token B</label>
                <button
                  onClick={() => setShowTokenSelectB(true)}
                  className="w-full flex items-center gap-2 h-12 px-3 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  {tokenB ? (
                    <>
                      <TokenIcon token={tokenB} size="sm" />
                      <span className="font-semibold">{tokenB.ticker}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Select token</span>
                  )}
                </button>
              </div>
            </div>

            {tokenA.ticker === tokenB?.ticker && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Tokens must be different
              </div>
            )}
          </CardContent>
        </Card>

        {/* Initial Liquidity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Initial Liquidity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Amount A */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <TokenIcon token={tokenA} size="xs" />
                {tokenA.ticker} Amount
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
                className="h-12 text-lg font-mono"
              />
            </div>

            {/* Amount B */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                {tokenB ? (
                  <>
                    <TokenIcon token={tokenB} size="xs" />
                    {tokenB.ticker} Amount
                  </>
                ) : (
                  "Token B Amount"
                )}
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                className="h-12 text-lg font-mono"
                disabled={!tokenB}
              />
            </div>

            {/* Initial Price */}
            {initialPrice && tokenB && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  Initial price:
                </div>
                <div className="font-mono text-xs">
                  1 {tokenA.ticker} = {initialPrice.bPerA} {tokenB.ticker}
                </div>
                <div className="font-mono text-xs">
                  1 {tokenB.ticker} = {initialPrice.aPerB} {tokenA.ticker}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fee Rate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Swap Fee Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {["0.1", "0.3", "0.5", "1.0"].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setFeeRate(rate)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    feeRate === rate
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Fee charged on each swap. Higher fees = more LP revenue but less volume.
              0.3% is recommended for most pairs.
            </p>
          </CardContent>
        </Card>

        {/* Summary */}
        {canSubmit && tokenB && (
          <Card className="border-primary/30">
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pair</span>
                  <span className="font-semibold">{tokenA.ticker} / {tokenB.ticker}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tokenA.ticker} Deposit</span>
                  <span className="font-mono">{amountA}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tokenB.ticker} Deposit</span>
                  <span className="font-mono">{amountB}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee Rate</span>
                  <span>{feeRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <Button
          variant="trade"
          size="xl"
          className="w-full"
          disabled={!canSubmit || submitting}
          onClick={handleCreatePool}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Creating Pool...
            </>
          ) : !isConnected ? (
            "Connect Wallet"
          ) : !tokenB ? (
            "Select Token B"
          ) : !amountA || !amountB ? (
            "Enter Amounts"
          ) : (
            <>
              <Plus className="h-5 w-5 mr-1" />
              Create Pool
            </>
          )}
        </Button>
      </div>

      {/* Token Select Dialogs */}
      <TokenSelectDialog
        open={showTokenSelectA}
        onOpenChange={setShowTokenSelectA}
        onSelect={(t) => {
          setTokenA(t);
          setShowTokenSelectA(false);
        }}
        excludeTicker={tokenB?.ticker}
      />
      <TokenSelectDialog
        open={showTokenSelectB}
        onOpenChange={setShowTokenSelectB}
        onSelect={(t) => {
          setTokenB(t);
          setShowTokenSelectB(false);
        }}
        excludeTicker={tokenA.ticker}
      />
    </div>
  );
}
