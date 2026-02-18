"use client";

import React, { useState } from "react";
import { Wallet, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWallet, type DetectedWallet } from "@/providers/wallet-provider";

export function WalletConnectDialog() {
  const {
    isConnected,
    isConnecting,
    address,
    walletName,
    lovelaceBalance,
    availableWallets,
    connect,
    disconnect,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (walletId: string) => {
    setError(null);
    try {
      await connect(walletId);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect wallet"
      );
    }
  };

  // Connected state — show address + disconnect
  if (isConnected && address) {
    const adaBalance = (Number(lovelaceBalance) / 1_000_000).toFixed(2);
    const shortAddr = `${address.slice(0, 10)}...${address.slice(-6)}`;

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{adaBalance} ADA</span>
            <span className="border-l border-border pl-1.5 ml-0.5">
              {shortAddr}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {walletName || "Connected Wallet"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted p-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="font-mono text-xs break-all">{address}</p>
            </div>
            <div className="rounded-lg bg-muted p-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-lg font-bold">{adaBalance} ADA</p>
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Disconnected state — show wallet selection
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="trade" size="sm">
          <Wallet className="h-3.5 w-3.5" />
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Connect Wallet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {availableWallets.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                No Cardano wallet detected.
              </p>
              <p className="text-xs text-muted-foreground">
                Install{" "}
                <a
                  href="https://namiwallet.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Nami
                </a>
                ,{" "}
                <a
                  href="https://eternl.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Eternl
                </a>
                , or{" "}
                <a
                  href="https://www.lace.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Lace
                </a>{" "}
                to get started.
              </p>
            </div>
          ) : (
            availableWallets.map((w) => (
              <WalletOption
                key={w.id}
                wallet={w}
                isConnecting={isConnecting}
                onClick={() => handleConnect(w.id)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WalletOption({
  wallet,
  isConnecting,
  onClick,
}: {
  wallet: DetectedWallet;
  isConnecting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isConnecting}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
    >
      {wallet.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={wallet.icon}
          alt={wallet.name}
          className="h-8 w-8 rounded-lg"
        />
      ) : (
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
      )}
      <span className="font-medium text-sm">{wallet.name}</span>
      {isConnecting && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
    </button>
  );
}
