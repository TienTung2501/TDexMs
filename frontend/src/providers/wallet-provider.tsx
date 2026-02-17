"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { MOCK_WALLET } from "@/lib/mock-data";

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
    // Mock wallet connection — replace with CIP-30 integration later
    setIsConnected(true);
    setAddress(MOCK_WALLET.address);
    setBalances(MOCK_WALLET.balances);
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
