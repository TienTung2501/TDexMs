/**
 * Port: Pool Repository Interface
 */
import type { Pool } from '../entities/Pool.js';
import type { PoolState } from '@solvernet/shared';

export interface PoolFilters {
  sortBy?: 'tvl' | 'volume24h' | 'apy' | 'createdAt';
  order?: 'asc' | 'desc';
  search?: string;
  state?: PoolState;
  cursor?: string;
  limit?: number;
}

export interface PoolPage {
  items: Pool[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface IPoolRepository {
  /** Save a new or updated pool */
  save(pool: Pool): Promise<void>;

  /** Find pool by ID */
  findById(id: string): Promise<Pool | null>;

  /** Find pool by NFT */
  findByNft(policyId: string, assetName: string): Promise<Pool | null>;

  /** Find pool by asset pair */
  findByPair(assetAId: string, assetBId: string): Promise<Pool | null>;

  /** List pools with pagination & filters */
  findMany(filters: PoolFilters): Promise<PoolPage>;

  /** Get all active pools (for solver/routing) */
  findAllActive(): Promise<Pool[]>;

  /** Update pool reserves */
  updateReserves(
    id: string,
    reserveA: bigint,
    reserveB: bigint,
    totalLpTokens: bigint,
    txHash: string,
    outputIndex: number,
  ): Promise<void>;

  /** Update 24h volume and fees */
  updateStats(id: string, volume24h: bigint, fees24h: bigint, tvlAda: bigint): Promise<void>;
}
