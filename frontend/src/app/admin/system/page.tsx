"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Terminal,
  AlertTriangle,
  Loader2,
  Trash2,
  Factory,
  Shield,
  CheckCircle,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import { buildDeployFactory, resetDatabase } from "@/lib/api";
import { useTransaction } from "@/lib/hooks/use-transaction";

export default function AdminSystemPage() {
  const { address } = useWallet();
  const { execute, busy, TxToastContainer } = useTransaction();

  // Factory deploy state
  const [deployingFactory, setDeployingFactory] = useState(false);

  // Reset DB state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{
    success: boolean;
    deleted: Record<string, number>;
  } | null>(null);

  const handleDeployFactory = async () => {
    if (!address) return;
    await execute(
      () => buildDeployFactory({ admin_address: address }),
      {
        buildingMsg: "Building factory deployment TX...",
        successMsg: "Factory deployed on-chain!",
        action: "deploy_factory",
      }
    );
  };

  const handleResetDb = async () => {
    if (!address) return;
    setResetting(true);
    setResetResult(null);
    try {
      const result = await resetDatabase({
        admin_address: address,
        confirm: "RESET_ALL_DATA",
      });
      setResetResult({ success: result.success, deleted: result.deleted });
      setShowResetModal(false);
    } catch (err) {
      setResetResult(null);
      alert(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
      setResetConfirmText("");
    }
  };

  const canReset = resetConfirmText === "RESET_ALL_DATA";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          System Operations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administrative operations — factory deployment, database maintenance, and diagnostics.
        </p>
      </div>

      {/* Factory Deployment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Factory Deployment
            <Badge variant="outline" className="text-[10px] ml-auto">factory_validator</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Deploy the factory validator on-chain. Required once during initial protocol setup.
            The factory manages pool creation rights and admin access control.
          </p>

          <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
            <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              This mints the Factory NFT and creates the factory datum. Only run this once —
              subsequent calls will fail if the factory is already deployed.
            </p>
          </div>

          <Button
            onClick={handleDeployFactory}
            disabled={busy || !address}
            className="w-full md:w-auto"
          >
            {busy ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deploying...</>
            ) : (
              <><Factory className="h-4 w-4 mr-2" />Deploy Factory</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Database Reset */}
      <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-6 space-y-4">
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Reset Database
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Permanently delete all data from the database: pools, intents, orders, swaps,
              candles, price ticks, pool history, and protocol stats. On-chain data is
              unaffected.
            </p>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">
                <strong>Warning:</strong> This action is irreversible. All historical data
                will be permanently lost. The application will re-sync from chain on restart.
              </p>
            </div>

            {/* Show result if a reset was recently performed */}
            {resetResult && (
              <div className={`rounded-lg p-4 text-sm ${
                resetResult.success
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : "bg-destructive/10 border border-destructive/20"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Database Reset Complete
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(resetResult.deleted).map(([table, count]) => (
                    <div key={table} className="flex justify-between p-2 rounded bg-background/50">
                      <span className="text-muted-foreground capitalize">{table}</span>
                      <span className="font-mono font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="destructive"
              onClick={() => {
                setResetConfirmText("");
                setShowResetModal(true);
              }}
              disabled={resetting || !address}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset All Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Reset Confirmation Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Database Reset
            </DialogTitle>
            <DialogDescription>
              This will delete ALL data from your database. On-chain state is
              unaffected. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm text-destructive">
                Type exactly:{" "}
                <strong className="font-mono">RESET_ALL_DATA</strong>
              </p>
            </div>

            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET_ALL_DATA"
              className="font-mono"
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowResetModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleResetDb}
                disabled={!canReset || resetting}
              >
                {resetting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Resetting...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" />Delete All Data</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TxToastContainer />
    </div>
  );
}
