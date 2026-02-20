"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Flame,
  Loader2,
  Search,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import { buildBurnPoolNFT } from "@/lib/api";
import { usePools, type NormalizedPool } from "@/lib/hooks";
import { useTransaction } from "@/lib/hooks/use-transaction";

export default function AdminDangerZonePage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();
  const { pools } = usePools();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const filteredPools = useMemo(() => {
    if (!pools || !searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return pools.filter(
      (p: NormalizedPool) =>
        p.assetA.ticker.toLowerCase().includes(q) ||
        p.assetB.ticker.toLowerCase().includes(q) ||
        `${p.assetA.ticker}/${p.assetB.ticker}`.toLowerCase().includes(q)
    );
  }, [pools, searchQuery]);

  const requiredConfirmText = `BURN-${selectedPair.replace("/", "-")}`;
  const canExecute = confirmText === requiredConfirmText;

  const handleSelectPool = (poolId: string, pair: string) => {
    setSelectedPoolId(poolId);
    setSelectedPair(pair);
  };

  const handleDeleteClick = () => {
    if (!selectedPoolId) return;
    setConfirmText("");
    setShowConfirmModal(true);
  };

  const handleExecuteBurn = async () => {
    if (!address || !selectedPoolId || !canExecute) return;

    setShowConfirmModal(false);

    await execute(
      () =>
        buildBurnPoolNFT({
          admin_address: address,
          pool_id: selectedPoolId,
        }),
      {
        buildingMsg: `Building BurnPoolNFT transaction for ${selectedPair}...`,
        successMsg: `Pool ${selectedPair} has been permanently destroyed!`,
        action: "burn_pool_nft",
        onSuccess: () => {
          setSelectedPoolId(null);
          setSelectedPair("");
          setSearchQuery("");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-destructive">Danger Zone</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Emergency operations — permanently destroy pools. These actions cannot
          be undone.
        </p>
      </div>

      {/* Warning banner */}
      <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-6">
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Flame className="h-5 w-5" />
              Burn Pool NFT
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Permanently close a pool by burning its Pool NFT. This withdraws
              any remaining assets and destroys the pool forever. LP token
              holders will lose their position.
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pool pair (e.g. ADA/SNEK)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Search results */}
            {filteredPools.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {filteredPools.map((pool) => {
                  const pair = `${pool.assetA.ticker}/${pool.assetB.ticker}`;
                  const isSelected = selectedPoolId === pool.id;
                  return (
                    <button
                      key={pool.id}
                      onClick={() => handleSelectPool(pool.id, pair)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors cursor-pointer ${
                        isSelected ? "bg-destructive/5" : ""
                      }`}
                    >
                      <span className="font-semibold">{pair}</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {pool.id.slice(0, 12)}...
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected pool */}
            {selectedPoolId && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="text-sm">
                  Selected:{" "}
                  <strong className="text-destructive">{selectedPair}</strong>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteClick}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                      Delete Pool
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* High-Friction Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Pool Destruction
            </DialogTitle>
            <DialogDescription>
              This action will permanently close the{" "}
              <strong>{selectedPair}</strong> pool and burn its Pool NFT. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm text-destructive">
                To continue, type exactly:{" "}
                <strong className="font-mono">{requiredConfirmText}</strong>
              </p>
            </div>

            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={requiredConfirmText}
              className="font-mono text-center"
              autoFocus
            />

            <Button
              variant="destructive"
              className="w-full"
              disabled={!canExecute || busy}
              onClick={handleExecuteBurn}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Burning...
                </>
              ) : (
                <>
                  <Flame className="h-4 w-4 mr-2" />
                  Execute BurnPoolNFT
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TxToastContainer />
    </div>
  );
}
