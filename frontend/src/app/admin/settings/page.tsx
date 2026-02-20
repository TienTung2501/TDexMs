"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, Settings, Shield, AlertTriangle } from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import {
  getAdminSettings,
  buildUpdateGlobalSettings,
  buildUpdateFactoryAdmin,
  type AdminSettings,
} from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";

export default function AdminSettingsPage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Global settings form
  const [maxFeeBps, setMaxFeeBps] = useState("");
  const [minLiquidity, setMinLiquidity] = useState("");

  // Factory settings form
  const [newAdminVkh, setNewAdminVkh] = useState("");

  useEffect(() => {
    getAdminSettings()
      .then((data) => {
        setSettings(data);
        setMaxFeeBps(String(data.global_settings.max_protocol_fee_bps));
        setMinLiquidity(String(data.global_settings.min_pool_liquidity));
      })
      .catch(() => {
        // Dev fallback
        const fallback: AdminSettings = {
          global_settings: {
            max_protocol_fee_bps: 50,
            min_pool_liquidity: 1_000_000_000,
            current_version: 5,
          },
          factory_settings: {
            admin_vkh: "abc123def456...",
          },
        };
        setSettings(fallback);
        setMaxFeeBps("50");
        setMinLiquidity("1000000000");
      })
      .finally(() => setLoading(false));
  }, []);

  const currentVersion = settings?.global_settings.current_version ?? 0;
  const nextVersion = currentVersion + 1;

  const handlePushGlobalUpdate = async () => {
    if (!address) return;

    await execute(
      () =>
        buildUpdateGlobalSettings({
          admin_address: address,
          new_settings: {
            max_protocol_fee_bps: Number(maxFeeBps),
            min_pool_liquidity: Number(minLiquidity),
            next_version: nextVersion,
          },
        }),
      {
        buildingMsg: "Building protocol settings update TX...",
        successMsg: `Protocol settings updated to v${nextVersion}!`,
        action: "update_global_settings",
        onSuccess: () => {
          // Refresh settings
          getAdminSettings()
            .then(setSettings)
            .catch(() => {});
        },
      }
    );
  };

  const handleUpdateFactoryAdmin = async () => {
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
      }
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Protocol Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modify global protocol parameters and factory admin settings.
        </p>
      </div>

      {/* Block 1: Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Global Settings
            <Badge variant="outline" className="text-[10px] ml-auto">
              settings_validator
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Max Protocol Fee (bps)
              </label>
              <Input
                type="number"
                value={maxFeeBps}
                onChange={(e) => setMaxFeeBps(e.target.value)}
                className="font-mono"
                placeholder="50"
              />
              <p className="text-xs text-muted-foreground">
                Maximum fee rate in basis points (1 bps = 0.01%).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Min Pool Liquidity (lovelace)
              </label>
              <Input
                type="number"
                value={minLiquidity}
                onChange={(e) => setMinLiquidity(e.target.value)}
                className="font-mono"
                placeholder="1000000000"
              />
              <p className="text-xs text-muted-foreground">
                Minimum liquidity required per pool in lovelace.
              </p>
            </div>
          </div>

          {/* Versioning display */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
            <div className="text-sm text-muted-foreground">
              Current Version:{" "}
              <span className="font-mono font-bold">{currentVersion}</span>
            </div>
            <div className="text-sm font-semibold text-primary">
              Next Version:{" "}
              <span className="font-mono">{nextVersion}</span>{" "}
              <span className="text-xs text-muted-foreground font-normal">
                (Auto-incremented)
              </span>
            </div>
          </div>

          <Button
            onClick={handlePushGlobalUpdate}
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
        </CardContent>
      </Card>

      {/* Block 2: Factory Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Factory Settings
            <Badge variant="outline" className="text-[10px] ml-auto">
              factory_validator
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              New Admin Wallet VKH (Transfer Admin Rights)
            </label>
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
              <strong>Warning:</strong> This action will revoke admin rights from
              the current wallet. Make sure the new VKH is correct before proceeding.
            </p>
          </div>

          <div className="text-xs text-muted-foreground">
            Current Admin VKH:{" "}
            <span className="font-mono">
              {settings?.factory_settings.admin_vkh || "unknown"}
            </span>
          </div>

          <Button
            variant="destructive"
            onClick={handleUpdateFactoryAdmin}
            disabled={busy || !newAdminVkh}
            className="w-full md:w-auto"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Transferring...
              </>
            ) : (
              "Update Factory Admin"
            )}
          </Button>
        </CardContent>
      </Card>

      <TxToastContainer />
    </div>
  );
}
