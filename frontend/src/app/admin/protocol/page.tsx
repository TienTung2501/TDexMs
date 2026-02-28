"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Database,
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp,
  Hash,
  Link2,
  CheckCircle2,
  XCircle,
  Eye,
  Coins,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import {
  getProtocolInfo,
  getAdminSettings,
  buildDeploySettings,
  buildUpdateGlobalSettings,
  buildUpdateFactoryAdmin,
  buildDeployFactory,
  getOnChainState,
  type ProtocolInfo,
  type AdminSettings,
  type OnChainProtocolState,
} from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";
import { cn } from "@/lib/utils";

// ─── Copy Button ────────────────────────────
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
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

// ─── Address Row (read-only) ────────────────
function AddressRow({
  label,
  value,
  type = "address",
  explorerBase,
  matchesEnv,
  badge,
}: {
  label: string;
  value: string;
  type?: "address" | "policy" | "hash";
  explorerBase?: string;
  matchesEnv?: boolean | null;
  badge?: React.ReactNode;
}) {
  if (!value) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px]">
          NOT SET
        </Badge>
      </div>
    );
  }

  const icon =
    type === "policy" || type === "hash" ? (
      <Hash className="h-3 w-3 text-muted-foreground mr-1 shrink-0" />
    ) : (
      <Link2 className="h-3 w-3 text-muted-foreground mr-1 shrink-0" />
    );

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 gap-4">
      <div className="flex items-center gap-2 shrink-0">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
        {matchesEnv === true && (
          <span title="Matches env config">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          </span>
        )}
        {matchesEnv === false && (
          <span title="Differs from env config">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
          </span>
        )}
        {badge}
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <span
          className="text-xs font-mono truncate max-w-[300px]"
          title={value}
        >
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

// ─── Service Status Pill ────────────────────
function ServicePill({
  label,
  enabled,
  detail,
}: {
  label: string;
  enabled?: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <span className="text-sm">{label}</span>
      {enabled !== undefined ? (
        <Badge
          variant={enabled ? "success" : "secondary"}
          className="text-[10px]"
        >
          {enabled ? "ON" : "OFF"}
        </Badge>
      ) : (
        <span className="text-xs font-mono text-muted-foreground">
          {detail}
        </span>
      )}
    </div>
  );
}

// ─── Collapsible Section ────────────────────
function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-base font-semibold">{title}</span>
          {badge}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0 border-t border-border/40">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ──────────────────────────────
