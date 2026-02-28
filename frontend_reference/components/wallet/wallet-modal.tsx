'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Loader2, Check, Wallet2, Sparkles, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWallet } from '@/contexts/wallet'

interface WalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'roles' | 'wallet' | 'connecting' | 'success' | 'error'
type SelectedRoles = {
  investor: boolean
  creator: boolean
}

type ConnectedWallet = {
  name: string
  address: string
  balance: number
}

const walletOptions = [
  {
    id: 'eternl',
    name: 'Eternl',
    description: 'Advanced browser extension for power users',
    accent: 'from-sky-500/30 via-sky-500/10 to-transparent',
    icon: Wallet2,
  },
  {
    id: 'nami',
    name: 'Nami',
    description: 'Lightweight wallet with staking support',
    accent: 'from-amber-500/30 via-amber-500/10 to-transparent',
    icon: Sparkles,
  },
  {
    id: 'lace',
    name: 'Lace',
    description: 'IOG built wallet for everyday investors',
    accent: 'from-purple-500/30 via-purple-500/10 to-transparent',
    icon: Shield,
  },
] as const

const descriptions: Record<Step, string> = {
  roles: 'Select how you plan to use Basket.Finance',
  wallet: 'Choose a Cardano wallet provider to continue',
  connecting: 'Securely establishing connection with your wallet',
  success: 'Wallet connected successfully',
  error: 'Something went wrong while connecting',
}

const adaFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const generateMockAddress = (seed: string) => {
  const randomChunk = Math.random().toString(36).slice(2, 10)
  const timeChunk = Date.now().toString(36).slice(-6)
  return `addr1${seed.slice(0, 3)}${randomChunk}${timeChunk}`.slice(0, 56)
}

export function WalletModal({ open, onOpenChange }: WalletModalProps) {
  const router = useRouter()
  const { connectWallet } = useWallet()
  const [step, setStep] = useState<Step>('roles')
  const [error, setError] = useState('')
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<SelectedRoles>({ investor: false, creator: false })
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null)

  const selectedWallet = walletOptions.find((wallet) => wallet.id === selectedWalletId) ?? null

  const resetModal = () => {
    setStep('roles')
    setError('')
    setSelectedWalletId(null)
    setSelectedRoles({ investor: false, creator: false })
    setConnectedWallet(null)
  }

  const handleDialogChange = (next: boolean) => {
    if (!next) {
      resetModal()
    }
    onOpenChange(next)
  }

  const handleRoleToggle = (role: keyof SelectedRoles) => {
    setSelectedRoles((prev) => ({ ...prev, [role]: !prev[role] }))
  }

  const handleConnect = async () => {
    if (!selectedWallet) {
      setError('Please select a wallet provider to continue')
      return
    }

    if (!selectedRoles.investor && !selectedRoles.creator) {
      setError('Select at least one role before connecting')
      setStep('roles')
      return
    }

    setStep('connecting')
    setError('')

    try {
      await new Promise((resolve) => setTimeout(resolve, 1400))
      const mockBalance = Math.floor(Math.random() * 10000) + 1500
      const mockAddress = generateMockAddress(selectedWallet.id)

      connectWallet(mockAddress, mockBalance, {
        isCreator: selectedRoles.creator,
        isInvestor: selectedRoles.investor,
        provider: selectedWallet.name,
      })

      setConnectedWallet({ name: selectedWallet.name, address: mockAddress, balance: mockBalance })
      setStep('success')

      setTimeout(() => {
        const destination = selectedRoles.creator ? '/creator-dashboard' : '/dashboard'
        router.push(destination)
        handleDialogChange(false)
      }, 1600)
    } catch (err) {
      setError('Failed to connect wallet. Please try again.')
      setStep('error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>{descriptions[step]}</DialogDescription>
        </DialogHeader>

        {step === 'roles' && (
          <div className="space-y-3">
            {[
              {
                key: 'investor' as const,
                title: 'Investor Mode',
                description: 'Mint, redeem, and monitor baskets you invest in',
              },
              {
                key: 'creator' as const,
                title: 'Creator Mode',
                description: 'Launch new baskets and manage strategies',
              },
            ].map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => handleRoleToggle(role.key)}
                className={cn(
                  'w-full rounded-2xl border p-4 text-left transition-all',
                  selectedRoles[role.key]
                    ? 'border-primary bg-primary/5 shadow-[0_12px_30px_rgba(22,199,132,0.2)]'
                    : 'border-border/70 hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <p className="text-sm font-semibold">{role.title}</p>
                <p className="text-xs text-muted-foreground">{role.description}</p>
              </button>
            ))}
            <Button
              className="w-full"
              disabled={!selectedRoles.investor && !selectedRoles.creator}
              onClick={() => setStep('wallet')}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 'wallet' && (
          <div className="space-y-4">
            <div className="grid gap-3">
              {walletOptions.map((wallet) => {
                const Icon = wallet.icon
                return (
                <button
                  type="button"
                  key={wallet.id}
                  onClick={() => {
                    setSelectedWalletId(wallet.id)
                    setError('')
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border bg-card/80 p-4 text-left transition-all',
                    selectedWalletId === wallet.id
                      ? 'border-primary shadow-[0_15px_40px_rgba(22,199,132,0.25)]'
                      : 'border-border/70 hover:border-primary/40 hover:shadow-[0_10px_30px_rgba(15,23,42,0.15)]',
                  )}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${wallet.accent}`}>
                      <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold">{wallet.name}</p>
                    <p className="text-sm text-muted-foreground">{wallet.description}</p>
                  </div>
                  </button>
                )
              })}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('roles')}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleConnect} disabled={!selectedWallet}>
                Connect
              </Button>
            </div>
          </div>
        )}

        {step === 'connecting' && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <p className="font-semibold">Connecting wallet…</p>
            <p className="text-sm text-muted-foreground">Approve the connection request in your wallet</p>
          </div>
        )}

        {step === 'success' && connectedWallet && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10">
                <Check className="h-8 w-8 text-green-400" />
              </div>
              <p className="text-lg font-semibold">Wallet Connected</p>
              <p className="text-sm text-muted-foreground">
                Redirecting as{' '}
                {selectedRoles.creator && selectedRoles.investor
                  ? 'Creator & Investor'
                  : selectedRoles.creator
                    ? 'Creator'
                    : 'Investor'}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-xs uppercase text-muted-foreground">Wallet</p>
              <p className="text-sm font-semibold">{connectedWallet.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {connectedWallet.address.substring(0, 16)}…
                {connectedWallet.address.substring(connectedWallet.address.length - 8)}
              </p>
              <p className="mt-2 text-sm font-semibold">
                Balance: {adaFormatter.format(connectedWallet.balance)} ADA
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedRoles.investor && <Badge variant="outline">Investor</Badge>}
              {selectedRoles.creator && <Badge variant="outline">Creator</Badge>}
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <p className="font-semibold">Connection Failed</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button className="mt-6 w-full" onClick={() => setStep('wallet')}>
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
