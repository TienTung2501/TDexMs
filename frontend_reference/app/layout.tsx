import type React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { WalletProvider } from '@/contexts/wallet'
import { ThemeProvider } from '@/components/theme-provider'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Basket.Finance - ETF Factory for Cardano',
  description: 'Create, invest, and manage decentralized ETF baskets on Cardano',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-background text-foreground">
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <WalletProvider>
            <div className="flex min-h-screen flex-col bg-background">
              <Header />
              <main className="flex-1 bg-background">{children}</main>
              <Footer />
            </div>
            <Analytics />
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
