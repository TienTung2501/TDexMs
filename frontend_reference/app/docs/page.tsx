// ...existing code...
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ExternalLink } from "lucide-react"

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-card/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold mb-2">Documentation</h1>
          <p className="text-muted-foreground">Learn about Basket.Finance Protocol</p>
        </div>
      </section>

      <main className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <Card className="p-6 bg-card">
            <div>
              <h2 className="text-2xl font-bold mb-4">Resources</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Helpful links and documents for developers and integrators.
              </p>

              <div className="space-y-3">
                <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                  <a href="#" aria-label="GitHub Repository">
                    <span>GitHub Repository</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>

                <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                  <a href="#" aria-label="Whitepaper">
                    <span>Whitepaper</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>

                <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                  <a href="#" aria-label="Audit Report">
                    <span>Audit Report</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>

                <Button asChild variant="outline" className="w-full justify-between bg-transparent">
                  <a href="#" aria-label="FAQ">
                    <span>FAQ</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover:border-primary transition-colors cursor-pointer">
            <h3 className="font-semibold mb-1">API Reference</h3>
            <p className="text-sm text-muted-foreground">Integration guide for developers.</p>
          </Card>
        </div>
      </main>
      
    </div>
  )
}
      