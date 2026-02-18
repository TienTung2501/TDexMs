"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

// Inline mock wallet data (replace with CIP-30 wallet integration in production)
const DEMO_WALLET = {
  address:
    "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp",
  balances: {
    ADA: 1_500_000_000,
    HOSKY: 10_000_000_000,
    DJED: 2_500_000_000,
    MELD: 15_000_000_000,
    MIN: 8_000_000_000,
    INDY: 500_000_000,
    SNEK: 25_000_000_000,
    WMT: 3_000_000_000,
  } as Record<string, number>,
};

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  balances: Record<string, number>;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  address: null,
  balances: {},
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});

  const connect = useCallback(() => {
    // Demo wallet connection — replace with CIP-30 integration later
    setIsConnected(true);
    setAddress(DEMO_WALLET.address);
    setBalances(DEMO_WALLET.balances);
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress(null);
    setBalances({});
  }, []);

  return (
    <WalletContext.Provider
      value={{ isConnected, address, balances, connect, disconnect }}
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
