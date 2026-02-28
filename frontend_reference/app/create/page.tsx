"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Trash2, Plus, ArrowRight, Check, AlertCircle } from "lucide-react"

type CreateStep = "info" | "preview" | "confirm" | "success" | "error"

const whitelistedAssets = [
  { symbol: "AGIX", name: "SingularityNET", oracle: "Charli3", liquidity: "High" },
  { symbol: "IAG", name: "Indigo Ag", oracle: "Charli3", liquidity: "High" },
  { symbol: "DJED", name: "Djed", oracle: "Charli3", liquidity: "Medium" },
  { symbol: "MELD", name: "Meld", oracle: "Charli3", liquidity: "High" },
  { symbol: "INDY", name: "Indy", oracle: "Charli3", liquidity: "Medium" },
  { symbol: "PLANET", name: "Planetarium", oracle: "Charli3", liquidity: "Medium" },
  { symbol: "MINSWAP", name: "MinSwap", oracle: "Charli3", liquidity: "High" },
]

export default function CreatePage() {
  const [step, setStep] = useState<CreateStep>("info")
  const [basketName, setBasketName] = useState("")
  const [basketSymbol, setBasketSymbol] = useState("")
  const [description, setDescription] = useState("")
  const [assets, setAssets] = useState<Array<{ symbol: string; weight: number }>>([
    { symbol: "AGIX", weight: 50 },
    { symbol: "IAG", weight: 50 },
  ])

  const totalWeight = assets.reduce((sum, a) => sum + a.weight, 0)
  const isValid = basketName && basketSymbol && description && totalWeight === 100

  const handleAddAsset = () => {
    setAssets([...assets, { symbol: "MELD", weight: 0 }])
  }

  const handleRemoveAsset = (idx: number) => {
    setAssets(assets.filter((_, i) => i !== idx))
  }

  const handleUpdateAsset = (idx: number, field: string, value: any) => {
    const updated = [...assets]
    updated[idx] = { ...updated[idx], [field]: value }
    setAssets(updated)
  }

  const handleDeploy = async () => {
    setStep("confirm")
    await new Promise((r) => setTimeout(r, 1500))
    setStep("success")
  }

  const infoStep = step === "info"
  const previewStep = step === "preview"
  const successStep = step === "success"
  const errorStep = step === "error"

  return (
    <div className="min-h-screen bg-background">
        {/* Page Header */}
        <section className="border-b border-border bg-card/50 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-3xl font-bold mb-2">Create New Basket</h1>
            <p className="text-muted-foreground">Deploy a new ETF basket to Cardano</p>
          </div>
        </section>

        {/* Progress Steps */}
        <section className="border-b border-border px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center justify-between">
              {["Info", "Preview", "Confirm"].map((label, idx) => (
                <div key={label} className="flex items-center flex-1">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-medium transition-all ${
                      idx === 0 && infoStep
                        ? "border-primary bg-primary text-primary-foreground"
                        : idx === 1 && (previewStep || successStep)
                          ? "border-primary bg-primary text-primary-foreground"
                          : idx === 2 && successStep
                            ? "border-primary bg-primary text-primary-foreground"
                            : successStep
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border"
                    }`}
                  >
                    {idx < 2 && successStep ? <Check className="w-5 h-5" /> : idx + 1}
                  </div>
                  <div className={`h-0.5 flex-1 mx-3 ${idx < 2 && successStep ? "bg-primary" : "bg-border"}`} />
                </div>
              ))}
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border font-medium">
                3
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl">
            {/* Info Step */}
            {infoStep && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Basket Name</label>
                  <Input
                    placeholder="e.g., bAI Index"
                    value={basketName}
                    onChange={(e) => setBasketName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Symbol</label>
                  <Input
                    placeholder="e.g., bAI"
                    value={basketSymbol}
                    onChange={(e) => setBasketSymbol(e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Describe your basket strategy..."
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium">Assets (from Whitelist)</label>
                    <span className={`text-xs ${totalWeight === 100 ? "text-green-400" : "text-yellow-600"}`}>
                      Total: {totalWeight}% {totalWeight !== 100 && "(Must equal 100%)"}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {assets.map((asset, idx) => (
                      <div key={idx} className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-muted-foreground mb-1">Asset</label>
                          <select
                            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            value={asset.symbol}
                            onChange={(e) => handleUpdateAsset(idx, "symbol", e.target.value)}
                          >
                            {whitelistedAssets.map((a) => (
                              <option key={a.symbol} value={a.symbol}>
                                {a.symbol} - {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="block text-xs text-muted-foreground mb-1">Weight %</label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={asset.weight}
                            onChange={(e) => handleUpdateAsset(idx, "weight", Number.parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveAsset(idx)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" className="mt-4 gap-2 bg-transparent" onClick={handleAddAsset}>
                    <Plus className="w-4 h-4" />
                    Add Asset
                  </Button>
                </div>

                <div className="flex gap-3 pt-6">
                  <Button variant="outline" className="flex-1 bg-transparent">
                    Cancel
                  </Button>
                  <Button onClick={() => setStep("preview")} disabled={!isValid} className="flex-1 gap-2">
                    Next <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Preview Step */}
            {previewStep && (
              <div className="space-y-6">
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Summary</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Basket Name</p>
                      <p className="font-medium">
                        {basketName} ({basketSymbol})
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Description</p>
                      <p className="text-sm">{description}</p>
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-sm font-medium mb-3">Asset Allocation</p>
                      <div className="space-y-2">
                        {assets.map((a) => (
                          <div key={a.symbol} className="flex justify-between text-sm">
                            <span>{a.symbol}</span>
                            <span className="font-medium">{a.weight}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-primary/5 border border-primary/20">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium mb-1">Verification Status</p>
                      <p className="text-muted-foreground">
                        All assets have been verified by ARO (Asset Risk Oracle). They have active price feeds and
                        sufficient liquidity.
                      </p>
                    </div>
                  </div>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setStep("info")}>
                    Back
                  </Button>
                  <Button onClick={() => handleDeploy()} className="flex-1 gap-2">
                    Deploy to Blockchain <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Success Step */}
            {successStep && (
              <div className="text-center py-12">
                <div className="flex justify-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">Basket Created Successfully!</h2>
                <p className="text-muted-foreground mb-6">
                  Your basket <span className="font-semibold text-foreground">{basketSymbol}</span> has been deployed to
                  Cardano.
                </p>
                <Card className="p-4 mb-6 text-left">
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Validator Address</p>
                      <p className="font-mono text-muted-foreground text-xs">addr1qz8...</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
                      <a href="#" className="text-primary hover:underline text-xs">
                        View on CardanoScan
                      </a>
                    </div>
                  </div>
                </Card>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent">
                    Back to Home
                  </Button>
                  <Button className="flex-1" onClick={() => (window.location.href = `/basket/1`)}>
                    View Basket
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
  )
}
