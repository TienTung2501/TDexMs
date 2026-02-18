// ═══════════════════════════════════════════
// Token Registry — SolverNet DEX
// Maps on-chain policyId/assetName to display metadata.
// Used by hooks.ts (resolveToken) and components (TokenSelect).
// ═══════════════════════════════════════════

// ─── Token Registry ─────────────────────────
export interface Token {
  policyId: string;
  assetName: string;
  ticker: string;
  name: string;
  decimals: number;
  logo: string; // emoji placeholder
}

export const TOKENS: Record<string, Token> = {
  ADA: {
    policyId: "",
    assetName: "",
    ticker: "ADA",
    name: "Cardano",
    decimals: 6,
    logo: "₳",
  },
  HOSKY: {
    policyId: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d5d3c6d0",
    assetName: "484f534b59",
    ticker: "HOSKY",
    name: "Hosky Token",
    decimals: 0,
    logo: "🐕",
  },
  DJED: {
    policyId: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880",
    assetName: "444a4544",
    ticker: "DJED",
    name: "Djed Stablecoin",
    decimals: 6,
    logo: "💵",
  },
  MELD: {
    policyId: "6ac8ef3c3c3c7e4e5a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
    assetName: "4d454c44",
    ticker: "MELD",
    name: "MELD",
    decimals: 6,
    logo: "🔷",
  },
  MIN: {
    policyId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6",
    assetName: "4d494e",
    ticker: "MIN",
    name: "Minswap",
    decimals: 6,
    logo: "🐱",
  },
  INDY: {
    policyId: "533bb94a8850ee3ccbe483106489399112b74c905342cb1f14f12381",
    assetName: "494e4459",
    ticker: "INDY",
    name: "Indigo",
    decimals: 6,
    logo: "🟣",
  },
  SNEK: {
    policyId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
    assetName: "534e454b",
    ticker: "SNEK",
    name: "Snek",
    decimals: 0,
    logo: "🐍",
  },
  WMT: {
    policyId: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e",
    assetName: "574d54",
    ticker: "WMT",
    name: "World Mobile",
    decimals: 6,
    logo: "🌐",
  },
};

export const TOKEN_LIST = Object.values(TOKENS);