export default function AdminProtocolPage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [protocol, setProtocol] = useState<ProtocolInfo | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [onChainState, setOnChainState] = useState<OnChainProtocolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOnChain, setLoadingOnChain] = useState(false);

  // Deploy form
  const [protocolFeeBps, setProtocolFeeBps] = useState("30");
  const [minPoolLiquidity, setMinPoolLiquidity] = useState("1000000");
  const [feeCollectorAddress, setFeeCollectorAddress] = useState("");

  // Update settings form
  const [editMaxFeeBps, setEditMaxFeeBps] = useState("");
  const [editMinLiquidity, setEditMinLiquidity] = useState("");
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  // Factory admin transfer
  const [newAdminVkh, setNewAdminVkh] = useState("");
  const [showAdminTransfer, setShowAdminTransfer] = useState(false);

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

  const fetchOnChainState = useCallback(async () => {
    setLoadingOnChain(true);
    try {
      const state = await getOnChainState();
      setOnChainState(state);
    } catch {
      // On-chain state not available
    } finally {
      setLoadingOnChain(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
    fetchOnChainState();
  };

  const explorerBase =
    protocol?.network === "mainnet"
      ? "https://cardanoscan.io/address"
      : `https://${protocol?.network ?? "preprod"}.cardanoscan.io/address`;

  const policyExplorer =
    protocol?.network === "mainnet"
      ? "https://cardanoscan.io/tokenPolicy"
      : `https://${protocol?.network ?? "preprod"}.cardanoscan.io/tokenPolicy`;

  const isDeployed = settings !== null;
  const feeBps = Number(protocolFeeBps);
  const validFeeBps = !isNaN(feeBps) && feeBps >= 0 && feeBps <= 10_000;
  const minLiq = Number(minPoolLiquidity);
  const validMinLiq = !isNaN(minLiq) && minLiq >= 0;
  const currentVersion = settings?.global_settings.current_version ?? 0;
  const nextVersion = currentVersion + 1;

  const derived = protocol?.derived_addresses;

  // Check env vs derived address matches
  const escrowMatch =
    derived && protocol
      ? derived.escrowAddress === protocol.contracts.escrow_script_address ||
        !protocol.contracts.escrow_script_address
      : null;
  const poolMatch =
    derived && protocol
      ? derived.poolAddress === protocol.contracts.pool_script_address ||
        !protocol.contracts.pool_script_address
      : null;

  // ─── Actions ──────────────────────────────
  const handleDeploy = async () => {
    if (!address) return;
    await execute(
      () =>
        buildDeploySettings({
          admin_address: address,
          protocol_fee_bps: feeBps,
          min_pool_liquidity: minLiq,
          ...(feeCollectorAddress
            ? { fee_collector_address: feeCollectorAddress }
            : {}),
        }),
      {
        buildingMsg: "Building initial settings deployment TX...",
        successMsg: "Protocol settings deployed on-chain!",
        action: "deploy_settings",
        onSuccess: fetchAll,
      }
    );
  };

  const handleDeployFactory = async () => {
    if (!address) return;
    await execute(
      () => buildDeployFactory({ admin_address: address }),
      {
        buildingMsg: "Building factory deployment TX...",
        successMsg: "Factory deployed on-chain!",
        action: "deploy_factory",
        onSuccess: fetchAll,
      }
    );
  };

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

  // ─── Render ───────────────────────────────
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Protocol Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            On-chain contracts, derived addresses, protocol parameters &
            lifecycle management.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8"
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5 mr-1.5",
              refreshing && "animate-spin"
            )}
          />
          Refresh
        </Button>
      </div>

      {/* ─── Status Banner ───────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {loading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                variant="outline"
                className="text-xs uppercase px-3 py-1"
              >
                {protocol?.network ?? "unknown"}
              </Badge>

              {isDeployed ? (
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">
                    Settings v{currentVersion}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">
                    Settings Not Deployed
                  </span>
                </div>
              )}

              <span className="text-border">|</span>

              {derived ? (
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">
                    Blueprint Loaded
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <XCircle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">
                    Blueprint Missing
                  </span>
                </div>
              )}

              <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Fee:{" "}
                  {settings
                    ? `${settings.global_settings.max_protocol_fee_bps} bps`
                    : "—"}
                </span>
                <span>
                  Min Liq:{" "}
                  {settings
                    ? `${(settings.global_settings.min_pool_liquidity / 1_000_000).toFixed(1)} ADA`
                    : "—"}
                </span>
                <span>
                  {protocol?.database.pool_count ?? 0}P /{" "}
                  {protocol?.database.intent_count ?? 0}I /{" "}
                  {protocol?.database.order_count ?? 0}O
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 1: Validator Addresses ── */}
      <CollapsibleSection
        title="Validator Addresses"
        icon={Layers}
        defaultOpen={true}
        badge={
          derived ? (
            <Badge variant="success" className="text-[10px]">
              5 validators · 4 policies
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              unavailable
            </Badge>
          )
        }
      >
        {loading ? (
          <div className="space-y-3 pt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : derived ? (
          <div className="pt-2">
            <p className="text-[11px] text-muted-foreground mb-3">
              Derived from{" "}
              <code className="bg-muted px-1 rounded">plutus.json</code>{" "}
              blueprint + admin VKH. These are the canonical on-chain
              addresses.
            </p>

            {/* Validator Addresses */}
            <AddressRow
              label="Escrow Validator"
              value={derived.escrowAddress}
              explorerBase={explorerBase}
              matchesEnv={escrowMatch}
            />
            <AddressRow
              label="Pool Validator"
              value={derived.poolAddress}
              explorerBase={explorerBase}
              matchesEnv={poolMatch}
            />
            <AddressRow
              label="Factory Validator"
              value={derived.factoryAddress}
              explorerBase={explorerBase}
            />
            <AddressRow
              label="Order Validator"
              value={derived.orderAddress}
              explorerBase={explorerBase}
            />
            <AddressRow
              label="Settings Validator"
              value={derived.settingsAddress || '(not derived — settings NFT env vars missing)'}
              explorerBase={derived.settingsAddress ? explorerBase : undefined}
              badge={
                derived.settingsParamStatus === 'parameterized' ? (
                  <Badge variant="success" className="text-[10px]">parameterized</Badge>
                ) : derived.settingsParamStatus === 'unparameterized' ? (
                  <Badge variant="warning" className="text-[10px]">un-parameterized</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">error</Badge>
                )
              }
            />
            {derived.settingsParamStatus === 'unparameterized' && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-1 mb-1">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Settings address derived without NFT parameters (SETTINGS_NFT_POLICY_ID / SETTINGS_NFT_ASSET_NAME not set).
                  The actual deployed address may differ. Set these env vars after initial deployment.
                </p>
              </div>
            )}

            {/* Minting Policy IDs */}
            <div className="mt-4 pt-3 border-t border-border/40">
              <p className="text-[11px] text-muted-foreground mb-2 font-medium">
                Minting Policy IDs
              </p>
              <AddressRow
                label="Intent Token Policy"
                value={derived.intentPolicyId}
                type="policy"
                explorerBase={policyExplorer}
                badge={
                  <Badge variant="secondary" className="text-[10px]">no params · shared with factory NFT</Badge>
                }
              />
              <AddressRow
                label="LP Token Policy"
                value={derived.lpPolicyId}
                type="policy"
                explorerBase={policyExplorer}
              />
              <AddressRow
                label="Pool NFT Policy"
                value={derived.poolNftPolicyId}
                type="policy"
                explorerBase={policyExplorer}
              />
              <AddressRow
                label="Settings NFT Policy"
                value={protocol?.contracts.settings_nft_policy_id || ""}
                type="policy"
                explorerBase={policyExplorer}
              />
            </div>

            {/* Script Hashes */}
            <div className="mt-4 pt-3 border-t border-border/40">
              <p className="text-[11px] text-muted-foreground mb-2 font-medium">
                Script Hashes
              </p>
              <AddressRow
                label="Escrow Hash"
                value={derived.escrowHash}
                type="hash"
              />
              <AddressRow
                label="Pool Hash"
                value={derived.poolHash}
                type="hash"
              />
              <AddressRow
                label="Factory Hash"
                value={derived.factoryHash}
                type="hash"
              />
            </div>
          </div>
        ) : (
          <div className="pt-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Blueprint not available. Ensure{" "}
                <code className="bg-muted px-1 rounded">
                  smartcontract/plutus.json
                </code>{" "}
                exists and the TxBuilder is initialized.
              </p>
            </div>
            {protocol && (
              <div className="mt-3">
                <p className="text-[11px] text-muted-foreground mb-2 font-medium">
                  From Environment Variables
                </p>
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
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ─── Section 2: On-Chain State ──────────── */}
      <CollapsibleSection
        title="On-Chain State"
        icon={Eye}
        badge={
          onChainState ? (
            <Badge variant="success" className="text-[10px]">
              {onChainState.factory ? '1' : '0'} factory · {onChainState.settings ? '1' : '0'} settings · {onChainState.pools?.length ?? 0} pools
            </Badge>
          ) : loadingOnChain ? (
            <Badge variant="secondary" className="text-[10px]">loading...</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">not loaded</Badge>
          )
        }
      >
        <div className="pt-4 space-y-4">
          {!onChainState && !loadingOnChain && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">
                Read live UTxO data from on-chain validators (factory, settings, pools).
              </p>
              <Button size="sm" variant="outline" onClick={fetchOnChainState}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Load On-Chain State
              </Button>
            </div>
          )}

          {loadingOnChain && (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Reading on-chain UTxOs...</span>
            </div>
          )}

          {onChainState && !loadingOnChain && (
            <>
              {/* Factory Datum */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  Factory On-Chain
                  {onChainState.factory ? (
                    <Badge variant="success" className="text-[10px]">found</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">not found</Badge>
                  )}
                </h3>
                {onChainState.factory ? (
                  <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Pool Count</span>
                        <p className="font-mono font-semibold">{onChainState.factory.datum?.pool_count ?? '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Admin VKH</span>
                        <p className="font-mono truncate max-w-[200px]" title={onChainState.factory.datum?.admin ?? ''}>
                          {onChainState.factory.datum?.admin
                            ? `${onChainState.factory.datum.admin.slice(0, 12)}…${onChainState.factory.datum.admin.slice(-8)}`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ADA Value</span>
                        <p className="font-mono font-semibold">
                          {onChainState.factory.lovelace
                            ? `${(Number(onChainState.factory.lovelace) / 1_000_000).toFixed(2)} ₳`
                            : '—'}
                        </p>
                      </div>
                    </div>
                    {onChainState.factory.datum?.factory_nft && (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-[10px] text-muted-foreground">Factory NFT</span>
                        <p className="font-mono text-[11px] truncate" title={`${onChainState.factory.datum.factory_nft.policy_id}.${onChainState.factory.datum.factory_nft.asset_name}`}>
                          {onChainState.factory.datum.factory_nft.policy_id.slice(0, 16)}…
                          <span className="text-muted-foreground"> · </span>
                          {onChainState.factory.datum.factory_nft.asset_name || '(empty)'}
                        </p>
                      </div>
                    )}
                    {onChainState.factory.datum?.settings_utxo && (
                      <div className="pt-1">
                        <span className="text-[10px] text-muted-foreground">Settings UTxO Ref</span>
                        <p className="font-mono text-[11px] truncate" title={onChainState.factory.datum.settings_utxo}>
                          {onChainState.factory.datum.settings_utxo.length > 40
                            ? `${onChainState.factory.datum.settings_utxo.slice(0, 16)}…${onChainState.factory.datum.settings_utxo.slice(-12)}`
                            : onChainState.factory.datum.settings_utxo}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No factory UTxO found on-chain. Deploy factory first.
                    </p>
                  </div>
                )}
              </div>

              {/* Settings Datum */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 text-primary" />
                  Settings On-Chain
                  {onChainState.settings ? (
                    <Badge variant="success" className="text-[10px]">found</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">not found</Badge>
                  )}
                </h3>
                {onChainState.settings ? (
                  <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Protocol Fee</span>
                        <p className="font-mono font-semibold">{onChainState.settings.datum?.protocol_fee_bps ?? '—'} bps</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Min Pool Liquidity</span>
                        <p className="font-mono font-semibold">
                          {onChainState.settings.datum?.min_pool_liquidity
                            ? `${(onChainState.settings.datum.min_pool_liquidity / 1_000_000).toFixed(1)} ₳`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Version</span>
                        <p className="font-mono font-semibold">{onChainState.settings.datum?.version ?? '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Min Intent Size</span>
                        <p className="font-mono font-semibold">
                          {onChainState.settings.datum?.min_intent_size
                            ? `${(onChainState.settings.datum.min_intent_size / 1_000_000).toFixed(1)} ₳`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Solver Bond</span>
                        <p className="font-mono font-semibold">
                          {onChainState.settings.datum?.solver_bond
                            ? `${(onChainState.settings.datum.solver_bond / 1_000_000).toFixed(1)} ₳`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Admin Hash</span>
                        <p className="font-mono truncate max-w-[200px]" title={onChainState.settings.datum?.admin ?? ''}>
                          {onChainState.settings.datum?.admin
                            ? `${onChainState.settings.datum.admin.slice(0, 12)}…`
                            : '—'}
                        </p>
                      </div>
                    </div>
                    {onChainState.settings.lovelace && (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-[10px] text-muted-foreground">UTxO Value</span>
                        <p className="font-mono text-xs">{(Number(onChainState.settings.lovelace) / 1_000_000).toFixed(2)} ₳</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No settings UTxO found on-chain. Deploy settings first.
                    </p>
                  </div>
                )}
              </div>

              {/* NFT Relationships */}
              {onChainState.nft_relationships && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-primary" />
                    NFT Relationships
                  </h3>
                  <div className="rounded-lg bg-muted/30 p-4 font-mono text-[11px] leading-relaxed overflow-x-auto">
                    <pre className="text-muted-foreground whitespace-pre">
{`intent_token_policy (no params, one-shot)
  │
  ├──► Factory NFT: ${onChainState.nft_relationships.factory_nft?.policy_id?.slice(0, 16) ?? '???'}…
  │    asset_name: ${onChainState.nft_relationships.factory_nft?.asset_name || '(empty)'}
  │    ⤷ Locked in factory_validator UTxO
  │
  └──► Intent Tokens (user mints, same policy)
       ⤷ This is why CardanoScan shows multiple mint txs under one policy

pool_nft_policy (factory_hash, admin_vkh)
  └──► Pool NFTs: ${onChainState.nft_relationships.pool_nfts?.length ?? 0} minted
       ⤷ One per pool, locked in pool_validator UTxOs

settings_nft: ${onChainState.nft_relationships.settings_nft?.policy_id ? `${onChainState.nft_relationships.settings_nft.policy_id.slice(0, 16)}…` : '(not detected)'}
  └──► Locked in settings_validator UTxO (guards settings updates)`}
                    </pre>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    The factory NFT is minted via <code className="bg-muted px-1 rounded">intent_token_policy</code> (parameterless, one-shot).
                    This shares the same policy ID as user intent tokens — explaining why the blockchain explorer shows multiple mint transactions under one policy.
                  </p>
                </div>
              )}

              {/* Pool UTxOs */}
              {onChainState.pools && onChainState.pools.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-primary" />
                    Pool UTxOs
                    <Badge variant="outline" className="text-[10px]">
                      {onChainState.pools.length} pool{onChainState.pools.length > 1 ? 's' : ''}
                    </Badge>
                  </h3>
                  <div className="space-y-2">
                    {onChainState.pools.map((pool, i) => (
                      <div key={i} className="rounded-lg bg-muted/30 p-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Asset A</span>
                            <p className="font-mono truncate max-w-[150px]" title={pool.datum?.asset_a?.policy_id === '' ? 'ADA' : `${pool.datum?.asset_a?.policy_id}.${pool.datum?.asset_a?.asset_name}`}>
                              {pool.datum?.asset_a?.policy_id === '' ? '₳ ADA' : `${pool.datum?.asset_a?.policy_id?.slice(0, 8)}…`}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Asset B</span>
                            <p className="font-mono truncate max-w-[150px]" title={pool.datum?.asset_b?.policy_id === '' ? 'ADA' : `${pool.datum?.asset_b?.policy_id}.${pool.datum?.asset_b?.asset_name}`}>
                              {pool.datum?.asset_b?.policy_id === '' ? '₳ ADA' : `${pool.datum?.asset_b?.policy_id?.slice(0, 8)}…`}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total LP</span>
                            <p className="font-mono font-semibold">{pool.datum?.total_lp_tokens?.toLocaleString() ?? '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fee</span>
                            <p className="font-mono font-semibold">{pool.datum?.fee_numerator ?? '—'} bps</p>
                          </div>
                        </div>
                        {pool.lovelace && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                            UTxO: {(Number(pool.lovelace) / 1_000_000).toFixed(2)} ₳
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reload button */}
              <div className="pt-2 flex justify-end">
                <Button size="sm" variant="ghost" onClick={fetchOnChainState} disabled={loadingOnChain}>
                  <RefreshCw className={cn("h-3 w-3 mr-1.5", loadingOnChain && "animate-spin")} />
                  Reload
                </Button>
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* ─── Section 3: Admin & Wallet Addresses ── */}
      <CollapsibleSection
        title="Admin Configuration"
        icon={Shield}
        defaultOpen={true}
      >
        {loading ? (
          <div className="space-y-3 pt-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : protocol ? (
          <div className="pt-2">
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
            {settings && (
              <AddressRow
                label="Factory Admin VKH"
                value={settings.factory_settings.admin_vkh}
                type="hash"
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground pt-4">
            Failed to load protocol info
          </p>
        )}
      </CollapsibleSection>

      {/* ─── Section 3: Backend Services ──── */}
      <CollapsibleSection title="Backend Services" icon={Cpu}>
        {protocol ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
            <ServicePill
              label="Solver Engine"
              enabled={protocol.services.solver_enabled}
            />
            <ServicePill
              label="Order Executor"
              enabled={protocol.services.order_executor_enabled}
            />
            <ServicePill
              label="Order Routes"
              enabled={protocol.services.order_routes_enabled}
            />
            <ServicePill
              label="Chain Sync"
              detail={`every ${(protocol.services.chain_sync_interval_ms / 1000).toFixed(0)}s`}
            />
            <ServicePill
              label="Blockfrost"
              detail={
                protocol.blockfrost.project_id_masked || "Not configured"
              }
            />
            <ServicePill
              label="Database"
              detail={`${protocol.database.pool_count}P / ${protocol.database.intent_count}I / ${protocol.database.order_count}O`}
            />
          </div>
        ) : (
          <div className="pt-4">
            <Skeleton className="h-20 w-full" />
          </div>
        )}
      </CollapsibleSection>

      {/* ─── Section 4: Protocol Lifecycle ── */}
      <CollapsibleSection
        title="Protocol Lifecycle"
        icon={Rocket}
        defaultOpen={!isDeployed}
        badge={
          isDeployed ? (
            <Badge variant="success" className="text-[10px]">
              DEPLOYED
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[10px]">
              NEEDS SETUP
            </Badge>
          )
        }
      >
        <div className="space-y-6 pt-4">
          {!isDeployed ? (
            /* First-time deploy */
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  <strong>Step 1:</strong> Deploy Settings NFT. This creates
                  the initial on-chain settings UTxO. Required before pools
                  can be created.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Protocol Fee (bps)
                  </label>
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
                    {validFeeBps
                      ? `${(feeBps / 100).toFixed(2)}% fee rate`
                      : "Must be 0–10000"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Min Pool Liquidity (lovelace)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={minPoolLiquidity}
                    onChange={(e) => setMinPoolLiquidity(e.target.value)}
                    className={!validMinLiq ? "border-destructive" : ""}
                    placeholder="1000000"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {validMinLiq
                      ? `≈ ${(minLiq / 1_000_000).toFixed(2)} ADA`
                      : "Invalid"}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Fee Collector Address (optional)
                </label>
                <Input
                  value={feeCollectorAddress}
                  onChange={(e) => setFeeCollectorAddress(e.target.value)}
                  placeholder="addr1… (defaults to admin)"
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleDeploy}
                disabled={
                  busy || !address || !validFeeBps || !validMinLiq
                }
                className="w-full md:w-auto"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy Settings NFT
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* Current Settings (Read-First) */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  Current Protocol Settings
                  <Badge variant="outline" className="text-[10px]">
                    v{currentVersion}
                  </Badge>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Protocol Fee
                    </p>
                    <p className="text-lg font-bold font-mono">
                      {settings?.global_settings.max_protocol_fee_bps} bps
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      ={" "}
                      {(
                        (settings?.global_settings
                          .max_protocol_fee_bps ?? 0) / 100
                      ).toFixed(2)}
                      %
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Min Pool Liquidity
                    </p>
                    <p className="text-lg font-bold font-mono">
                      {(
                        (settings?.global_settings.min_pool_liquidity ??
                          0) / 1_000_000
                      ).toFixed(1)}{" "}
                      ADA
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      ={" "}
                      {(
                        settings?.global_settings.min_pool_liquidity ?? 0
                      ).toLocaleString()}{" "}
                      lovelace
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Version
                    </p>
                    <p className="text-lg font-bold font-mono">
                      {currentVersion}
                    </p>
                  </div>
                </div>
              </div>

              {/* Update Settings (Edit-Later) */}
              <div className="border-t border-border/40 pt-4">
                <button
                  onClick={() => setShowUpdateForm(!showUpdateForm)}
                  className="flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors cursor-pointer"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Update Protocol Settings
                  <Badge variant="outline" className="text-[10px]">
                    → v{nextVersion}
                  </Badge>
                  {showUpdateForm ? (
                    <ChevronUp className="h-3.5 w-3.5 ml-1" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  )}
                </button>

                {showUpdateForm && (
                  <div className="mt-4 space-y-4 pl-5 border-l-2 border-primary/20">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                          Max Protocol Fee (bps)
                        </label>
                        <Input
                          type="number"
                          value={editMaxFeeBps}
                          onChange={(e) =>
                            setEditMaxFeeBps(e.target.value)
                          }
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                          Min Pool Liquidity (lovelace)
                        </label>
                        <Input
                          type="number"
                          value={editMinLiquidity}
                          onChange={(e) =>
                            setEditMinLiquidity(e.target.value)
                          }
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
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Pushing Update...
                        </>
                      ) : (
                        "Push Protocol Update"
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Deploy Factory */}
              <div className="border-t border-border/40 pt-4">
                <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>
                      <strong>Step 2:</strong> Deploy Factory. Mints the
                      Factory NFT and creates the factory UTxO at the factory
                      validator address. Required for pool creation.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleDeployFactory}
                  disabled={busy || !address}
                  className="w-full md:w-auto mt-3"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4 mr-2" />
                      Deploy Factory
                    </>
                  )}
                </Button>
              </div>

              {/* Factory Admin Transfer */}
              <div className="border-t border-border/40 pt-4">
                <button
                  onClick={() =>
                    setShowAdminTransfer(!showAdminTransfer)
                  }
                  className="flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors cursor-pointer"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Factory Admin Transfer
                  <Badge variant="outline" className="text-[10px]">
                    DANGER
                  </Badge>
                  {showAdminTransfer ? (
                    <ChevronUp className="h-3.5 w-3.5 ml-1" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  )}
                </button>

                {showAdminTransfer && (
                  <div className="mt-4 space-y-4 pl-5 border-l-2 border-destructive/30">
                    <div className="text-xs text-muted-foreground">
                      Current Admin VKH:{" "}
                      <span className="font-mono">
                        {settings?.factory_settings.admin_vkh ||
                          "unknown"}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        New Admin VKH
                      </label>
                      <Input
                        value={newAdminVkh}
                        onChange={(e) =>
                          setNewAdminVkh(e.target.value)
                        }
                        className="font-mono"
                        placeholder="Enter new admin verification key hash..."
                      />
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        <strong>Warning:</strong> This revokes admin rights
                        from the current wallet. Ensure the new VKH is
                        correct.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={handleTransferAdmin}
                      disabled={busy || !newAdminVkh}
                      className="w-full md:w-auto"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Transferring...
                        </>
                      ) : (
                        "Transfer Factory Admin"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* ─── Section 5: Validator Topology ── */}
      <CollapsibleSection title="Validator Topology & Redeemers" icon={Database}>
        <div className="pt-4 space-y-4">
          <div className="rounded-lg bg-muted/30 p-4 font-mono text-[11px] leading-relaxed overflow-x-auto">
            <pre className="text-muted-foreground whitespace-pre">
              {`           admin_vkh (env)          settings_nft (deploy-time)
              │                           │
  ┌───────────┼────────────┐              │
  │           │            │              ▼
  ▼           ▼            │       settings_validator(settings_nft)
escrow    pool_validator   │       Redeemer: UpdateProtocolSettings
(none)    (admin_vkh)      │
  │           │            │
  │    ┌──────┤            ├──► factory_validator(pool_hash)
  │    │      │            │    Redeemer: CreatePool | UpdateSettings
  │    │      │            │         │
  │    │ ┌────┼────────────┤         │
  │    │ │    │            │         │
  │    │ ▼    │            ▼         │
  │  lp_token │      pool_nft_policy │
  │  (pool,   │      (factory,admin) │
  │   factory)│      Mint/Burn       │
  │    │      │            │         │
  │    ▼      ▼            ▼         │
  │    └──► pool_validator ◄─────────┘
  │         Redeemer: Swap | Deposit | Withdraw
  │                  | CollectFees | ClosePool
  │
  │  intent_token_policy (no params, one-shot)
  │    Redeemer: MintIntentToken | BurnIntentToken
  │    NOTE: Also mints factory NFT (shared policy)
  │    │
  │    ▼
  │  order_validator(intent_policy_id)
  │    Redeemer: CancelOrder | ExecuteOrder | ReclaimOrder
  │
  └──► escrow_validator (no params)
       Redeemer: Cancel | Fill | Reclaim`}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Validators are resolved in dependency order. Changing{" "}
              <code className="bg-muted px-1 rounded">admin_vkh</code>{" "}
              cascades to pool, factory, lp_token, pool_nft, and order
              validators.
            </p>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-blue-700 dark:text-blue-400">
                <strong>Why does factory show multiple mint txs?</strong>{" "}
                The factory NFT is minted via <code className="bg-muted px-1 rounded">intent_token_policy</code> (parameterless, one-shot pattern).
                User intent tokens share the same policy ID, so the blockchain explorer aggregates all mints under one policy — including the factory NFT mint and subsequent intent token mints.
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <TxToastContainer />
    </div>
  );
}
