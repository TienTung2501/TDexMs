"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, CheckSquare, Square } from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import {
  getAdminPendingFees,
  buildCollectFees,
  type PendingFeeEntry,
} from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";
import { formatCompact } from "@/lib/utils";

export default function AdminRevenuePage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [fees, setFees] = useState<PendingFeeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAdminPendingFees()
      .then((data) => {
        const items = Array.isArray(data) ? data : [];
        setFees(items);
      })
      .catch((err) => {
        console.error('Failed to load pending fees:', err);
        setFees([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleSelect = (poolId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(poolId)) next.delete(poolId);
      else next.add(poolId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === fees.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(fees.map((f) => f.pool_id)));
    }
  };

  const selectedTotal = useMemo(
    () =>
      fees
        .filter((f) => selected.has(f.pool_id))
        .reduce((sum, f) => sum + f.pending_fees.total_usd_value, 0),
    [fees, selected]
  );

  const handleCollect = async () => {
    if (!address || selected.size === 0) return;

    await execute(
      () =>
        buildCollectFees({
          admin_address: address,
          pool_ids: Array.from(selected),
        }),
      {
        buildingMsg: `Building batch fee collection for ${selected.size} pool(s)...`,
        successMsg: `Collected fees from ${selected.size} pool(s)!`,
        action: "collect_fees",
        onSuccess: () => {
          setSelected(new Set());
          // Refresh data
          getAdminPendingFees()
            .then((data) => setFees(Array.isArray(data) ? data : []))
            .catch(() => {});
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue & Fees</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Harvest pending protocol fees from active pools.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Pending Fees
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : fees.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No pending fees to collect.
            </p>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <button onClick={toggleAll} className="cursor-pointer">
                  {selected.size === fees.length ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <div className="flex-1">Pool Pair</div>
                <div className="w-32 text-right">Fee Asset A</div>
                <div className="w-32 text-right">Fee Asset B</div>
                <div className="w-24 text-right">USD Value</div>
              </div>

              {/* Rows */}
              {fees.map((fee) => (
                <button
                  key={fee.pool_id}
                  onClick={() => toggleSelect(fee.pool_id)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg w-full text-left transition-colors cursor-pointer ${
                    selected.has(fee.pool_id)
                      ? "bg-primary/5 border border-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                >
                  {selected.has(fee.pool_id) ? (
                    <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{fee.pair}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                      {fee.pool_id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="w-32 text-right text-sm font-mono">
                    {formatCompact(fee.pending_fees.asset_a_amount / 1e6)}
                  </div>
                  <div className="w-32 text-right text-sm font-mono">
                    {formatCompact(fee.pending_fees.asset_b_amount / 1e6)}
                  </div>
                  <div className="w-24 text-right">
                    <Badge variant="secondary" className="text-xs font-mono">
                      ${formatCompact(fee.pending_fees.total_usd_value)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 animate-in slide-in-from-bottom-4 fade-in">
          <span className="text-sm text-muted-foreground">
            Selected <strong className="text-foreground">{selected.size}</strong>{" "}
            pool{selected.size > 1 ? "s" : ""} |{" "}
            <span className="text-amber-500 font-semibold">
              ${formatCompact(selectedTotal)}
            </span>
          </span>
          <Button
            size="lg"
            disabled={busy}
            onClick={handleCollect}
            className="font-semibold"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Collecting...
              </>
            ) : (
              "Execute CollectFees"
            )}
          </Button>
        </div>
      )}

      <TxToastContainer />
    </div>
  );
}
