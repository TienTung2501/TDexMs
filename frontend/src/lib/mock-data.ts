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
  logo: string; // emoji fallback
  image?: string; // URL to token icon (IPFS / CDN)
  color?: string; // brand color for charts
}

export const TOKENS: Record<string, Token> = {
  ADA: {
    policyId: "",
    assetName: "",
    ticker: "ADA",
    name: "Cardano",
    decimals: 6,
    logo: "₳",
    image: "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreif6tchtgcyxdk2xk2cxmkymbzc2i475ptq6qravf3fbkczxq3swva?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
    color: "#0033ad",
  },
  tBTC: {
    policyId: "a257a1387d2908c0823a776bc4638ab42217e4682bcd416df0d139de",
    assetName: "74425443",
    ticker: "tBTC",
    name: "Test Bitcoin",
    decimals: 8,
    logo: "₿",
    image: "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreigqrejn2u3eiclyx4fnfoownopkjcmjm2atsqvl6c4koyboi2647a?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
    color: "#f7931a",
  },
  tUSD: {
    policyId: "a257a1387d2908c0823a776bc4638ab42217e4682bcd416df0d139de",
    assetName: "7455534454",
    ticker: "tUSD",
    name: "Test USD Stablecoin",
    decimals: 6,
    logo: "💲",
    image: "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreia6nhyo7edo5vtraapffk3auczsz4spyl2gs7lmpseitocinbl6pa?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
    color: "#26a17b",
  },
  tSOL: {
    policyId: "20446ece88e97c06cdac86db0dbf7515b44a3de4aa09e04c66ea0340",
    assetName: "74534f4c",
    ticker: "tSOL",
    name: "Test Solana",
    decimals: 9,
    logo: "◎",
    image: "https://ivory-deaf-guineafowl-894.mypinata.cloud/ipfs/bafkreiawzklak2whua24ori2glshvlffqofluf4ursxsbbjzgnupxcntqm?pinataGatewayToken=ZF-2NSDMZeCixzMlrJNPo0-N-mcMc51IGpbOuHB5uduKMyNRGFVkOu9QbYj8HO13",
    color: "#9945ff",
  },
  HOSKY: {
    policyId: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d5d3c6d0",
    assetName: "484f534b59",
    ticker: "HOSKY",
    name: "Hosky Token",
    decimals: 0,
    logo: "🐕",
    color: "#ff6b35",
  },
  DJED: {
    policyId: "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880",
    assetName: "444a4544",
    ticker: "DJED",
    name: "Djed Stablecoin",
    decimals: 6,
    logo: "💵",
    color: "#00d1b2",
  },
  MELD: {
    policyId: "6ac8ef3c3c3c7e4e5a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
    assetName: "4d454c44",
    ticker: "MELD",
    name: "MELD",
    decimals: 6,
    logo: "🔷",
    color: "#0088cc",
  },
  MIN: {
    policyId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6",
    assetName: "4d494e",
    ticker: "MIN",
    name: "Minswap",
    decimals: 6,
    logo: "🐱",
    color: "#6366f1",
  },
  INDY: {
    policyId: "533bb94a8850ee3ccbe483106489399112b74c905342cb1f14f12381",
    assetName: "494e4459",
    ticker: "INDY",
    name: "Indigo",
    decimals: 6,
    logo: "🟣",
    color: "#7c3aed",
  },
  SNEK: {
    policyId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
    assetName: "534e454b",
    ticker: "SNEK",
    name: "Snek",
    decimals: 0,
    logo: "🐍",
    color: "#84cc16",
  },
  WMT: {
    policyId: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e",
    assetName: "574d54",
    ticker: "WMT",
    name: "World Mobile",
    decimals: 6,
    logo: "🌐",
    color: "#0ea5e9",
  },
};

export const TOKEN_LIST = Object.values(TOKENS);

// ─── Dynamic Token Merge (R-10 fix) ────────
// Call `loadDynamicTokens()` on app init to merge on-chain tokens from the backend
// with the static TOKENS registry above. Unknown tokens get a generic fallback icon.
let _dynamicTokens: Token[] = [];

export function getDynamicTokenList(): Token[] {
  if (_dynamicTokens.length > 0) return _dynamicTokens;
  return TOKEN_LIST;
}

export async function loadDynamicTokens(): Promise<void> {
  try {
    const { fetchTokenRegistry } = await import("./api");
    const remote = await fetchTokenRegistry();
    const merged = new Map<string, Token>();
    // Build ticker→key lookup so remote tokens can overwrite static by ticker
    const tickerToKey = new Map<string, string>();
    // Static tokens first (higher quality metadata)
    for (const t of TOKEN_LIST) {
      const key = t.policyId ? `${t.policyId}.${t.assetName}` : "lovelace";
      merged.set(key, t);
      tickerToKey.set(t.ticker.toLowerCase(), key);
    }
    // Overlay dynamic tokens — merge by policyId key, or update existing by ticker match
    for (const rt of remote) {
      const key = rt.policyId ? `${rt.policyId}.${rt.assetName}` : "lovelace";
      if (merged.has(key)) {
        // Already exists with same policyId — keep static metadata
        continue;
      }
      // Check if a static token with the same ticker exists but different policyId
      const existingKey = tickerToKey.get(rt.ticker.toLowerCase());
      if (existingKey && existingKey !== key) {
        // Replace the old static entry with real on-chain data, preserving metadata
        const existing = merged.get(existingKey)!;
        merged.delete(existingKey);
        merged.set(key, {
          ...existing,
          policyId: rt.policyId,
          assetName: rt.assetName,
          ticker: rt.ticker,
          decimals: rt.decimals,
        });
        tickerToKey.set(rt.ticker.toLowerCase(), key);
      } else if (!merged.has(key)) {
        merged.set(key, {
          policyId: rt.policyId,
          assetName: rt.assetName,
          ticker: rt.ticker,
          name: rt.ticker,
          decimals: rt.decimals,
          logo: "🪙",
        });
        tickerToKey.set(rt.ticker.toLowerCase(), key);
      }
    }
    _dynamicTokens = Array.from(merged.values());
  } catch {
    // Silently fall back to static tokens
  }
}

// ─── Token Icon Helper ──────────────────────
/** Return image URL or fallback emoji for a token */
export function getTokenIcon(token: Token): { type: "image" | "emoji"; value: string } {
  if (token.image) return { type: "image", value: token.image };
  return { type: "emoji", value: token.logo };
}
