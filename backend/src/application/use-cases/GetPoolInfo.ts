/**
 * Use Case: Get Pool Info
 */
import type { IPoolRepository, PoolFilters, PoolPage } from '../../domain/ports/IPoolRepository.js';
import { PoolNotFoundError } from '../../domain/errors/index.js';
import type { Pool } from '../../domain/entities/Pool.js';

export class GetPoolInfo {
  constructor(private readonly poolRepo: IPoolRepository) {}

  async getById(poolId: string): Promise<Pool> {
    const pool = await this.poolRepo.findById(poolId);
    if (!pool) {
      throw new PoolNotFoundError(poolId);
    }
    return pool;
  }

  async list(filters: PoolFilters): Promise<PoolPage> {
    return this.poolRepo.findMany(filters);
  }

  async getAllActive(): Promise<Pool[]> {
    return this.poolRepo.findAllActive();
  }
}
