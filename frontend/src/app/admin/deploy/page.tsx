"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Rocket, Shield, AlertTriangle, Info } from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import {
  buildDeploySettings,
  getAdminSettings,
  type AdminSettings,
} from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";

export default function AdminDeployPage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Form fields
  const [protocolFeeBps, setProtocolFeeBps] = useState("30");
  const [minPoolLiquidity, setMinPoolLiquidity] = useState("1000000");
  const [feeCollectorAddress, setFeeCollectorAddress] = useState("");

  useEffect(() => {
    getAdminSettings()
      .then((data) => {
        setSettings(data);
        setProtocolFeeBps(String(data.global_settings.max_protocol_fee_bps));
        setMinPoolLiquidity(String(data.global_settings.min_pool_liquidity));
      })
      .catch(() => {
        // Settings not yet deployed on-chain — fresh deploy scenario
        setSettings(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const isDeployed = settings !== null;
  const feeBps = Number(protocolFeeBps);
  const validFeeBps = !isNaN(feeBps) && feeBps >= 0 && feeBps <= 10_000;
  const minLiquidity = Number(minPoolLiquidity);
  const validMinLiquidity = !isNaN(minLiquidity) && minLiquidity >= 0;
  const canDeploy = address && validFeeBps && validMinLiquidity && !busy;

  const handleDeploy = async () => {
    if (!address) return;
    await execute(
      () =>
        buildDeploySettings({
          admin_address: address,
          protocol_fee_bps: feeBps,
          min_pool_liquidity: minLiquidity,
          ...(feeCollectorAddress ? { fee_collector_address: feeCollectorAddress } : {}),
        }),
      {
        buildingMsg: "Building initial settings deployment TX...",
        successMsg: "Protocol settings deployed on-chain!",
        action: "deploy_settings",
        onSuccess: () => {
          getAdminSettings()
            .then(setSettings)
            .catch(() => {});
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" />
          Deploy Protocol Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bootstrap the on-chain settings UTXO for the first time, or re-deploy
          after a factory reset. This mints the Settings NFT and sets initial
          protocol parameters.
        </p>
      </div>

      {/* Current status */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {loading ? (
            <Skeleton className="h-6 w-48" />
          ) : isDeployed ? (
            <div className="flex items-center gap-3 text-emerald-600">
              <Shield className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Settings already deployed on-chain</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Protocol v{settings.global_settings.current_version} ·{" "}
                  Fee {settings.global_settings.max_protocol_fee_bps} bps ·{" "}
                  Min liquidity {settings.global_settings.min_pool_liquidity.toLocaleString()} lovelace
                </p>
              </div>
              <Badge variant="success" className="ml-auto text-xs">
                LIVE
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Settings not yet deployed</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No on-chain settings UTxO found. Deploy to activate the protocol.
                </p>
              </div>
              <Badge variant="warning" className="ml-auto text-xs">
                PENDING
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deploy form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Initial Protocol Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Protocol fee */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              Protocol Fee
              <span className="text-[11px] text-muted-foreground font-normal">
                (basis points — 30 = 0.30%)
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={protocolFeeBps}
                onChange={(e) => setProtocolFeeBps(e.target.value)}
                className={`flex-1 ${!validFeeBps ? "border-destructive" : ""}`}
                placeholder="30"
              />
              <span className="text-sm text-muted-foreground w-20 text-right">
                {validFeeBps ? `${(feeBps / 100).toFixed(2)}%` : "—"}
              </span>
            </div>
            {!validFeeBps && (
              <p className="text-xs text-destructive">Must be 0–10000</p>
            )}
          </div>

          {/* Min pool liquidity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              Minimum Pool Liquidity
              <span className="text-[11px] text-muted-foreground font-normal">
                (lovelace)
              </span>
            </label>
            <Input
              type="number"
              min={0}
              value={minPoolLiquidity}
              onChange={(e) => setMinPoolLiquidity(e.target.value)}
              className={!validMinLiquidity ? "border-destructive" : ""}
              placeholder="1000000"
            />
            <p className="text-[11px] text-muted-foreground">
              ≈ {validMinLiquidity ? (minLiquidity / 1_000_000).toFixed(2) : "—"} ADA
            </p>
          </div>

          {/* Fee collector address (optional) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              Fee Collector Address
              <span className="text-[11px] text-muted-foreground font-normal">
                (optional — defaults to admin address)
              </span>
            </label>
            <Input
              value={feeCollectorAddress}
              onChange={(e) => setFeeCollectorAddress(e.target.value)}
              placeholder="addr1…"
              className="font-mono text-sm"
            />
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              This transaction mints the <strong>Settings NFT</strong> and
              creates the protocol settings UTxO. It can only be executed once
              per factory deployment. To update existing settings, use the{" "}
              <strong>Protocol Settings</strong> page instead.
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!canDeploy}
            onClick={handleDeploy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4 mr-2" />
            )}
            {busy ? "Processing…" : "Deploy Settings On-Chain"}
          </Button>
        </CardContent>
      </Card>

      <TxToastContainer />
    </div>
  );
}
