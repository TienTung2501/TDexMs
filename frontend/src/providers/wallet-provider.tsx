"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { TOKEN_LIST } from "@/lib/mock-data";

// ─── CIP-30 type declarations ───────────────
// These match the CIP-30 wallet connector standard
// https://cips.cardano.org/cip/CIP-0030/

interface CIP30WalletApi {
  getNetworkId(): Promise<number>;
  getUtxos(amount?: string, paginate?: { page: number; limit: number }): Promise<string[] | undefined>;
  getBalance(): Promise<string>;
  getUsedAddresses(paginate?: { page: number; limit: number }): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
  getCollateral?(params?: { amount?: string }): Promise<string[] | undefined>;
  experimental?: Record<string, unknown>;
}

interface CIP30WalletEntry {
  name: string;
  icon: string;
  apiVersion: string;
  enable(): Promise<CIP30WalletApi>;
  isEnabled(): Promise<boolean>;
}

/** Access window.cardano safely */
function getCardanoObj(): Record<string, CIP30WalletEntry> | undefined {
  if (typeof window === "undefined") return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).cardano as Record<string, CIP30WalletEntry> | undefined;
}

// ═══════════════════════════════════════════
// Wallet context
// ═══════════════════════════════════════════

export interface DetectedWallet {
  id: string;
  name: string;
  icon: string;
}

interface WalletContextType {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  changeAddress: string | null;
  networkId: number | null;
  walletName: string | null;

  // Balance (lovelace)
  lovelaceBalance: bigint;

  // Available wallets
  availableWallets: DetectedWallet[];

  // Actions
  connect: (walletId: string) => Promise<void>;
  disconnect: () => void;
  signTx: (unsignedTxCbor: string) => Promise<string>;
  submitTx: (signedTxCbor: string) => Promise<string>;
  signAndSubmitTx: (unsignedTxCbor: string) => Promise<string>;

  // Legacy compat
  balances: Record<string, number>;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  isConnecting: false,
  address: null,
  changeAddress: null,
  networkId: null,
  walletName: null,
  lovelaceBalance: 0n,
  availableWallets: [],
  connect: async () => {},
  disconnect: () => {},
  signTx: async () => "",
  submitTx: async () => "",
  signAndSubmitTx: async () => "",
  balances: {},
});

// ─── Helpers ────────────────────────────────

/** Detect CIP-30 wallets available in window.cardano */
function detectWallets(): DetectedWallet[] {
  const cardano = getCardanoObj();
  if (!cardano) return [];

  const KNOWN_WALLETS = [
    "nami",
    "eternl",
    "lace",
    "flint",
    "yoroi",
    "gerowallet",
    "typhoncip30",
    "nufi",
    "begin",
    "vespr",
    "tokeo",
  ];

  const detected: DetectedWallet[] = [];
  for (const id of KNOWN_WALLETS) {
    const entry = cardano[id];
    if (entry && typeof entry.enable === "function") {
      detected.push({
        id,
        name: entry.name || id,
        icon: entry.icon || "",
      });
    }
  }
  return detected;
}

/** Parse CBOR-encoded value to extract lovelace.
 *  CIP-30 getBalance() returns CBOR hex. Lovelace-only is a simple integer.
 *  When multi-asset, it's [lovelace, {policyId: {assetName: qty}}].
 *  We use a simple parser for the common cases. */
function parseBalanceCbor(hex: string): bigint {
  try {
    // Convert hex to bytes
    const bytes = new Uint8Array(
      hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
    );

    // Simple CBOR integer parsing for lovelace-only balances
    const major = bytes[0] >> 5;
    const additional = bytes[0] & 0x1f;

    if (major === 0) {
      // Unsigned integer
      if (additional < 24) return BigInt(additional);
      if (additional === 24) return BigInt(bytes[1]);
      if (additional === 25) return BigInt((bytes[1] << 8) | bytes[2]);
      if (additional === 26) {
        return BigInt(
          (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]
        );
      }
      if (additional === 27) {
        // 8-byte unsigned
        let val = 0n;
        for (let i = 1; i <= 8; i++) {
          val = (val << 8n) | BigInt(bytes[i]);
        }
        return val;
      }
    }

    // CBOR array [lovelace, multiasset_map]
    if (major === 4) {
      // Array — first element is the lovelace amount
      // Recursively parse the first element starting at byte 1
      const inner = hex.slice(2); // skip array header byte
      return parseBalanceCbor(inner);
    }

    // Tag-wrapped (e.g., tag 2 for bignum)
    if (major === 6) {
      // Skip tag and parse inner
      if (additional < 24) return parseBalanceCbor(hex.slice(2));
    }

    return 0n;
  } catch {
    return 0n;
  }
}

