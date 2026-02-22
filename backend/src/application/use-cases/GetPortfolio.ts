/**
 * Use Case: Get Portfolio
 * Aggregates wallet data: intents, orders, LP positions, and token balances.
 *
 * Task 3 fix: Inject IChainProvider to scan on-chain UTxOs for real LP token balances.
 * LP token positions are resolved by matching wallet UTxOs against each pool's lpPolicyId.
 */
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { IChainProvider } from '../../domain/ports/IChainProvider.js';

export interface LpPosition {
  poolId: string;
  assetATicker?: string;
  assetBTicker?: string;
  assetAPolicyId: string;
  assetBPolicyId: string;
  lpPolicyId: string;
  lpBalance: string;
}

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
  /** Real on-chain LP token balances per pool (populated when chainProvider is available) */
  lpPositions: LpPosition[];
}

export class GetPortfolio {
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly poolRepo: IPoolRepository,
    /** Optional: inject to enable real on-chain LP balance scanning */
    private readonly chainProvider?: IChainProvider,
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

    // Get pool count and active pools (for LP scanning)
    const [poolPage, activePools] = await Promise.all([
      this.poolRepo.findMany({}),
      this.poolRepo.findAllActive(),
    ]);

    // Task 3: Scan on-chain UTxOs for LP token balances
    const lpPositions = await this.resolveLpPositions(address, activePools);

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
        totalPools: poolPage.total,
      },
      lpPositions,
    };
  }

  /**
   * Scan the wallet's on-chain UTxOs and return one LpPosition entry per pool
   * where the wallet holds a non-zero LP balance.
   *
   * Requires chainProvider + each pool having lpPolicyId populated (set by CreatePool).
   * Pools without lpPolicyId are silently skipped.
   */
  private async resolveLpPositions(
    address: string,
    activePools: import('../../domain/entities/Pool.js').Pool[],
  ): Promise<LpPosition[]> {
    // Only pools that have their LP policy ID stored
    const poolsWithLp = activePools.filter((p) => p.lpPolicyId);
    if (poolsWithLp.length === 0 || !this.chainProvider) return [];

    let utxos: import('../../domain/ports/IChainProvider.js').UTxO[];
    try {
      utxos = await this.chainProvider.getUtxos(address);
    } catch {
      // Chain provider unavailable — return empty; don't break portfolio
      return [];
    }

    // Build a flat map: tokenUnit → total quantity across all UTxOs
    const balances = new Map<string, bigint>();
    for (const utxo of utxos) {
      for (const [unit, qty] of Object.entries(utxo.value)) {
        if (unit === 'lovelace') continue;
        const prev = balances.get(unit) ?? 0n;
        balances.set(unit, prev + BigInt(qty));
      }
    }

    const positions: LpPosition[] = [];
    for (const pool of poolsWithLp) {
      const lpPolicyId = pool.lpPolicyId!;
      // LP tokens from our DEX use the policyId as the full unit (no assetName)
      // check both plain policyId and policyId + "" (empty asset name hex)
      const lpBalance =
        balances.get(lpPolicyId) ??
        balances.get(`${lpPolicyId}`) ??
        0n;

      if (lpBalance === 0n) continue;

      positions.push({
        poolId: pool.id,
        assetATicker: pool.toProps().assetATicker,
        assetBTicker: pool.toProps().assetBTicker,
        assetAPolicyId: pool.assetAPolicyId,
        assetBPolicyId: pool.assetBPolicyId,
        lpPolicyId,
        lpBalance: lpBalance.toString(),
      });
    }

    return positions;
  }
}
