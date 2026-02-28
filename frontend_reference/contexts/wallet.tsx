'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

export interface UserInvestment {
  basketId: string
  basketName: string
  amount: number
  shares: number
  entryNav: number
  currentNav: number
  pnl: number
  pnlPercent: number
  totalInvested: number
  totalRedeemed: number
}

export interface UserTransaction {
  id: string
  basketId: string
  basketName: string
  type: 'mint' | 'redeem'
  amount: number
  shares: number
  nav: number
  date: string
  txHash: string
}

export interface CreatorBasket {
  basketId: string
  basketName: string
  description: string
  createdDate: string
  totalInvestors: number
  totalTVL: number
  performance: number
  status: 'active' | 'paused' | 'retired'
  assets: string[]
  rebalanceCount: number
  feesEarned: number
  lastRebalance: string
}

export interface WalletContextType {
  isConnected: boolean
  walletAddress: string | null
  walletProvider: string | null
  walletBalance: number
  investments: UserInvestment[]
  transactions: UserTransaction[]
  createdBaskets: CreatorBasket[]
  isCreator: boolean
  isInvestor: boolean
  currentRole: 'investor' | 'creator' | null
  switchRole: (role: 'investor' | 'creator') => void
  connectWallet: (address: string, balance: number, roles?: { isCreator?: boolean; isInvestor?: boolean; provider?: string }) => void
  disconnectWallet: () => void
  addInvestment: (investment: UserInvestment) => void
  addTransaction: (transaction: UserTransaction) => void
  getBasketInvestment: (basketId: string) => UserInvestment | undefined
  getBasketTransactions: (basketId: string) => UserTransaction[]
  addCreatedBasket: (basket: CreatorBasket) => void
  getCreatorBasket: (basketId: string) => CreatorBasket | undefined
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined)

const STORAGE_KEY = 'basket-finance-wallet'

