/**
 * Domain Entity: Pool
 * Represents a liquidity pool with AMM state.
 */
import { FEE_DENOMINATOR, MINIMUM_LIQUIDITY } from '@solvernet/shared';
import type { PoolState } from '@solvernet/shared';

export interface PoolProps {
  id: string;
  poolNftPolicyId: string;
  poolNftAssetName: string;
  assetAPolicyId: string;
  assetAAssetName: string;
  assetADecimals: number;
  assetATicker?: string;
  assetBPolicyId: string;
  assetBAssetName: string;
  assetBDecimals: number;
  assetBTicker?: string;
  reserveA: bigint;
  reserveB: bigint;
  totalLpTokens: bigint;
  feeNumerator: number;
  protocolFeeAccA: bigint;
  protocolFeeAccB: bigint;
  tvlAda: bigint;
  volume24h: bigint;
  fees24h: bigint;
  txHash: string;
  outputIndex: number;
  state: PoolState;
  createdAt: Date;
  updatedAt: Date;
}

export class Pool {
  private props: PoolProps;

  constructor(props: PoolProps) {
    this.props = { ...props };
  }

  // ─── Getters ──────────────────────────────────────
  get id(): string { return this.props.id; }
  get poolNftPolicyId(): string { return this.props.poolNftPolicyId; }
  get poolNftAssetName(): string { return this.props.poolNftAssetName; }
  get assetAPolicyId(): string { return this.props.assetAPolicyId; }
  get assetAAssetName(): string { return this.props.assetAAssetName; }
  get assetBPolicyId(): string { return this.props.assetBPolicyId; }
  get assetBAssetName(): string { return this.props.assetBAssetName; }
  get reserveA(): bigint { return this.props.reserveA; }
  get reserveB(): bigint { return this.props.reserveB; }
  get totalLpTokens(): bigint { return this.props.totalLpTokens; }
  get feeNumerator(): number { return this.props.feeNumerator; }
  get protocolFeeAccA(): bigint { return this.props.protocolFeeAccA; }
  get protocolFeeAccB(): bigint { return this.props.protocolFeeAccB; }
  get tvlAda(): bigint { return this.props.tvlAda; }
  get volume24h(): bigint { return this.props.volume24h; }
  get fees24h(): bigint { return this.props.fees24h; }
  get txHash(): string { return this.props.txHash; }
  get outputIndex(): number { return this.props.outputIndex; }
  get state(): PoolState { return this.props.state; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ─── Domain Logic: AMM Calculations ───────────────

  /** Calculate swap output (constant product formula) */
  calculateSwapOutput(inputAmount: bigint, aToB: boolean): bigint {
    const reserveIn = aToB ? this.props.reserveA : this.props.reserveB;
    const reserveOut = aToB ? this.props.reserveB : this.props.reserveA;

    const fee = this.props.feeNumerator;
    const inputWithFee = inputAmount * BigInt(FEE_DENOMINATOR - fee);
    const numerator = inputWithFee * reserveOut;
    const denominator = reserveIn * BigInt(FEE_DENOMINATOR) + inputWithFee;

    return numerator / denominator;
  }

  /** Calculate price impact as percentage (0-100) */
  calculatePriceImpact(inputAmount: bigint, aToB: boolean): number {
    const reserveIn = aToB ? this.props.reserveA : this.props.reserveB;
    const reserveOut = aToB ? this.props.reserveB : this.props.reserveA;

    // Spot price
    const spotPrice = Number(reserveOut) / Number(reserveIn);
    // Effective price after trade
    const output = this.calculateSwapOutput(inputAmount, aToB);
    const effectivePrice = Number(output) / Number(inputAmount);

    return Math.abs((spotPrice - effectivePrice) / spotPrice) * 100;
  }

  /** Calculate spot price of A in terms of B */
  spotPriceAinB(): number {
    if (this.props.reserveA === 0n) return 0;
    return Number(this.props.reserveB) / Number(this.props.reserveA);
  }

  /** Calculate spot price of B in terms of A */
  spotPriceBinA(): number {
    if (this.props.reserveB === 0n) return 0;
    return Number(this.props.reserveA) / Number(this.props.reserveB);
  }

  /** Calculate LP tokens for initial deposit */
  calculateInitialLp(amountA: bigint, amountB: bigint): bigint {
    const product = amountA * amountB;
    const sqrtProduct = this.bigIntSqrt(product);
    return sqrtProduct - BigInt(MINIMUM_LIQUIDITY);
  }

  /** Calculate LP tokens for subsequent deposit */
  calculateDepositLp(amountA: bigint, amountB: bigint): bigint {
    const lpFromA = (amountA * this.props.totalLpTokens) / this.props.reserveA;
    const lpFromB = (amountB * this.props.totalLpTokens) / this.props.reserveB;
    return lpFromA < lpFromB ? lpFromA : lpFromB;
  }

  /** Calculate withdrawal amounts for LP tokens burned */
  calculateWithdrawal(lpAmount: bigint): { amountA: bigint; amountB: bigint } {
    return {
      amountA: (lpAmount * this.props.reserveA) / this.props.totalLpTokens,
      amountB: (lpAmount * this.props.reserveB) / this.props.totalLpTokens,
    };
  }

  /** Calculate APY estimate based on 24h fees and TVL */
  calculateApy(): number {
    if (this.props.tvlAda === 0n) return 0;
    const dailyFeeRate = Number(this.props.fees24h) / Number(this.props.tvlAda);
    return dailyFeeRate * 365 * 100; // Annualized
  }

  /** Update pool state after a swap */
  applySwap(inputAmount: bigint, outputAmount: bigint, aToB: boolean): void {
    if (aToB) {
      this.props.reserveA += inputAmount;
      this.props.reserveB -= outputAmount;
    } else {
      this.props.reserveB += inputAmount;
      this.props.reserveA -= outputAmount;
    }
    this.props.updatedAt = new Date();
  }

  /** Update pool UTxO reference after chain sync */
  updateUtxoRef(txHash: string, outputIndex: number): void {
    this.props.txHash = txHash;
    this.props.outputIndex = outputIndex;
    this.props.updatedAt = new Date();
  }

  /** BigInt square root using Newton's method */
  private bigIntSqrt(n: bigint): bigint {
    if (n < 0n) throw new Error('Square root of negative number');
    if (n === 0n) return 0n;
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }
    return x;
  }

  /** Get raw props for persistence */
  toProps(): PoolProps {
    return { ...this.props };
  }
}
