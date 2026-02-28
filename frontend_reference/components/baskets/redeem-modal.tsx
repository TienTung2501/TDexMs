"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, Loader2, Check } from "lucide-react"

interface RedeemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  basketName: string
  basketSymbol: string
  composition: Array<{ asset: string; weight: number }>
  balance: number
}

type Status = "idle" | "building" | "confirming" | "processing" | "success" | "error"

export function RedeemModal({ open, onOpenChange, basketName, basketSymbol, composition, balance }: RedeemModalProps) {
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")

  const handleRedeem = async () => {
    const amountNum = Number.parseFloat(amount)
    if (!amount || amountNum <= 0 || amountNum > balance) {
      setError("Invalid amount")
      return
    }

    setStatus("building")
    setError("")

    try {
      await new Promise((r) => setTimeout(r, 1500))
      setStatus("confirming")
      await new Promise((r) => setTimeout(r, 1000))
      setStatus("processing")
      await new Promise((r) => setTimeout(r, 2000))
      setStatus("success")

      setTimeout(() => {
        onOpenChange(false)
        setStatus("idle")
        setAmount("")
      }, 2000)
    } catch (err) {
      setStatus("error")
      setError("Transaction failed. Please try again.")
    }
  }

  const estimatedADA = amount ? (Number.parseFloat(amount) * 1.05).toFixed(2) : "0"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redeem {basketSymbol} Tokens</DialogTitle>
        </DialogHeader>

        {status === "success" ? (
          <div className="py-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20">
                <Check className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <h3 className="font-semibold text-lg mb-2">Redeem Successful!</h3>
            <p className="text-sm text-muted-foreground mb-6">You received ~{estimatedADA} ADA</p>
          </div>
        ) : status === "error" ? (
          <div className="py-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            <h3 className="font-semibold text-lg mb-2">Transaction Failed</h3>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => setStatus("idle")} className="w-full">
              Try Again
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Amount ({basketSymbol})</label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setError("")
                }}
                disabled={status !== "idle"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                <a href="#" className="text-primary hover:underline">
                  Balance: {balance.toFixed(4)} {basketSymbol}
                </a>
              </p>
            </div>

            {amount && (
              <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. ADA Return</span>
                  <span className="font-medium">{estimatedADA}</span>
                </div>
                <div className="border-t border-border pt-2 mt-2 flex justify-between text-sm">
                  <span className="font-medium">Fee</span>
                  <span className="font-medium text-primary">0.5%</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => onOpenChange(false)}
                disabled={status !== "idle"}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleRedeem}
                disabled={status !== "idle" || !amount || Number.parseFloat(amount) <= 0}
              >
                {status === "idle" ? (
                  "Redeem"
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {status === "building" && "Building..."}
                    {status === "confirming" && "Confirming..."}
                    {status === "processing" && "Processing..."}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
