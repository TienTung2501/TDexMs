import { DocsThemeConfig } from 'nextra-theme-docs'
import React from 'react'

const config: DocsThemeConfig = {
  logo: (
    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
      <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="4" fill="none" />
        <path d="M30 55 L45 35 L55 50 L70 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M30 70 L45 55 L55 65 L70 45" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
        <circle cx="50" cy="50" r="6" fill="currentColor" />
      </svg>
      SolverNet DEX
    </span>
  ),
  project: {
    link: 'https://github.com/TienTung2501',
  },
  docsRepositoryBase: 'https://github.com/TienTung2501/decentralize/tree/main/docs-site',
  footer: {
    text: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
          <a href="/docs" style={{ color: 'inherit', textDecoration: 'none' }}>Documentation</a>
          <a href="/docs/api-reference" style={{ color: 'inherit', textDecoration: 'none' }}>API Reference</a>
          <a href="/docs/smart-contracts" style={{ color: 'inherit', textDecoration: 'none' }}>Smart Contracts</a>
        </div>
        <span style={{ fontSize: '13px', opacity: 0.7 }}>
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
