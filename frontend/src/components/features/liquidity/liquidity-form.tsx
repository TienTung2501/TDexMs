"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
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

export function LiquidityForm({ pool }: LiquidityFormProps) {
  const { isConnected, address, changeAddress, balances } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [withdrawPercent, setWithdrawPercent] = useState("");

  // Look up user's LP token balance from wallet
  const userLpBalance = useMemo(() => {
    if (!pool.lpPolicyId || !pool.poolNftAssetName) return 0;
    const lpUnit = pool.lpPolicyId + pool.poolNftAssetName;
    // Check both raw unit key and known token entries
    return balances[lpUnit] ?? 0;
  }, [pool.lpPolicyId, pool.poolNftAssetName, balances]);

  const decimalsA = pool.assetA.decimals;
  const decimalsB = pool.assetB.decimals;

  // Human-readable reserves
  const reserveAHuman = pool.reserveA / Math.pow(10, decimalsA);
  const reserveBHuman = pool.reserveB / Math.pow(10, decimalsB);

  // Auto-calculate proportional amount (both in human-readable units)
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

    await execute(
      () =>
        depositLiquidity(pool.id, {
          amountA: amountA,
          amountB: amountB,
          minLpTokens: "0",
          senderAddress: address,
          changeAddress: changeAddress || address,
        }),
      {
        buildingMsg: "Building deposit transaction...",
        successMsg: `Deposited ${amountA} ${pool.assetA.ticker} + ${amountB} ${pool.assetB.ticker}`,
        action: "deposit",
        onSuccess: () => {
          setAmountA("");
          setAmountB("");
        },
      },
    );
  }, [pool.id, pool.assetA.ticker, pool.assetB.ticker, amountA, amountB, address, changeAddress, execute]);

  const handleWithdraw = useCallback(async () => {
    if (!address || !withdrawPercent) return;

    // Use user's LP balance, not total pool LP tokens
    const lpToWithdraw = Math.floor(
      userLpBalance * (parseFloat(withdrawPercent) / 100)
    ).toString();

    await execute(
      () =>
        withdrawLiquidity(pool.id, {
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
        onSuccess: () => setWithdrawPercent(""),
      },
    );
  }, [pool.id, userLpBalance, withdrawPercent, address, changeAddress, execute]);

  return (
    <Tabs defaultValue="deposit" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="deposit" className="flex-1">
          Deposit
        </TabsTrigger>
        <TabsTrigger value="withdraw" className="flex-1">
          Withdraw
        </TabsTrigger>
      </TabsList>

      <TabsContent value="deposit" className="space-y-4 mt-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {pool.assetA.ticker} Amount
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="0.00"
                value={amountA}
                onChange={(e) => handleAmountAChange(e.target.value)}
                className="font-mono"
              />
              <div className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
                <TokenIcon token={pool.assetA} size="sm" />
                {pool.assetA.ticker}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {pool.assetB.ticker} Amount
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="0.00"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                className="font-mono"
              />
              <div className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
                <TokenIcon token={pool.assetB} size="sm" />
                {pool.assetB.ticker}
              </div>
            </div>
          </div>
        </div>

        {amountA && amountB && (
          <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimated LP tokens</span>
              <span className="font-mono">
                {formatAmount(
                  Math.min(
                    (parseFloat(amountA) / reserveAHuman) * pool.totalLpTokens,
                    (parseFloat(amountB) / reserveBHuman) * pool.totalLpTokens
                  )
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pool share</span>
              <span className="font-mono">
                {(
                  (parseFloat(amountA) / (reserveAHuman + parseFloat(amountA))) *
                  100
                ).toFixed(4)}
                %
              </span>
            </div>
          </div>
        )}

        {!isConnected ? (
          <div className="w-full">
            <WalletConnectDialog />
          </div>
        ) : (
          <Button
            variant="trade"
            className="w-full"
            disabled={!amountA || !amountB || busy}
            onClick={handleDeposit}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Depositing...
              </>
            ) : (
              "Add Liquidity"
            )}
          </Button>
        )}
      </TabsContent>

      <TabsContent value="withdraw" className="space-y-4 mt-4">
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground">
            Withdrawal Percentage
          </label>
          <Input
            type="number"
            placeholder="0"
            value={withdrawPercent}
            onChange={(e) => setWithdrawPercent(e.target.value)}
            className="font-mono text-xl h-14 text-center"
            min={0}
            max={100}
          />
          <div className="flex gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <Button
                key={pct}
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setWithdrawPercent(pct.toString())}
              >
                {pct}%
              </Button>
            ))}
          </div>
        </div>

        {withdrawPercent && parseFloat(withdrawPercent) > 0 && (
          <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5 text-xs">
            {userLpBalance > 0 ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your LP tokens</span>
                  <span className="font-mono">{formatCompact(userLpBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Receive {pool.assetA.ticker}
                  </span>
                  <span className="font-mono">
                    ~{formatCompact(
                      (reserveAHuman * userLpBalance * parseFloat(withdrawPercent)) /
                        (100 * pool.totalLpTokens)
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Receive {pool.assetB.ticker}
                  </span>
                  <span className="font-mono">
                    ~{formatCompact(
                      (reserveBHuman * userLpBalance * parseFloat(withdrawPercent)) /
                        (100 * pool.totalLpTokens)
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-1">
                No LP tokens found in wallet
              </div>
            )}
          </div>
        )}

        {!isConnected ? (
          <div className="w-full">
            <WalletConnectDialog />
          </div>
        ) : (
          <Button
            variant="destructive"
            className="w-full"
            disabled={
              !withdrawPercent || parseFloat(withdrawPercent) <= 0 || busy
            }
            onClick={handleWithdraw}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Withdrawing...
              </>
            ) : (
              "Remove Liquidity"
            )}
          </Button>
        )}
      </TabsContent>
      <TxToastContainer />
    </Tabs>
  );
}
