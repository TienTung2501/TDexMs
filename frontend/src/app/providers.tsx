"use client";

import { ThemeProvider } from "@/providers/theme-provider";
import { WalletProvider } from "@/providers/wallet-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <WalletProvider>
        <TooltipProvider delayDuration={200}>
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </TooltipProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}
