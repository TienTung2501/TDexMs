"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/providers/wallet-provider";
import { WalletConnectDialog } from "@/components/features/wallet/wallet-connect-dialog";
import { TokenIcon } from "@/components/ui/token-icon";
import type { NormalizedPool } from "@/lib/hooks";
import { depositLiquidity, withdrawLiquidity } from "@/lib/api";
import { formatAmount, formatCompact } from "@/lib/utils";
import { useTransaction } from "@/lib/hooks/use-transaction";

interface LiquidityFormProps {
  pool: NormalizedPool;
}

function lookupBalance(balances: Record<string, number>, ticker: string, policyId: string, assetName?: string): number {
  if (policyId && assetName) {
    const unit = `${policyId}${assetName}`;
    if (balances[unit] !== undefined) return balances[unit];
  }
  const upper = ticker.toUpperCase();
  const lower = ticker.toLowerCase();
  return balances[upper] ?? balances[lower] ?? balances[ticker] ?? 0;
}

export function LiquidityForm({ pool }: LiquidityFormProps) {
  const { isConnected, address, changeAddress, balances } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [withdrawPercent, setWithdrawPercent] = useState("");

  const userLpBalance = useMemo(() => {
    if (!pool.lpPolicyId || !pool.poolNftAssetName) return 0;
    const lpUnit = pool.lpPolicyId + pool.poolNftAssetName;
    return balances[lpUnit] ?? 0;
  }, [pool.lpPolicyId, pool.poolNftAssetName, balances]);

  const balanceA = useMemo(
    () => lookupBalance(balances, pool.assetA.ticker, pool.assetA.policyId, pool.assetA.assetName),
    [balances, pool.assetA]
  );
  const balanceB = useMemo(
    () => lookupBalance(balances, pool.assetB.ticker, pool.assetB.policyId, pool.assetB.assetName),
    [balances, pool.assetB]
  );

  const decimalsA = pool.assetA.decimals;
  const decimalsB = pool.assetB.decimals;
  const reserveAHuman = pool.reserveA / Math.pow(10, decimalsA);
  const reserveBHuman = pool.reserveB / Math.pow(10, decimalsB);

  const parsedA = parseFloat(amountA) || 0;
  const parsedB = parseFloat(amountB) || 0;
  const overBalanceA = isConnected && parsedA > 0 && parsedA > balanceA;
  const overBalanceB = isConnected && parsedB > 0 && parsedB > balanceB;
  const depositDisabled = !amountA || !amountB || busy || overBalanceA || overBalanceB;

  const handleAmountAChange = (val: string) => {
    setAmountA(val);
    if (val && parseFloat(val) > 0 && reserveAHuman > 0) {
      const ratio = reserveBHuman / reserveAHuman;
      setAmountB((parseFloat(val) * ratio).toFixed(6));
    } else {
      setAmountB("");
    }
  };

  const handleDeposit = useCallback(async () => {
    if (!address) return;
    const amountAUnits = String(Math.floor(parsedA * Math.pow(10, decimalsA)));
    const amountBUnits = String(Math.floor(parsedB * Math.pow(10, decimalsB)));
    await execute(
      () => depositLiquidity(pool.id, {
        amountA: amountAUnits,
        amountB: amountBUnits,
        minLpTokens: "0",
        senderAddress: address,
        changeAddress: changeAddress || address,
      }),
      {
        buildingMsg: "Building deposit transaction...",
        successMsg: `Deposited ${amountA} ${pool.assetA.ticker} + ${amountB} ${pool.assetB.ticker}`,
        action: "deposit",
        extractId: (res) => ({
          poolId: res.poolId || pool.id,
          newReserveA: res.newReserveA || "0",
          newReserveB: res.newReserveB || "0",
          newTotalLp: res.newTotalLp || "0",
        }),
        onSuccess: () => { setAmountA(""); setAmountB(""); },
      },
    );
  }, [pool, amountA, amountB, parsedA, parsedB, decimalsA, decimalsB, address, changeAddress, execute]);

  const handleWithdraw = useCallback(async () => {
    if (!address || !withdrawPercent) return;
    const lpToWithdraw = Math.floor(userLpBalance * (parseFloat(withdrawPercent) / 100)).toString();
    await execute(
      () => withdrawLiquidity(pool.id, {
        lpTokenAmount: lpToWithdraw,
        minAmountA: "0",
        minAmountB: "0",
        senderAddress: address,
        changeAddress: changeAddress || address,
      }),
      {
        buildingMsg: "Building withdrawal transaction...",
        successMsg: `Withdrew ${withdrawPercent}% of LP position`,
        action: "withdraw",
        extractId: (res) => ({
          poolId: res.poolId || pool.id,
          newReserveA: res.newReserveA || "0",
          newReserveB: res.newReserveB || "0",
          newTotalLp: res.newTotalLp || "0",
        }),
        onSuccess: () => setWithdrawPercent(""),
      },
    );
  }, [pool, userLpBalance, withdrawPercent, address, changeAddress, execute]);

  return (
    <>
      <TxToastContainer />
      <Tabs defaultValue="deposit" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">{pool.assetA.ticker} Amount</label>
                {isConnected && (
                  <button onClick={() => handleAmountAChange(balanceA.toString())} className="text-xs text-primary hover:text-primary/80 cursor-pointer transition-colors">
                    Balance: {formatAmount(balanceA)} {pool.assetA.ticker}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="0.00" value={amountA} onChange={(e) => handleAmountAChange(e.target.value)} className={`font-mono ${overBalanceA ? "border-destructive" : ""}`} />
                <div className="flex items-center gap-1 text-sm font-medium whitespace-nowrap"><TokenIcon token={pool.assetA} size="sm" />{pool.assetA.ticker}</div>
              </div>
              {overBalanceA && (<p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Insufficient {pool.assetA.ticker} — have {formatAmount(balanceA)}</p>)}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">{pool.assetB.ticker} Amount</label>
                {isConnected && (<span className="text-xs text-muted-foreground">Balance: {formatAmount(balanceB)} {pool.assetB.ticker}</span>)}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="0.00" value={amountB} onChange={(e) => setAmountB(e.target.value)} className={`font-mono ${overBalanceB ? "border-destructive" : ""}`} />
                <div className="flex items-center gap-1 text-sm font-medium whitespace-nowrap"><TokenIcon token={pool.assetB} size="sm" />{pool.assetB.ticker}</div>
              </div>
              {overBalanceB && (<p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Insufficient {pool.assetB.ticker} — have {formatAmount(balanceB)}</p>)}
            </div>
          </div>
          {isConnected && balanceA === 0 && balanceB === 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 text-xs">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>You have no {pool.assetA.ticker} or {pool.assetB.ticker} in your wallet. You need both tokens to provide liquidity.</span>
            </div>
          )}
          {amountA && amountB && (
            <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated LP tokens</span><span className="font-mono">{pool.totalLpTokens > 0 ? formatAmount(Math.min((parsedA / reserveAHuman) * pool.totalLpTokens, (parsedB / reserveBHuman) * pool.totalLpTokens)) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pool share</span><span className="font-mono">{reserveAHuman > 0 ? ((parsedA / (reserveAHuman + parsedA)) * 100).toFixed(4) : "—"}%</span></div>
            </div>
          )}
          {!isConnected ? (
            <div className="w-full"><WalletConnectDialog /></div>
          ) : (
            <Button variant="trade" className="w-full" disabled={depositDisabled} onClick={handleDeposit}>
              {busy ? (<><Loader2 className="h-4 w-4 animate-spin" />Depositing...</>) : overBalanceA || overBalanceB ? "Insufficient balance" : "Add Liquidity"}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="withdraw" className="space-y-4 mt-4">
          {isConnected && userLpBalance === 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 text-xs">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>You don&apos;t have any LP tokens for this pool. Deposit liquidity first to receive LP tokens.</span>
            </div>
          )}
          <div className="space-y-3">
            <label className="text-xs text-muted-foreground">
              Withdrawal Percentage{isConnected && userLpBalance > 0 && (<span className="text-primary ml-1 font-medium">(LP: {formatCompact(userLpBalance)})</span>)}
            </label>
            <Input type="number" placeholder="0" value={withdrawPercent} onChange={(e) => setWithdrawPercent(e.target.value)} className="font-mono text-xl h-14 text-center" min={0} max={100} />
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((pct) => (<Button key={pct} variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setWithdrawPercent(pct.toString())}>{pct}%</Button>))}
            </div>
          </div>
          {withdrawPercent && parseFloat(withdrawPercent) > 0 && (
            <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5 text-xs">
              {userLpBalance > 0 ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">LP tokens to burn</span><span className="font-mono">{formatCompact(Math.floor(userLpBalance * (parseFloat(withdrawPercent) / 100)))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Receive {pool.assetA.ticker}</span><span className="font-mono">~{formatCompact((reserveAHuman * userLpBalance * parseFloat(withdrawPercent)) / (100 * pool.totalLpTokens))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Receive {pool.assetB.ticker}</span><span className="font-mono">~{formatCompact((reserveBHuman * userLpBalance * parseFloat(withdrawPercent)) / (100 * pool.totalLpTokens))}</span></div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-1">No LP tokens found in wallet — deposit first</div>
              )}
            </div>
          )}
          {!isConnected ? (
            <div className="w-full"><WalletConnectDialog /></div>
          ) : (
            <Button variant="destructive" className="w-full" disabled={!withdrawPercent || parseFloat(withdrawPercent) <= 0 || userLpBalance === 0 || busy} onClick={handleWithdraw}>
              {busy ? (<><Loader2 className="h-4 w-4 animate-spin" />Withdrawing...</>) : userLpBalance === 0 ? "No LP tokens to withdraw" : "Remove Liquidity"}
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}