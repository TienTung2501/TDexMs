/**
 * Domain Value Object: SwapRoute
 * Describes the optimal execution path for a swap.
 */

export interface RouteHop {
  poolId: string;
  inputAssetId: string;
  outputAssetId: string;
  inputAmount: bigint;
  expectedOutput: bigint;
  fee: bigint;
  priceImpact: number;
}

export class SwapRoute {
  constructor(
    public readonly hops: RouteHop[],
    public readonly totalInput: bigint,
    public readonly totalOutput: bigint,
    public readonly totalFees: bigint,
    public readonly totalPriceImpact: number,
  ) {}

  /** Number of hops in the route */
  get hopCount(): number {
    return this.hops.length;
  }

  /** Whether this is a direct (single-hop) swap */
  get isDirect(): boolean {
    return this.hops.length === 1;
  }

  /** Calculate minimum output given slippage tolerance (BPS) */
  minOutputWithSlippage(slippageBps: number): bigint {
    return this.totalOutput - (this.totalOutput * BigInt(slippageBps)) / 10000n;
  }

  /** Compare two routes — prefer route with higher output */
  static pickBetter(a: SwapRoute, b: SwapRoute): SwapRoute {
    return a.totalOutput >= b.totalOutput ? a : b;
  }
}
