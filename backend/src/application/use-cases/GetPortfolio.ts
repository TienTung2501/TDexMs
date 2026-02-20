/**
 * Use Case: Get Portfolio
 * Aggregates wallet data: intents, orders, LP positions, and token balances.
 */
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';

export interface PortfolioOutput {
  address: string;
  intents: {
    active: number;
    filled: number;
    total: number;
  };
  orders: {
    active: number;
    filled: number;
    total: number;
  };
  pools: {
    totalPools: number;
  };
}

export class GetPortfolio {
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly poolRepo: IPoolRepository,
  ) {}

  async execute(address: string): Promise<PortfolioOutput> {
    // Fetch intent counts by status for this address
    const [activeIntents, filledIntents, allIntents] = await Promise.all([
      this.intentRepo.findMany({ address, status: 'ACTIVE', limit: 1 }),
      this.intentRepo.findMany({ address, status: 'FILLED', limit: 1 }),
      this.intentRepo.findMany({ address, limit: 1 }),
    ]);

    // Fetch order counts by status for this address
    const [activeOrders, filledOrders, allOrders] = await Promise.all([
      this.orderRepo.findMany({ creator: address, status: 'ACTIVE', limit: 1 }),
      this.orderRepo.findMany({ creator: address, status: 'FILLED', limit: 1 }),
      this.orderRepo.findMany({ creator: address, limit: 1 }),
    ]);

    // Get pool count
    const pools = await this.poolRepo.findMany({});

    return {
      address,
      intents: {
        active: activeIntents.total,
        filled: filledIntents.total,
        total: allIntents.total,
      },
      orders: {
        active: activeOrders.total,
        filled: filledOrders.total,
        total: allOrders.total,
      },
      pools: {
        totalPools: pools.total,
      },
    };
  }
}
