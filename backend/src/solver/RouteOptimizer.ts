/**
 * Route Optimizer
 * Finds optimal execution routes for intents across liquidity pools.
 * Supports full fill AND partial fill — if a full fill cannot meet minOutput,
 * the optimizer tries a partial fill capped at 50% of pool output reserve
 * (matching the on-chain TxBuilder logic).
 */
import { FEE_DENOMINATOR } from '../shared/index.js';
import { getLogger } from '../config/logger.js';
import type { IPoolRepository } from '../domain/ports/IPoolRepository.js';
import { Pool } from '../domain/entities/Pool.js';
import type { EscrowIntent } from './IntentCollector.js';
import { calculateMaxIntentFill } from './AmmMath.js';

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
  /** Whether this route represents a partial fill (not the full remaining input) */
  isPartialFill: boolean;
  /** Actual input amount being consumed (may be < remainingInput for partial fills) */
  actualInput: bigint;
}

/** Format pool asset as "policyId.assetName" (empty string for ADA) */
function formatAsset(policyId: string, assetName: string): string {
  if (!policyId && !assetName) return '';
  return `${policyId}.${assetName}`;
}

const ADA_ASSET = '';

/** On-chain minimum partial fill: 10% of remaining input */
const MIN_PARTIAL_FILL_PERCENT = 10n;
const MIN_PARTIAL_FILL_DENOM = 100n;

export class RouteOptimizer {
  private readonly logger;
  private poolCache: Pool[] = [];
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 1_000;

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

  /** Find the best route for an intent (supports partial fill fallback) */
  async findBestRoute(intent: EscrowIntent): Promise<SwapRoute | null> {
    await this.refreshPools();

    // CRITICAL: Use remainingInput (not inputAmount) — this is the actual
    // amount left in the escrow UTxO (accounts for prior partial fills).
    const effectiveInput = intent.remainingInput > 0n
      ? intent.remainingInput
      : intent.inputAmount;

    // ─── Strategy 1: Try full fill with remaining input ───
    const fullRoute = this.tryFullFill(intent, effectiveInput);
    if (fullRoute) return fullRoute;

    // ─── Strategy 2: Partial fill fallback ───
    // Only attempt if the intent supports partial fills
    const canPartialFill = intent.maxPartialFills > 0n
      && intent.fillCount < intent.maxPartialFills;

    if (canPartialFill) {
      const partialRoute = this.tryPartialFill(intent, effectiveInput);
      if (partialRoute) return partialRoute;
    }

    this.logger.warn(
      {
        input: intent.inputAsset,
        output: intent.outputAsset,
        remainingInput: effectiveInput.toString(),
        canPartialFill,
      },
      'No route found (full or partial)',
    );
    return null;
  }

