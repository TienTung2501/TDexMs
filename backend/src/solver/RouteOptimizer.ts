/**
 * Route Optimizer
 * Finds optimal execution routes for intents across liquidity pools.
 */
import { FEE_DENOMINATOR } from '@solvernet/shared';
import { getLogger } from '../config/logger.js';
import type { IPoolRepository } from '../domain/ports/IPoolRepository.js';
import { Pool } from '../domain/entities/Pool.js';
import type { EscrowIntent } from './IntentCollector.js';

export interface RouteHop {
  poolId: string;
  inputAsset: string;
  outputAsset: string;
  inputAmount: bigint;
  outputAmount: bigint;
  fee: bigint;
}

export interface SwapRoute {
  type: 'direct' | 'multi-hop' | 'split';
  hops: RouteHop[];
  totalOutput: bigint;
  totalFee: bigint;
  priceImpact: number;
}

/** Format pool asset as "policyId.assetName" (empty string for ADA) */
function formatAsset(policyId: string, assetName: string): string {
  if (!policyId && !assetName) return '';
  return `${policyId}.${assetName}`;
}

const ADA_ASSET = '';

export class RouteOptimizer {
  private readonly logger;
  private poolCache: Pool[] = [];
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 5_000;

  constructor(private readonly poolRepo: IPoolRepository) {
    this.logger = getLogger().child({ service: 'route-optimizer' });
  }

  /** Refresh pool cache if stale */
  async refreshPools(): Promise<void> {
    if (Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) return;

    const result = await this.poolRepo.findAllActive();
    this.poolCache = result;
    this.cacheTimestamp = Date.now();
    this.logger.debug({ poolCount: result.length }, 'Pool cache refreshed');
  }

  /** Find the best route for an intent */
  async findBestRoute(intent: EscrowIntent): Promise<SwapRoute | null> {
    await this.refreshPools();

    const candidates: SwapRoute[] = [];

    // Strategy 1: Direct swap
    const directRoute = this.findDirectRoute(
      intent.inputAsset,
      intent.outputAsset,
      intent.inputAmount,
    );
    if (directRoute) candidates.push(directRoute);

    // Strategy 2: Multi-hop via ADA (if neither asset is ADA)
    if (intent.inputAsset !== ADA_ASSET && intent.outputAsset !== ADA_ASSET) {
      const multiHopRoute = this.findMultiHopRoute(
        intent.inputAsset,
        intent.outputAsset,
        intent.inputAmount,
      );
      if (multiHopRoute) candidates.push(multiHopRoute);
    }

    if (candidates.length === 0) {
      this.logger.warn(
        { input: intent.inputAsset, output: intent.outputAsset },
        'No route found',
      );
      return null;
    }

    // Select best route (highest output)
    candidates.sort((a, b) => {
      if (b.totalOutput > a.totalOutput) return 1;
      if (b.totalOutput < a.totalOutput) return -1;
      return 0;
    });

    const best = candidates[0]!;

    // Check if best route meets minimum output
    if (best.totalOutput < intent.minOutput) {
      this.logger.warn(
        {
          intentMinOutput: intent.minOutput.toString(),
          bestOutput: best.totalOutput.toString(),
        },
        'Best route does not meet min output',
      );
      return null;
    }

    return best;
  }

  /** Find routes for a batch of intents */
  async findRoutes(intents: EscrowIntent[]): Promise<Map<string, SwapRoute>> {
    await this.refreshPools();

    const routes = new Map<string, SwapRoute>();

    for (const intent of intents) {
      const key = `${intent.utxoRef.txHash}#${intent.utxoRef.outputIndex}`;
      const route = await this.findBestRoute(intent);
      if (route) {
        routes.set(key, route);
      }
    }

    return routes;
  }

  // ── Private ──

  private findDirectRoute(
    inputAsset: string,
    outputAsset: string,
    inputAmount: bigint,
  ): SwapRoute | null {
    const pool = this.findDirectPool(inputAsset, outputAsset);
    if (!pool) return null;

    const isAtoB = this.matchesAssetA(pool, inputAsset);
    const outputAmount = pool.calculateSwapOutput(inputAmount, isAtoB);

    const fee = (inputAmount * BigInt(pool.feeNumerator)) / BigInt(FEE_DENOMINATOR);

    return {
      type: 'direct',
      hops: [
        {
          poolId: pool.id,
          inputAsset,
          outputAsset,
          inputAmount,
          outputAmount,
          fee,
        },
      ],
      totalOutput: outputAmount,
      totalFee: fee,
      priceImpact: pool.calculatePriceImpact(inputAmount, isAtoB),
    };
  }

  private findMultiHopRoute(
    inputAsset: string,
    outputAsset: string,
    inputAmount: bigint,
  ): SwapRoute | null {
    // Hop 1: inputAsset → ADA
    const pool1 = this.findDirectPool(inputAsset, ADA_ASSET);
    if (!pool1) return null;

    const isAtoB1 = this.matchesAssetA(pool1, inputAsset);
    const midAmount = pool1.calculateSwapOutput(inputAmount, isAtoB1);

    // Hop 2: ADA → outputAsset
    const pool2 = this.findDirectPool(ADA_ASSET, outputAsset);
    if (!pool2) return null;

    const isAtoB2 = this.matchesAssetA(pool2, ADA_ASSET);
    const finalAmount = pool2.calculateSwapOutput(midAmount, isAtoB2);

    const fee1 = (inputAmount * BigInt(pool1.feeNumerator)) / BigInt(FEE_DENOMINATOR);
    const fee2 = (midAmount * BigInt(pool2.feeNumerator)) / BigInt(FEE_DENOMINATOR);

    return {
      type: 'multi-hop',
      hops: [
        {
          poolId: pool1.id,
          inputAsset,
          outputAsset: ADA_ASSET,
          inputAmount,
          outputAmount: midAmount,
          fee: fee1,
        },
        {
          poolId: pool2.id,
          inputAsset: ADA_ASSET,
          outputAsset,
          inputAmount: midAmount,
          outputAmount: finalAmount,
          fee: fee2,
        },
      ],
      totalOutput: finalAmount,
      totalFee: fee1 + fee2,
      priceImpact:
        pool1.calculatePriceImpact(inputAmount, isAtoB1) +
        pool2.calculatePriceImpact(midAmount, isAtoB2),
    };
  }

  private findDirectPool(assetA: string, assetB: string): Pool | null {
    return (
      this.poolCache.find(
        (p) =>
          (this.matchesAssetA(p, assetA) && this.matchesAssetB(p, assetB)) ||
          (this.matchesAssetA(p, assetB) && this.matchesAssetB(p, assetA)),
      ) ?? null
    );
  }

  private matchesAssetA(pool: Pool, asset: string): boolean {
    return formatAsset(pool.assetAPolicyId, pool.assetAAssetName) === asset;
  }

  private matchesAssetB(pool: Pool, asset: string): boolean {
    return formatAsset(pool.assetBPolicyId, pool.assetBAssetName) === asset;
  }
}
