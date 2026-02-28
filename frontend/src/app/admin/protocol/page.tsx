"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Globe,
  Shield,
  AlertTriangle,
  Info,
  Copy,
  Check,
  Settings,
  Rocket,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import {
  getProtocolInfo,
  getAdminSettings,
  buildDeploySettings,
  buildUpdateGlobalSettings,
  buildUpdateFactoryAdmin,
  type ProtocolInfo,
  type AdminSettings,
} from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function AddressRow({ label, value, explorerBase }: { label: string; value: string; explorerBase?: string }) {
  if (!value) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px]">NOT SET</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs font-mono truncate max-w-[280px]" title={value}>
          {value}
        </span>
        <CopyButton text={value} />
        {explorerBase && (
          <a
            href={`${explorerBase}/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function AdminProtocolPage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [protocol, setProtocol] = useState<ProtocolInfo | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Deploy form
  const [protocolFeeBps, setProtocolFeeBps] = useState("30");
  const [minPoolLiquidity, setMinPoolLiquidity] = useState("1000000");
  const [feeCollectorAddress, setFeeCollectorAddress] = useState("");

  // Update settings form
  const [editMaxFeeBps, setEditMaxFeeBps] = useState("");
  const [editMinLiquidity, setEditMinLiquidity] = useState("");

  // Factory admin transfer
  const [newAdminVkh, setNewAdminVkh] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        getProtocolInfo().catch(() => null),
        getAdminSettings().catch(() => null),
      ]);
      setProtocol(p);
      setSettings(s);
      if (s) {
        setEditMaxFeeBps(String(s.global_settings.max_protocol_fee_bps));
        setEditMinLiquidity(String(s.global_settings.min_pool_liquidity));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const explorerBase = protocol?.network === "mainnet"
    ? "https://cardanoscan.io/address"
    : `https://${protocol?.network ?? "preprod"}.cardanoscan.io/address`;

  const isDeployed = settings !== null;
  const feeBps = Number(protocolFeeBps);
  const validFeeBps = !isNaN(feeBps) && feeBps >= 0 && feeBps <= 10_000;
  const minLiq = Number(minPoolLiquidity);
  const validMinLiq = !isNaN(minLiq) && minLiq >= 0;

  const currentVersion = settings?.global_settings.current_version ?? 0;
  const nextVersion = currentVersion + 1;

  // Deploy initial settings
  const handleDeploy = async () => {
    if (!address) return;
    await execute(
      () =>
        buildDeploySettings({
          admin_address: address,
          protocol_fee_bps: feeBps,
          min_pool_liquidity: minLiq,
          ...(feeCollectorAddress ? { fee_collector_address: feeCollectorAddress } : {}),
        }),
      {
        buildingMsg: "Building initial settings deployment TX...",
        successMsg: "Protocol settings deployed on-chain!",
        action: "deploy_settings",
        onSuccess: fetchAll,
      }
    );
  };

  // Update global settings
  const handleUpdateSettings = async () => {
    if (!address) return;
    await execute(
      () =>
        buildUpdateGlobalSettings({
          admin_address: address,
          new_settings: {
            max_protocol_fee_bps: Number(editMaxFeeBps),
            min_pool_liquidity: Number(editMinLiquidity),
            next_version: nextVersion,
          },
        }),
      {
        buildingMsg: "Building protocol settings update TX...",
        successMsg: `Protocol settings updated to v${nextVersion}!`,
        action: "update_global_settings",
        onSuccess: fetchAll,
      }
    );
  };

  // Transfer factory admin
  const handleTransferAdmin = async () => {
    if (!address || !newAdminVkh) return;
    await execute(
      () =>
        buildUpdateFactoryAdmin({
          current_admin_address: address,
          new_admin_vkh: newAdminVkh,
        }),
      {
        buildingMsg: "Building factory admin transfer TX...",
        successMsg: "Factory admin rights transferred!",
        action: "update_factory_admin",
        onSuccess: fetchAll,
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Protocol Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            On-chain contract addresses, protocol parameters, and deployment controls.
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

      {/* Network + Status Banner */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {loading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant="outline" className="text-xs uppercase px-3 py-1">
                {protocol?.network ?? "unknown"}
              </Badge>
              {isDeployed ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm font-semibold">Settings Deployed</span>
                  <Badge variant="success" className="text-[10px]">v{currentVersion}</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-semibold">Settings Not Deployed</span>
                  <Badge variant="warning" className="text-[10px]">PENDING</Badge>
                </div>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                Fee: {settings ? `${settings.global_settings.max_protocol_fee_bps} bps (${(settings.global_settings.max_protocol_fee_bps / 100).toFixed(2)}%)` : "—"}
                {" · "}
                Min Liquidity: {settings ? `${settings.global_settings.min_pool_liquidity.toLocaleString()} lovelace` : "—"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contract Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Smart Contract Addresses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : protocol ? (
            <div>
              <AddressRow
                label="Escrow Script"
                value={protocol.contracts.escrow_script_address}
                explorerBase={explorerBase}
              />
              <AddressRow
                label="Pool Script"
                value={protocol.contracts.pool_script_address}
                explorerBase={explorerBase}
              />
              <AddressRow
                label="Settings NFT Policy"
                value={protocol.contracts.settings_nft_policy_id}
              />
              <AddressRow
                label="Settings NFT Name"
                value={protocol.contracts.settings_nft_asset_name}
              />
              <AddressRow
                label="Admin Address"
                value={protocol.admin.admin_address}
                explorerBase={explorerBase}
              />
              <AddressRow
                label="Solver Address"
                value={protocol.admin.solver_address}
                explorerBase={explorerBase}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load protocol info</p>
          )}
        </CardContent>
      </Card>

      {/* Services Status */}
      {protocol && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Backend Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: "Solver Engine", enabled: protocol.services.solver_enabled },
                { label: "Order Executor", enabled: protocol.services.order_executor_enabled },
                { label: "Order Routes", enabled: protocol.services.order_routes_enabled },
              ].map((svc) => (
                <div key={svc.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm">{svc.label}</span>
                  <Badge variant={svc.enabled ? "success" : "secondary"} className="text-[10px]">
                    {svc.enabled ? "ENABLED" : "DISABLED"}
                  </Badge>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Chain Sync</span>
                <span className="text-xs font-mono text-muted-foreground">
                  every {(protocol.services.chain_sync_interval_ms / 1000).toFixed(0)}s
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Blockfrost</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {protocol.blockfrost.project_id_masked || "Not configured"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm">Database Records</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {protocol.database.pool_count}P / {protocol.database.intent_count}I / {protocol.database.order_count}O
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deploy / Update Settings */}
      {!isDeployed ? (
        // First-time deploy form
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Deploy Protocol Settings
              <Badge variant="warning" className="ml-auto text-[10px]">FIRST TIME</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                This mints the <strong>Settings NFT</strong> and creates the initial on-chain
                settings UTxO. Required before pools can be created.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Protocol Fee (bps)</label>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={protocolFeeBps}
                  onChange={(e) => setProtocolFeeBps(e.target.value)}
                  className={!validFeeBps ? "border-destructive" : ""}
                  placeholder="30"
                />
                <p className="text-[11px] text-muted-foreground">
                  {validFeeBps ? `${(feeBps / 100).toFixed(2)}% fee rate` : "Must be 0–10000"}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Min Pool Liquidity (lovelace)</label>
                <Input
                  type="number"
                  min={0}
                  value={minPoolLiquidity}
                  onChange={(e) => setMinPoolLiquidity(e.target.value)}
                  className={!validMinLiq ? "border-destructive" : ""}
                  placeholder="1000000"
                />
                <p className="text-[11px] text-muted-foreground">
                  {validMinLiq ? `≈ ${(minLiq / 1_000_000).toFixed(2)} ADA` : "Invalid"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fee Collector Address (optional)</label>
              <Input
                value={feeCollectorAddress}
                onChange={(e) => setFeeCollectorAddress(e.target.value)}
                placeholder="addr1… (defaults to admin)"
                className="font-mono text-sm"
              />
            </div>

            <Button
              onClick={handleDeploy}
              disabled={busy || !address || !validFeeBps || !validMinLiq}
              className="w-full md:w-auto"
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deploying...</>
              ) : (
                <><Rocket className="h-4 w-4 mr-2" />Deploy Settings NFT</>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Update existing settings
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Update Protocol Settings
              <Badge variant="outline" className="text-[10px] ml-auto">
                v{currentVersion} → v{nextVersion}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Protocol Fee (bps)</label>
                <Input
                  type="number"
                  value={editMaxFeeBps}
                  onChange={(e) => setEditMaxFeeBps(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">1 bps = 0.01%</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Min Pool Liquidity (lovelace)</label>
                <Input
                  type="number"
                  value={editMinLiquidity}
                  onChange={(e) => setEditMinLiquidity(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <Button
              onClick={handleUpdateSettings}
              disabled={busy}
              className="w-full md:w-auto"
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Pushing Update...</>
              ) : (
                "Push Protocol Update"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Factory Admin Transfer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Factory Admin Transfer
            <Badge variant="outline" className="text-[10px] ml-auto">factory_validator</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Current Admin VKH:{" "}
            <span className="font-mono">{settings?.factory_settings.admin_vkh || "unknown"}</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">New Admin VKH</label>
            <Input
              value={newAdminVkh}
              onChange={(e) => setNewAdminVkh(e.target.value)}
              className="font-mono"
              placeholder="Enter new admin verification key hash..."
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <strong>Warning:</strong> This revokes admin rights from the current wallet.
              Ensure the new VKH is correct.
            </p>
          </div>

          <Button
            variant="destructive"
            onClick={handleTransferAdmin}
            disabled={busy || !newAdminVkh}
            className="w-full md:w-auto"
          >
            {busy ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Transferring...</>
            ) : (
              "Transfer Factory Admin"
            )}
          </Button>
        </CardContent>
      </Card>

      <TxToastContainer />
    </div>
  );
}
