import { DocsThemeConfig } from 'nextra-theme-docs'
import React from 'react'

const config: DocsThemeConfig = {
  logo: (
    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '8px',
        background: 'rgba(59,130,246,0.15)',
        color: '#3B82F6',
        fontWeight: 700,
        fontSize: '16px',
        lineHeight: 1,
      }}>
        S
      </span>
      SolverNet DEX
    </span>
  ),
  project: {
    link: 'https://github.com/TienTung2501/TDexMs',
  },
  docsRepositoryBase: 'https://github.com/TienTung2501/TDexMs/tree/main/docs-site',
  darkMode: true,
  nextThemes: {
    defaultTheme: 'dark',
  },
  footer: {
    text: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
          <a href="/docs" style={{ color: 'inherit', textDecoration: 'none' }}>Documentation</a>
          <a href="/docs/api-reference" style={{ color: 'inherit', textDecoration: 'none' }}>API Reference</a>
          <a href="/docs/smart-contracts" style={{ color: 'inherit', textDecoration: 'none' }}>Smart Contracts</a>
        </div>
        <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>
          Developed by <strong>Nguyen Tien Tung</strong> — Cardano Blockchain Developer
        </div>
        <span style={{ fontSize: '12px', opacity: 0.5 }}>
          © 2025 SolverNet DEX — Built on Cardano
        </span>
      </div>
    ),
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  navigation: {
    prev: true,
    next: true,
  },
  editLink: {
    text: 'Edit this page on GitHub →',
  },
  feedback: {
    content: 'Questions? Give us feedback →',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="SolverNet DEX — Intent-based Decentralized Exchange on Cardano" />
      <meta name="og:title" content="SolverNet DEX Documentation" />
      <meta name="og:description" content="Comprehensive documentation for SolverNet DEX — an intent-based DEX built on Cardano with Plutus V3 smart contracts" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    </>
  ),
  useNextSeoProps() {
    return {
      titleTemplate: '%s – SolverNet DEX Docs',
    }
  },
  primaryHue: 210,
  primarySaturation: 100,
  banner: {
    key: 'preprod-notice',
    text: (
      <a href="/docs/getting-started/quickstart" style={{ color: 'inherit', textDecoration: 'none' }}>
        🚀 SolverNet DEX is live on Cardano Preprod Testnet. Get started →
      </a>
    ),
  },
}

export default config
