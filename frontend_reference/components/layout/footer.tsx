import Link from 'next/link'
import { Github, ArrowUpRight, Shield, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function Footer() {
  return (
    <footer className="border-t border-border/70 bg-background/95">
      <div className="shell py-12">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold">Basket.Finance</p>
              <p className="text-sm text-muted-foreground">
                Create, invest, and manage on-chain ETF baskets with institutional-grade automation and risk tooling.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1 text-xs">
                <Shield className="h-3 w-3" />
                Audited Contracts
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs">
                <Zap className="h-3 w-3" />
                Auto Rebalance
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="gap-2 w-fit" asChild>
              <Link href="https://github.com" target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" />
                View GitHub
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/explore" className="transition-colors hover:text-primary">
                  Explore Baskets
                </Link>
              </li>
              <li>
                <Link href="/create" className="transition-colors hover:text-primary">
                  Create Basket
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="transition-colors hover:text-primary">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Developers</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/docs" className="transition-colors hover:text-primary">
                  Docs
                </Link>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-primary">
                  API Reference
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Community</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="transition-colors hover:text-primary">
                  Discord
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-primary">
                  Twitter
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-primary">
                  Forum
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 text-sm text-muted-foreground flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 Built by Tien Tung, Basket.Finance · Cardano ETF Factory 
            <li>
                <a href="https://github.com/TienTung2501" target="_blank" rel="noreferrer" className="transition-colors hover:text-primary">
                  GitHub
                </a>
              </li></p>
          <div className="flex flex-wrap gap-4">
            <a href="#" className="transition-colors hover:text-primary">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-primary">
              Terms
            </a>
            <a href="#" className="transition-colors hover:text-primary">
              Status
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
