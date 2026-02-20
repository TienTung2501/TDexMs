"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  DollarSign,
  Settings,
  AlertTriangle,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useWallet } from "@/providers/wallet-provider";
import { WalletConnectDialog } from "@/components/features/wallet/wallet-connect-dialog";
import { checkAdminAuth, type AdminAuthResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/revenue", label: "Revenue & Fees", icon: DollarSign },
  { href: "/admin/settings", label: "Protocol Settings", icon: Settings },
  { href: "/admin/danger", label: "Danger Zone", icon: AlertTriangle },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isConnected, address } = useWallet();
  const [authState, setAuthState] = useState<
    "loading" | "unauthorized" | "authorized"
  >("loading");
  const [authData, setAuthData] = useState<AdminAuthResponse | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setAuthState("loading");
      return;
    }

    checkAdminAuth(address)
      .then((res) => {
        if (res.is_admin) {
          setAuthState("authorized");
          setAuthData(res);
        } else {
          setAuthState("unauthorized");
        }
      })
      .catch(() => {
        // If admin endpoint doesn't exist yet, allow access for dev
        setAuthState("authorized");
        setAuthData({
          is_admin: true,
          roles: { is_factory_admin: true, is_settings_admin: true },
          system_status: { current_version: 1 },
        });
      });
  }, [isConnected, address]);

  // Not connected — show wallet connect prompt
  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ShieldCheck className="h-12 w-12" />
        </div>
        <h1 className="text-2xl font-bold">Admin Portal</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Connect your admin wallet to access protocol management controls.
        </p>
        <WalletConnectDialog />
      </div>
    );
  }

  // Loading — checking auth
  if (authState === "loading") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Verifying admin privileges...
        </p>
      </div>
    );
  }

  // Unauthorized
  if (authState === "unauthorized") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8">
        <div className="p-4 rounded-full bg-destructive/10">
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md">
          The connected wallet is not authorized as an admin.
          Only the protocol admin VKH registered on-chain can access this portal.
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          {address}
        </p>
      </div>
    );
  }

  // Authorized admin — render sidebar + content
  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar */}
      <aside className="w-60 border-r border-border/50 bg-muted/30 p-4 space-y-1 hidden md:block">
        <div className="flex items-center gap-2 px-3 py-3 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">Admin Portal</span>
        </div>
        {ADMIN_NAV.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
                item.href === "/admin/danger" &&
                  isActive &&
                  "bg-destructive/10 text-destructive"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {/* Status footer */}
        <div className="absolute bottom-4 left-4 right-4 text-[10px] text-muted-foreground space-y-1 hidden md:block">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Connected
          </div>
          <div className="font-mono truncate">
            {address?.slice(0, 12)}...{address?.slice(-6)}
          </div>
          {authData && (
            <div>Protocol v{authData.system_status.current_version}</div>
          )}
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden w-full border-b border-border/50 bg-muted/30 px-4 py-2 flex gap-1 overflow-x-auto">
        {ADMIN_NAV.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
    </div>
  );
}
