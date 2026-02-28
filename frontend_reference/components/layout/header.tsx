'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Menu, LogOut, Zap, X, Wallet2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WalletModal } from '@/components/wallet/wallet-modal'
import { useWallet } from '@/contexts/wallet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'

export function Header() {
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const {
    isConnected,
    walletAddress,
    walletBalance,
    walletProvider,
    disconnectWallet,
    isCreator,
    isInvestor,
    currentRole,
    switchRole,
  } = useWallet()

  const handleDisconnect = () => {
    disconnectWallet()
    router.push('/')
  }

  const handleRoleSwitch = (role: 'investor' | 'creator') => {
    switchRole(role)
    if (role === 'creator') {
      router.push('/creator-dashboard')
    } else {
      router.push('/dashboard')
    }
  }

  const displayAddress = walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 6)}` : ''
  const balanceLabel = `${walletBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} ADA`
  const providerLabel = walletProvider ?? 'Connected Wallet'

  const baseNav = [
    { label: 'Explore', href: '/explore' },
    { label: 'Overview', href: '/overview' },
    { label: 'Create', href: '/create' },
    { label: 'Portfolio', href: '/portfolio' },
    { label: 'Monitor', href: '/monitor' },
    { label: 'Members', href: '/members' },
    { label: 'Docs', href: '/docs' },
  ]

  const navItems = [...baseNav]
  if (isConnected && currentRole === 'investor') {
    navItems.push({ label: 'Portfolio', href: '/dashboard' })
  }
  if (isConnected && currentRole === 'creator') {
    navItems.push({ label: 'Dashboard', href: '/creator-dashboard' })
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="border-b border-border/60 bg-muted/30">
          <div className="shell flex flex-wrap items-center justify-between gap-3 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-secondary/60 text-secondary-foreground">
                Cardano Mainnet Ready
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                Auto-Rebalance · 24/7
              </Badge>
            </div>
            <p className="text-muted-foreground/80">
              Institutional-grade ETF tooling built for Cardano investors
            </p>
          </div>
        </div>
        <div className="shell flex flex-col gap-3 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-400 shadow-inner shadow-emerald-500/30">
                <span className="text-base font-bold text-primary-foreground">BF</span>
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-lg font-semibold leading-tight">Basket.Finance</span>
                <span className="text-xs text-muted-foreground">ETF Factory for Cardano</span>
              </div>
            </Link>

            <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/15 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              {isConnected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden sm:flex items-center gap-3 rounded-full border-primary/40 bg-gradient-to-r from-primary to-emerald-400 px-4 py-2 text-white shadow-lg shadow-primary/40"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                        <Wallet2 className="h-4 w-4" />
                      </span>
                      <div className="text-left leading-tight">
                        <p className="text-[10px] uppercase tracking-wide text-white/70">{providerLabel}</p>
                        <p className="text-sm font-semibold">{displayAddress || providerLabel}</p>
                      </div>
                      <span className="text-sm font-semibold">{balanceLabel}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <p className="text-xs uppercase text-muted-foreground">Wallet</p>
                      <p className="text-sm font-semibold text-foreground">{providerLabel}</p>
                      {walletAddress && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {walletAddress.substring(0, 18)}…{walletAddress.substring(walletAddress.length - 6)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Balance · {balanceLabel}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {isInvestor && isCreator && (
                      <>
                        <div className="px-2 py-1.5">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">Switch role</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRoleSwitch('investor')}
                              className={cn(
                                'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                                currentRole === 'investor'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
                              )}
                            >
                              Investor
                            </button>
                            <button
                              onClick={() => handleRoleSwitch('creator')}
                              className={cn(
                                'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                                currentRole === 'creator'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
                              )}
                            >
                              Creator
                            </button>
                          </div>
                        </div>
                        <DropdownMenuSeparator />
                      </>
                    )}

                    {currentRole === 'investor' ? (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/portfolio" className="cursor-pointer">
                            Portfolio
                          </Link>
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem asChild>
                        <Link href="/creator-dashboard" className="cursor-pointer">
                          <Zap className="mr-2 h-4 w-4" />
                          Creator Dashboard
                        </Link>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="sm"
                  className="hidden sm:inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-emerald-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/35"
                  onClick={() => setWalletModalOpen(true)}
                >
                  <Wallet2 className="h-4 w-4" />
                  Connect Wallet
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Toggle navigation"
                onClick={() => setMobileNavOpen((prev) => !prev)}
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-border/60 bg-background/95">
            <nav className="flex flex-col gap-1 px-4 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/15 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {!isConnected && (
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setWalletModalOpen(true)
                    setMobileNavOpen(false)
                  }}
                >
                  Connect Wallet
                </Button>
              )}
            </nav>
          </div>
        )}
      </header>

      <WalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
    </>
  )
}