  /** Try a full fill: compute route for the entire remainingInput */
  private tryFullFill(intent: EscrowIntent, effectiveInput: bigint): SwapRoute | null {
    const candidates: SwapRoute[] = [];

    // Direct swap
    const directRoute = this.findDirectRoute(
      intent.inputAsset,
      intent.outputAsset,
      effectiveInput,
      false,
    );
    if (directRoute) candidates.push(directRoute);

    // Multi-hop via ADA
    if (intent.inputAsset !== ADA_ASSET && intent.outputAsset !== ADA_ASSET) {
      const multiHopRoute = this.findMultiHopRoute(
        intent.inputAsset,
        intent.outputAsset,
        effectiveInput,
        false,
      );
      if (multiHopRoute) candidates.push(multiHopRoute);
    }

    if (candidates.length === 0) return null;

    // Select best route (highest output)
    candidates.sort((a, b) => (b.totalOutput > a.totalOutput ? 1 : b.totalOutput < a.totalOutput ? -1 : 0));
    const best = candidates[0]!;

    // Pro-rata min output: minOutput * effectiveInput / inputAmount
    // This handles the case where effectiveInput < inputAmount (prior partial fills)
    const proRataMinOutput = intent.inputAmount > 0n
      ? (intent.minOutput * effectiveInput) / intent.inputAmount
      : intent.minOutput;

    if (best.totalOutput < proRataMinOutput) {
      this.logger.debug(
        {
          inputAmount: effectiveInput.toString(),
          bestOutput: best.totalOutput.toString(),
          proRataMinOutput: proRataMinOutput.toString(),
        },
        'Full fill route does not meet pro-rata min output — trying partial fill',
      );
      return null;
    }

    return best;
  }

/**
   * Phiên bản tối ưu: Sử dụng Binary Search để tìm lượng khớp lệnh một phần (Partial Fill)
   * lớn nhất mà vẫn thỏa mãn mức trượt giá (minOutput) của người dùng.
   */
  private tryPartialFill(intent: EscrowIntent, effectiveInput: bigint): SwapRoute | null {
    const pool = this.findDirectPool(intent.inputAsset, intent.outputAsset);
    if (!pool) return null;

    const isAtoB = this.matchesAssetA(pool, intent.inputAsset);

    // 1. Tính toán dựa trên tài sản dự trữ thực tế của Pool
    const activeA = pool.reserveA - pool.protocolFeeAccA;
    const activeB = pool.reserveB - pool.protocolFeeAccB;
    const reserveIn = isAtoB ? activeA : activeB;
    const reserveOut = isAtoB ? activeB : activeA;

    if (reserveOut <= 0n || reserveIn <= 0n) return null;

    // 2. Tìm lượng Input tối ưu bằng Binary Search thay vì dùng hằng số 50%
    // Điều này giải quyết triệt để lỗi "output below minimum" khi thanh khoản thấp.
    let partialInput = calculateMaxIntentFill(
      reserveIn,
      reserveOut,
      effectiveInput,
      intent.inputAmount,
      intent.minOutput,
      BigInt(pool.feeNumerator)
    );

    // 3. Giới hạn bổ sung: Không bao giờ rút quá 50% Pool để tránh làm hỏng giá thị trường
    const inputFor50Percent = reserveIn; // Theo hằng số AMM, input = reserveIn sẽ lấy ra ~50%
    if (partialInput > inputFor50Percent) {
      partialInput = inputFor50Percent;
    }

    // 4. Kiểm tra ràng buộc 10% tối thiểu của mạng lưới
    const minRequiredInput = (effectiveInput * MIN_PARTIAL_FILL_PERCENT) / MIN_PARTIAL_FILL_DENOM;
    if (partialInput < minRequiredInput) {
      this.logger.debug(
        { 
          intentId: intent.utxoRef.txHash.slice(0, 10), 
          partialInput: partialInput.toString(), 
          minRequired: minRequiredInput.toString() 
        },
        'Partial fill amount cannot satisfy 10% rule and slippage simultaneously'
      );
      return null;
    }

    // 5. Xây dựng Route với thông số đã tính toán
    const outputAmount = pool.calculateSwapOutput(partialInput, isAtoB);
    const fee = (partialInput * BigInt(pool.feeNumerator)) / BigInt(FEE_DENOMINATOR);

    this.logger.info(
      {
        intentId: intent.utxoRef.txHash.slice(0, 10),
        fillAmount: partialInput.toString(),
        output: outputAmount.toString(),
        fillPercent: Number((partialInput * 100n) / effectiveInput) + '%',
      },
      '⚡ Optimized Partial Fill found via Binary Search'
    );

    return {
      type: 'direct',
      hops: [
        {
          poolId: pool.id,
          inputAsset: intent.inputAsset,
          outputAsset: intent.outputAsset,
          inputAmount: partialInput,
          outputAmount,
          fee,
        },
      ],
      totalOutput: outputAmount,
      totalFee: fee,
      priceImpact: pool.calculatePriceImpact(partialInput, isAtoB),
      isPartialFill: true,
      actualInput: partialInput,
    };
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
    isPartialFill: boolean,
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
      isPartialFill,
      actualInput: inputAmount,
    };
  }

  private findMultiHopRoute(
    inputAsset: string,
    outputAsset: string,
    inputAmount: bigint,
    isPartialFill: boolean,
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
      isPartialFill,
      actualInput: inputAmount,
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
