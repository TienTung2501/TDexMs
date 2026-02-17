"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Waves,
  Wallet,
  BarChart3,
  ClipboardList,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/providers/wallet-provider";
import { truncateAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Swap", icon: ArrowLeftRight },
  { href: "/pools", label: "Pools", icon: Waves },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { isConnected, address, connect, disconnect } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="shell flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg transition-colors group-hover:bg-primary/20">
            S
          </div>
          <span className="text-lg font-bold hidden sm:block">
            SolverNet
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Wallet */}
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={disconnect}
              className="font-mono text-xs"
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              {truncateAddress(address || "")}
            </Button>
          ) : (
            <Button variant="trade" size="sm" onClick={connect}>
              <Wallet className="h-3.5 w-3.5" />
              Connect
            </Button>
          )}

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <nav className="shell flex flex-col gap-1 py-3">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
