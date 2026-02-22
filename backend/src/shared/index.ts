/**
 * Shared types, constants, and validation schemas
 *
 * This module mirrors on-chain protocol constants (see smartcontract/lib/solvernet/constants.ak)
 * and provides Zod schemas for HTTP request validation.
 */
import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// Domain Types (aligned with Prisma enums)
// ═══════════════════════════════════════════════════════

export type IntentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'ACTIVE'
  | 'FILLING'
  | 'FILLED'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'RECLAIMED';

export type PoolState = 'ACTIVE' | 'INACTIVE' | 'CREATING';

export type OrderType = 'LIMIT' | 'DCA' | 'STOP_LOSS';

export type OrderStatus =
  | 'CREATED'
  | 'PENDING'
  | 'ACTIVE'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface NetworkConfig {
  name: string;
  networkId: number;
  magic?: number;
  blockfrostUrl: string;
  blockfrostApiKey: string;
}

// ═══════════════════════════════════════════════════════
// Protocol Constants (mirrors smartcontract/lib/solvernet/constants.ak)
// ═══════════════════════════════════════════════════════

/** Fee denominator — all fees are expressed as numerator/10000 (basis points). */
export const FEE_DENOMINATOR = 10_000;

/** Minimum liquidity locked forever on first pool deposit (prevents empty-pool attacks). */
export const MINIMUM_LIQUIDITY = 1_000;

/** Minimum allowed fee numerator (0.01%). */
export const MIN_FEE_NUMERATOR = 1;

/** Maximum allowed fee numerator (3.0%). */
export const MAX_FEE_NUMERATOR = 300;

/** Minimum initial pool creation liquidity in lovelace (2 ADA). */
export const MIN_POOL_LIQUIDITY = 2_000_000;

/** Maximum intent deadline — 7 days in milliseconds. */
export const MAX_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

/** Default slippage tolerance — 50 basis points (0.5%). */
export const DEFAULT_SLIPPAGE_BPS = 50;

// ═══════════════════════════════════════════════════════
// Network Configuration
// ═══════════════════════════════════════════════════════

export const NETWORK_CONFIG: Record<string, Omit<NetworkConfig, 'blockfrostUrl' | 'blockfrostApiKey'>> = {
  preprod: {
    name: 'Preprod',
    networkId: 0,
    magic: 1,
  },
  preview: {
    name: 'Preview',
    networkId: 0,
    magic: 2,
  },
  mainnet: {
    name: 'Mainnet',
    networkId: 1,
  },
};

// ═══════════════════════════════════════════════════════
// Zod Validation Schemas
// ═══════════════════════════════════════════════════════

// ─── Cardano address pattern (bech32 addr / addr_test) ───
const cardanoAddress = z.string().min(1, 'Address is required');

// ─── Asset ID: "policyId.assetName" or "lovelace" ───
const assetId = z.string().min(1, 'Asset is required');

// ─── Positive numeric string (for BigInt amounts) ───
const positiveAmountStr = z.string().regex(/^\d+$/, 'Must be a positive integer string');

// ─── Intent schemas ─────────────────────────────────
export const intentSchema = z.object({
  quoteId: z.string().optional(),
  senderAddress: cardanoAddress,
  inputAsset: assetId,
  inputAmount: positiveAmountStr,
  outputAsset: assetId,
  minOutput: positiveAmountStr,
  deadline: z.number().int().positive(),
  partialFill: z.boolean().default(false),
  changeAddress: cardanoAddress,
});

export const intentListSchema = z.object({
  address: z.string().optional(),
  status: z.enum(['CREATED', 'PENDING', 'ACTIVE', 'FILLING', 'FILLED', 'CANCELLING', 'CANCELLED', 'EXPIRED', 'RECLAIMED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

// ─── Quote schema ───────────────────────────────────
export const quoteSchema = z.object({
  inputAsset: assetId,
  outputAsset: assetId,
  inputAmount: z.string().optional(),
  outputAmount: z.string().optional(),
  slippage: z.coerce.number().min(0).max(FEE_DENOMINATOR).optional(),
});

// ─── Pool schemas ───────────────────────────────────
export const poolCreateSchema = z.object({
  assetA: assetId,
  assetB: assetId,
  initialAmountA: positiveAmountStr,
  initialAmountB: positiveAmountStr,
  feeNumerator: z.number().int().min(MIN_FEE_NUMERATOR).max(MAX_FEE_NUMERATOR),
  creatorAddress: cardanoAddress,
  changeAddress: cardanoAddress,
});

export const depositSchema = z.object({
  amountA: positiveAmountStr,
  amountB: positiveAmountStr,
  minLpTokens: positiveAmountStr,
  senderAddress: cardanoAddress,
  changeAddress: cardanoAddress,
});

export const withdrawSchema = z.object({
  lpTokenAmount: positiveAmountStr,
  minAmountA: positiveAmountStr,
  minAmountB: positiveAmountStr,
  senderAddress: cardanoAddress,
  changeAddress: cardanoAddress,
});

export const poolListSchema = z.object({
  sortBy: z.enum(['tvl', 'volume24h', 'apy', 'createdAt']).default('tvl').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
  search: z.string().optional(),
  state: z.enum(['ACTIVE', 'INACTIVE', 'CREATING']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

// ─── Order schemas ──────────────────────────
export const orderCreateSchema = z.object({
  type: z.enum(['LIMIT', 'DCA', 'STOP_LOSS']),
  inputAsset: assetId,
  outputAsset: assetId,
  inputAmount: positiveAmountStr,
  priceNumerator: positiveAmountStr,
  priceDenominator: positiveAmountStr,
  totalBudget: positiveAmountStr.optional(),
  amountPerInterval: positiveAmountStr.optional(),
  intervalSlots: z.number().int().positive().optional(),
  deadline: z.number().int().positive(),
  senderAddress: cardanoAddress,
  changeAddress: cardanoAddress,
});

export const orderListSchema = z.object({
  creator: z.string().optional(),
  status: z.enum(['CREATED', 'PENDING', 'ACTIVE', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED']).optional(),
  type: z.enum(['LIMIT', 'DCA', 'STOP_LOSS']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});
