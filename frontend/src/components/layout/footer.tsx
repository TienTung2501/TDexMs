import Link from "next/link";
import { Github, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background/50">
      <div className="shell py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                S
              </div>
              <span className="font-bold">SolverNet DEX</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Intent-based decentralized exchange on Cardano. Powered by solver
              architecture for optimal trade execution.
            </p>
          </div>

          {/* Protocol */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Protocol</h4>
            <nav className="flex flex-col gap-2">
              <Link
                href="/pools"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Liquidity Pools
              </Link>
              <Link
                href="/analytics"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Analytics
              </Link>
              <Link
                href="/admin"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Admin
              </Link>
            </nav>
          </div>

          {/* Resources */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Resources</h4>
            <nav className="flex flex-col gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </a>
              <a
                href="https://cardano.org"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Cardano
              </a>
            </nav>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>Built on Cardano &bull; Open Source</p>
          <p>SolverNet Protocol &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </footer>
  );
}
