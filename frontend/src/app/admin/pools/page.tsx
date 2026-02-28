"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Layers,
  Search,
  RefreshCw,
  Flame,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import {
  getAdminPoolList,
  buildBurnPoolNFT,
  type AdminPoolEntry,
} from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";
import { formatCompact } from "@/lib/utils";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="Copy">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function AdminPoolManagementPage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [pools, setPools] = useState<AdminPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Burn modal state
  const [burnPool, setBurnPool] = useState<AdminPoolEntry | null>(null);
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Detail panel
  const [selectedPool, setSelectedPool] = useState<AdminPoolEntry | null>(null);

  const fetchPools = useCallback(async () => {
    try {
      const data = await getAdminPoolList();
      setPools(data.pools);
    } catch {
      setPools([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPools();
  };

  const filteredPools = useMemo(() => {
    if (!searchQuery) return pools;
    const q = searchQuery.toLowerCase();
    return pools.filter(
      (p) =>
        p.asset_a.asset_name.toLowerCase().includes(q) ||
        p.asset_b.asset_name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        `${p.asset_a.asset_name}/${p.asset_b.asset_name}`.toLowerCase().includes(q)
    );
  }, [pools, searchQuery]);

  const pairName = (p: AdminPoolEntry) =>
    `${p.asset_a.asset_name || "ADA"}/${p.asset_b.asset_name || "ADA"}`;

  const burnRequiredText = burnPool
    ? `BURN-${pairName(burnPool).replace("/", "-")}`
    : "";
  const canBurn = confirmText === burnRequiredText;

  const handleBurnClick = (pool: AdminPoolEntry) => {
    setBurnPool(pool);
    setConfirmText("");
    setShowBurnModal(true);
  };

  const handleExecuteBurn = async () => {
    if (!address || !burnPool || !canBurn) return;
    setShowBurnModal(false);

    await execute(
      () =>
        buildBurnPoolNFT({
          admin_address: address,
          pool_id: burnPool.id,
        }),
      {
        buildingMsg: `Building BurnPoolNFT for ${pairName(burnPool)}...`,
        successMsg: `Pool ${pairName(burnPool)} has been destroyed!`,
        action: "burn_pool_nft",
        onSuccess: () => {
          setBurnPool(null);
          setSelectedPool(null);
          fetchPools();
        },
      }
    );
  };

  // Summary stats
  const totalTvl = pools.reduce((sum, p) => sum + Number(p.tvl_ada), 0);
  const totalVol = pools.reduce((sum, p) => sum + Number(p.volume_24h), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Pool Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View all protocol pools, inspect details, and manage lifecycle.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10">
                <Layers className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Pools</p>
                <p className="text-lg font-bold">{loading ? "—" : pools.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total TVL</p>
                <p className="text-lg font-bold">{loading ? "—" : `${formatCompact(totalTvl / 1e6)} ADA`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Volume</p>
                <p className="text-lg font-bold">{loading ? "—" : `${formatCompact(totalVol / 1e6)} ADA`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Pool List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">All Pools</CardTitle>
            <Badge variant="outline" className="text-[10px]">{filteredPools.length} found</Badge>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by pair name, pool ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filteredPools.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {pools.length === 0 ? "No pools found in the system." : "No pools match your search."}
            </p>
          ) : (
            <div className="space-y-1">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_100px_100px_80px_80px_80px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <span>Pair</span>
                <span className="text-right">Reserve A</span>
                <span className="text-right">Reserve B</span>
                <span className="text-right">TVL (ADA)</span>
                <span className="text-right">Vol 24h</span>
                <span className="text-center">Actions</span>
              </div>

              {/* Pool Rows */}
              {filteredPools.map((pool) => (
                <div
                  key={pool.id}
                  className={`grid grid-cols-[1fr_100px_100px_80px_80px_80px] gap-2 px-3 py-3 rounded-lg items-center transition-colors cursor-pointer ${
                    selectedPool?.id === pool.id
                      ? "bg-primary/5 border border-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedPool(selectedPool?.id === pool.id ? null : pool)}
                >
                  <div>
                    <span className="text-sm font-semibold">{pairName(pool)}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                      {pool.id.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-right text-sm font-mono">
                    {formatCompact(Number(pool.reserve_a) / 1e6)}
                  </span>
                  <span className="text-right text-sm font-mono">
                    {formatCompact(Number(pool.reserve_b) / 1e6)}
                  </span>
                  <span className="text-right text-sm font-mono">
                    {formatCompact(Number(pool.tvl_ada) / 1e6)}
                  </span>
                  <span className="text-right text-sm font-mono">
                    {formatCompact(Number(pool.volume_24h) / 1e6)}
                  </span>
                  <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleBurnClick(pool)}
                      disabled={busy}
                    >
                      <Flame className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pool Detail Panel */}
      {selectedPool && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Pool Detail — {pairName(selectedPool)}
              <Badge variant="outline" className="text-[10px] ml-auto">
                Fee: {selectedPool.fee_numerator}/10000
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pool ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs truncate max-w-[200px]">{selectedPool.id}</span>
                    <CopyBtn text={selectedPool.id} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Asset A Policy</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {selectedPool.asset_a.policy_id || "lovelace"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Asset B Policy</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {selectedPool.asset_b.policy_id || "lovelace"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">UTxO Ref</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {selectedPool.utxo_ref || "—"}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reserve A</span>
                  <span className="font-mono">{Number(selectedPool.reserve_a).toLocaleString()} lovelace</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reserve B</span>
                  <span className="font-mono">{Number(selectedPool.reserve_b).toLocaleString()} lovelace</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">TVL</span>
                  <span className="font-mono">{(Number(selectedPool.tvl_ada) / 1e6).toFixed(2)} ADA</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{selectedPool.created_at ? new Date(selectedPool.created_at).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleBurnClick(selectedPool)}
                disabled={busy}
              >
                <Flame className="h-3.5 w-3.5 mr-1.5" />
                Burn Pool NFT
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Burn Confirmation Modal */}
      <Dialog open={showBurnModal} onOpenChange={setShowBurnModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Pool Destruction
            </DialogTitle>
            <DialogDescription>
              This will permanently close the{" "}
              <strong>{burnPool ? pairName(burnPool) : ""}</strong> pool and burn its Pool NFT.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm text-destructive">
                Type exactly:{" "}
                <strong className="font-mono">{burnRequiredText}</strong>
              </p>
            </div>

            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={burnRequiredText}
              className="font-mono"
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBurnModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleExecuteBurn}
                disabled={!canBurn || busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Flame className="h-4 w-4 mr-2" />
                )}
                Destroy Pool
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TxToastContainer />
    </div>
  );
}