/** Convert hex-encoded address to bech32 using Lucid (lazy loaded) */
let lucidModule: typeof import("@lucid-evolution/lucid") | null = null;

async function getLucidModule() {
  if (!lucidModule) {
    lucidModule = await import("@lucid-evolution/lucid");
  }
  return lucidModule;
}

async function hexAddressToBech32(hexAddr: string): Promise<string> {
  try {
    const { CML } = await getLucidModule();
    const addr = CML.Address.from_hex(hexAddr);
    const bech32 = addr.to_bech32(undefined);
    addr.free();
    return bech32;
  } catch {
    // Fallback: return hex if conversion fails
    return hexAddr;
  }
}

// ─── Persistance key ────────────────────────
const STORAGE_KEY = "solvernet_last_wallet";

// ═══════════════════════════════════════════
// Provider component
// ═══════════════════════════════════════════

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [changeAddress, setChangeAddress] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [lovelaceBalance, setLovelaceBalance] = useState<bigint>(0n);
  const [nativeBalances, setNativeBalances] = useState<Record<string, bigint>>({});
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>(
    []
  );

  // CIP-30 API ref
  const walletApiRef = useRef<CIP30WalletApi | null>(null);

  // Detect wallets on mount
  useEffect(() => {
    // CIP-30 wallets inject after page load; retry a few times
    let attempts = 0;
    const detect = () => {
      const wallets = detectWallets();
      setAvailableWallets(wallets);
      attempts++;
      if (wallets.length === 0 && attempts < 5) {
        setTimeout(detect, 500);
      }
    };
    detect();
  }, []);

  // Auto-reconnect to last wallet
  useEffect(() => {
    if (availableWallets.length === 0) return;
    const lastWallet = localStorage.getItem(STORAGE_KEY);
    if (lastWallet && availableWallets.some((w) => w.id === lastWallet)) {
      connect(lastWallet).catch(() => {
        localStorage.removeItem(STORAGE_KEY);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableWallets]);

  // ── connect ────────────────────────────

  const connect = useCallback(async (walletId: string) => {
    const cardano = getCardanoObj();
    if (!cardano?.[walletId]) {
      throw new Error(`Wallet "${walletId}" not found`);
    }

    setIsConnecting(true);
    try {
      const api = await cardano[walletId].enable();
      walletApiRef.current = api;

      // Network
      const netId = await api.getNetworkId();
      setNetworkId(netId);

      // Addresses
      const usedAddresses = await api.getUsedAddresses();
      const unusedAddresses = await api.getUnusedAddresses();
      const rawAddr = usedAddresses[0] || unusedAddresses[0];
      const rawChange = await api.getChangeAddress();

      const bech32Addr = rawAddr ? await hexAddressToBech32(rawAddr) : null;
      const bech32Change = rawChange
        ? await hexAddressToBech32(rawChange)
        : bech32Addr;

      setAddress(bech32Addr);
      setChangeAddress(bech32Change);

      // Balance (lovelace + native tokens via UTxOs)
      const balanceCbor = await api.getBalance();
      const lovelace = parseBalanceCbor(balanceCbor);
      setLovelaceBalance(lovelace);

      // B10 fix: Parse native token balances from UTxOs
      try {
        const utxosCbor = await api.getUtxos();
        if (utxosCbor && utxosCbor.length > 0) {
          const { Lucid, Blockfrost } = await getLucidModule();
          const lucidInst = await Lucid(
            new Blockfrost(
              process.env.NEXT_PUBLIC_BLOCKFROST_URL ||
                "https://cardano-preprod.blockfrost.io/api/v0",
              process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || ""
            ),
            "Preprod",
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lucidInst.selectWallet.fromAPI(api as any);
          const utxos = await lucidInst.wallet().getUtxos();

          const tokenTotals: Record<string, bigint> = {};
          for (const utxo of utxos) {
            for (const [unit, qty] of Object.entries(utxo.assets)) {
              if (unit === "lovelace") continue;
              tokenTotals[unit] = (tokenTotals[unit] || 0n) + qty;
            }
          }
          setNativeBalances(tokenTotals);
        }
      } catch (e) {
        console.warn("Failed to parse native token balances:", e);
      }

      setWalletName(cardano[walletId].name || walletId);
      setIsConnected(true);

      // Persist
      localStorage.setItem(STORAGE_KEY, walletId);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      walletApiRef.current = null;
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ── disconnect ─────────────────────────

  const disconnect = useCallback(() => {
    walletApiRef.current = null;
    setIsConnected(false);
    setAddress(null);
    setChangeAddress(null);
    setNetworkId(null);
    setWalletName(null);
    setLovelaceBalance(0n);
    setNativeBalances({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ── signTx ─────────────────────────────
  // Takes unsigned TX CBOR hex, returns witness set CBOR hex

  const signTx = useCallback(
    async (unsignedTxCbor: string): Promise<string> => {
      const api = walletApiRef.current;
      if (!api) throw new Error("Wallet not connected");
      // partialSign = true: allows backend (solver) to add its own witnesses later
      return api.signTx(unsignedTxCbor, true);
    },
    []
  );

  // ── submitTx ───────────────────────────
  // Takes fully signed TX CBOR hex, submits to chain, returns TX hash

  const submitTx = useCallback(
    async (signedTxCbor: string): Promise<string> => {
      const api = walletApiRef.current;
      if (!api) throw new Error("Wallet not connected");
      return api.submitTx(signedTxCbor);
    },
    []
  );

  // ── signAndSubmitTx ────────────────────
  // Full flow: sign unsigned TX → assemble → submit → return TX hash

  const signAndSubmitTx = useCallback(
    async (unsignedTxCbor: string): Promise<string> => {
      const api = walletApiRef.current;
      if (!api) throw new Error("Wallet not connected");

      // Use Lucid to assemble the signed TX
      const { Lucid, Blockfrost } = await getLucidModule();

      const lucid = await Lucid(
        new Blockfrost(
          process.env.NEXT_PUBLIC_BLOCKFROST_URL ||
            "https://cardano-preprod.blockfrost.io/api/v0",
          process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || ""
        ),
        "Preprod"
      );

      // Connect Lucid to the CIP-30 wallet
      // Cast to any because our CIP30WalletApi has optional getCollateral while Lucid expects required
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lucid.selectWallet.fromAPI(api as any);

      // Reconstruct TxSignBuilder from the unsigned CBOR
      const txSignBuilder = lucid.fromTx(unsignedTxCbor);

      // Sign with wallet
      const signed = await txSignBuilder.sign.withWallet().complete();

      // Submit
      const txHash = await signed.submit();

      // Refresh balance after submission
      try {
        const balanceCbor = await api.getBalance();
        setLovelaceBalance(parseBalanceCbor(balanceCbor));
      } catch {
        // non-critical
      }

      return txHash;
    },
    []
  );

  // B10 fix: Build balances object with ADA + all native tokens
  // Maps ticker → human-readable amount using TOKEN_LIST for decimals
  const balances: Record<string, number> = useMemo(() => {
    const result: Record<string, number> = {
      ADA: Number(lovelaceBalance) / 1_000_000,
    };

    // Build a unit→Token lookup for known tokens
    for (const token of TOKEN_LIST) {
      if (!token.policyId) continue; // skip ADA
      const unit = token.policyId + token.assetName;
      const qty = nativeBalances[unit];
      if (qty !== undefined && qty > 0n) {
        result[token.ticker] =
          Number(qty) / Math.pow(10, token.decimals);
      }
    }

    // Also include unknown tokens by their unit ID
    for (const [unit, qty] of Object.entries(nativeBalances)) {
      const isKnown = TOKEN_LIST.some(
        (t) => t.policyId && t.policyId + t.assetName === unit,
      );
      if (!isKnown && qty > 0n) {
        result[unit] = Number(qty); // raw quantity for unknown tokens
      }
    }

    return result;
  }, [lovelaceBalance, nativeBalances]);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        isConnecting,
        address,
        changeAddress,
        networkId,
        walletName,
        lovelaceBalance,
        availableWallets,
        connect,
        disconnect,
        signTx,
        submitTx,
        signAndSubmitTx,
        balances,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
