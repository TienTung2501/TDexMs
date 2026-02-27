import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    // suppressHydrationWarning is required for next-themes dark mode
    // to prevent hydration mismatch when defaultTheme or storageKey
    // causes the `class` attribute on <html> to differ between SSR and client.
    <Html suppressHydrationWarning lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