const DEFAULT_CREATOR_BASKETS: CreatorBasket[] = [
  {
    basketId: '1',
    basketName: 'bAI Index',
    description: 'Top AI tokens basket',
    createdDate: '2024-11-15',
    totalInvestors: 1240,
    totalTVL: 450000,
    performance: 12.5,
    status: 'active',
    assets: ['AGIX', 'IAG', 'DJED'],
    rebalanceCount: 24,
    feesEarned: 2250,
    lastRebalance: '2025-01-15 14:30',
  },
  {
    basketId: '2',
    basketName: 'bGameFi',
    description: 'Gaming & metaverse tokens',
    createdDate: '2024-12-01',
    totalInvestors: 580,
    totalTVL: 320000,
    performance: 8.3,
    status: 'active',
    assets: ['INDY', 'PLANET', 'MELD'],
    rebalanceCount: 18,
    feesEarned: 1600,
    lastRebalance: '2025-01-14 10:15',
  },
]

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletProvider, setWalletProvider] = useState<string | null>(null)
  const [investments, setInvestments] = useState<UserInvestment[]>([])
  const [transactions, setTransactions] = useState<UserTransaction[]>([])
  const [createdBaskets, setCreatedBaskets] = useState<CreatorBasket[]>([])
  const [isCreator, setIsCreator] = useState(false)
  const [isInvestor, setIsInvestor] = useState(false)
  const [currentRole, setCurrentRole] = useState<'investor' | 'creator' | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          setIsConnected(data.isConnected)
          setWalletAddress(data.walletAddress)
          setWalletBalance(data.walletBalance)
          setWalletProvider(data.walletProvider)
          setInvestments(data.investments)
          setTransactions(data.transactions)
          setCreatedBaskets(data.createdBaskets)
          setIsCreator(data.isCreator)
          setIsInvestor(data.isInvestor)
          setCurrentRole(data.currentRole)
        } catch (error) {
          console.error('Failed to restore wallet data:', error)
        }
      }
    }
  }, [])

  const saveToLocalStorage = useCallback((
    connected: boolean,
    address: string | null,
    provider: string | null,
    balance: number,
    invs: UserInvestment[],
    txs: UserTransaction[],
    baskets: CreatorBasket[],
    creator: boolean,
    investor: boolean,
    role: 'investor' | 'creator' | null
  ) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        isConnected: connected,
        walletAddress: address,
        walletBalance: balance,
        walletProvider: provider,
        investments: invs,
        transactions: txs,
        createdBaskets: baskets,
        isCreator: creator,
        isInvestor: investor,
        currentRole: role,
      }))
    }
  }, [])

  const connectWallet = useCallback(
    (address: string, balance: number, roles?: { isCreator?: boolean; isInvestor?: boolean; provider?: string }) => {
      setWalletAddress(address)
      setWalletProvider(roles?.provider ?? null)
      setWalletBalance(balance)
      setIsConnected(true)
      
      const creatorStatus = roles?.isCreator || false
      const investorStatus = roles?.isInvestor || false
      
      setIsCreator(creatorStatus)
      setIsInvestor(investorStatus)
      
      const defaultRole = creatorStatus ? 'creator' : investorStatus ? 'investor' : null
      setCurrentRole(defaultRole)

      let nextCreatedBaskets: CreatorBasket[] = []
      if (creatorStatus) {
        if (createdBaskets.length === 0) {
          nextCreatedBaskets = DEFAULT_CREATOR_BASKETS
          setCreatedBaskets(DEFAULT_CREATOR_BASKETS)
        } else {
          nextCreatedBaskets = createdBaskets
        }
      } else if (createdBaskets.length > 0) {
        setCreatedBaskets([])
      }

      let newInvestments: UserInvestment[] = []
      let newTransactions: UserTransaction[] = []

      if (investorStatus) {
        newInvestments = [
          {
            basketId: '1',
            basketName: 'bAI Index',
            amount: 2500,
            shares: 2371.6,
            entryNav: 1.054,
            currentNav: 1.0542,
            pnl: 5.29,
            pnlPercent: 0.21,
            totalInvested: 2500,
            totalRedeemed: 0,
          },
        ]
        newTransactions = [
          {
            id: 'tx1',
            basketId: '1',
            basketName: 'bAI Index',
            type: 'mint',
            amount: 2500,
            shares: 2371.6,
            nav: 1.054,
            date: '2025-01-14 10:30',
            txHash: 'abc123...def456',
          },
        ]
        setInvestments(newInvestments)
        setTransactions(newTransactions)
      }

      saveToLocalStorage(
        true,
        address,
        roles?.provider ?? null,
        balance,
        newInvestments,
        newTransactions,
        nextCreatedBaskets,
        creatorStatus,
        investorStatus,
        defaultRole
      )
    },
    [saveToLocalStorage, createdBaskets]
  )

  const switchRole = useCallback(
    (role: 'investor' | 'creator') => {
      setCurrentRole(role)
      saveToLocalStorage(
        isConnected,
        walletAddress,
        walletProvider,
        walletBalance,
        investments,
        transactions,
        createdBaskets,
        isCreator,
        isInvestor,
        role
      )
    },
    [
      isConnected,
      walletAddress,
      walletProvider,
      walletBalance,
      investments,
      transactions,
      createdBaskets,
      isCreator,
      isInvestor,
      saveToLocalStorage,
    ],
  )

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null)
    setWalletProvider(null)
    setWalletBalance(0)
    setIsConnected(false)
    setInvestments([])
    setTransactions([])
    setCreatedBaskets([])
    setIsCreator(false)
    setIsInvestor(false)
    setCurrentRole(null)
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const addInvestment = useCallback((investment: UserInvestment) => {
    setInvestments((prev) => {
      const existing = prev.find((inv) => inv.basketId === investment.basketId)
      const updated = existing
        ? prev.map((inv) =>
            inv.basketId === investment.basketId
              ? {
                  ...inv,
                  amount: inv.amount + investment.amount,
                  shares: inv.shares + investment.shares,
                  totalInvested: inv.totalInvested + investment.amount,
                }
              : inv
          )
        : [...prev, investment]
      
      saveToLocalStorage(
        isConnected,
        walletAddress,
        walletProvider,
        walletBalance,
        updated,
        transactions,
        createdBaskets,
        isCreator,
        isInvestor,
        currentRole
      )
      return updated
    })
  }, [
    isConnected,
    walletAddress,
    walletProvider,
    walletBalance,
    transactions,
    createdBaskets,
    isCreator,
    isInvestor,
    currentRole,
    saveToLocalStorage,
  ])

  const addTransaction = useCallback((transaction: UserTransaction) => {
    setTransactions((prev) => {
      const updated = [transaction, ...prev]
      saveToLocalStorage(
        isConnected,
        walletAddress,
        walletProvider,
        walletBalance,
        investments,
        updated,
        createdBaskets,
        isCreator,
        isInvestor,
        currentRole
      )
      return updated
    })
  }, [
    isConnected,
    walletAddress,
    walletProvider,
    walletBalance,
    investments,
    createdBaskets,
    isCreator,
    isInvestor,
    currentRole,
    saveToLocalStorage,
  ])

  const getBasketInvestment = useCallback(
    (basketId: string) => {
      return investments.find((inv) => inv.basketId === basketId)
    },
    [investments]
  )

  const getBasketTransactions = useCallback(
    (basketId: string) => {
      return transactions.filter((tx) => tx.basketId === basketId)
    },
    [transactions]
  )

  const addCreatedBasket = useCallback((basket: CreatorBasket) => {
    setCreatedBaskets((prev) => {
      const updated = [...prev, basket]
      saveToLocalStorage(
        isConnected,
        walletAddress,
        walletProvider,
        walletBalance,
        investments,
        transactions,
        updated,
        isCreator,
        isInvestor,
        currentRole
      )
      return updated
    })
  }, [
    isConnected,
    walletAddress,
    walletProvider,
    walletBalance,
    investments,
    transactions,
    isCreator,
    isInvestor,
    currentRole,
    saveToLocalStorage,
  ])

  const getCreatorBasket = useCallback(
    (basketId: string) => {
      return createdBaskets.find((basket) => basket.basketId === basketId)
    },
    [createdBaskets]
  )

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        walletAddress,
        walletProvider,
        walletBalance,
        investments,
        transactions,
        createdBaskets,
        isCreator,
        isInvestor,
        currentRole,
        switchRole,
        connectWallet,
        disconnectWallet,
        addInvestment,
        addTransaction,
        getBasketInvestment,
        getBasketTransactions,
        addCreatedBasket,
        getCreatorBasket,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
