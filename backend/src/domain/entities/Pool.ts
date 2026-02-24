/**
 * Domain Entity: Pool
 * Represents a liquidity pool with AMM state.
 *
 * AMM calculation methods delegate to the centralized AmmMath module
 * to ensure consistency with on-chain (Aiken) formulas.
 */
import { type PoolState } from '../../shared/index.js';
import {
  calculateSwapOutput as ammSwapOutput,
  calculateInitialLp as ammInitialLp,
  calculateDepositLp as ammDepositLp,
  calculateWithdrawal as ammWithdrawal,
  FEE_DENOMINATOR,
} from '../../solver/AmmMath.js';

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
  /** LP token minting policy ID — populated on pool creation, used for LP portfolio queries */
  lpPolicyId?: string;
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
  get assetADecimals(): number { return this.props.assetADecimals; }
  get assetATicker(): string | undefined { return this.props.assetATicker; }
  get assetBPolicyId(): string { return this.props.assetBPolicyId; }
  get assetBAssetName(): string { return this.props.assetBAssetName; }
  get assetBDecimals(): number { return this.props.assetBDecimals; }
  get assetBTicker(): string | undefined { return this.props.assetBTicker; }
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
  get lpPolicyId(): string | undefined { return this.props.lpPolicyId; }
  get state(): PoolState { return this.props.state; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ─── Domain Logic: AMM Calculations (delegates to AmmMath) ───

  /** Calculate swap output (constant product formula) — delegates to AmmMath */
  calculateSwapOutput(inputAmount: bigint, aToB: boolean): bigint {
    // CRITICAL: Use ACTIVE reserves (physical - protocol fees) for AMM math,
    // matching the on-chain validator which subtracts protocol_fees before calculation.
    const activeA = this.props.reserveA - this.props.protocolFeeAccA;
    const activeB = this.props.reserveB - this.props.protocolFeeAccB;
    const reserveIn = aToB ? activeA : activeB;
    const reserveOut = aToB ? activeB : activeA;
    return ammSwapOutput(reserveIn, reserveOut, inputAmount, BigInt(this.props.feeNumerator));
  }

  /** Calculate price impact as percentage (0-100) */
  calculatePriceImpact(inputAmount: bigint, aToB: boolean): number {
    // Use active reserves (physical - protocol fees) for consistency
    const activeA = this.props.reserveA - this.props.protocolFeeAccA;
    const activeB = this.props.reserveB - this.props.protocolFeeAccB;
    const reserveIn = aToB ? activeA : activeB;
    const reserveOut = aToB ? activeB : activeA;

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

  /** Calculate LP tokens for initial deposit — delegates to AmmMath */
  calculateInitialLp(amountA: bigint, amountB: bigint): bigint {
    return ammInitialLp(amountA, amountB);
  }

  /** Calculate LP tokens for subsequent deposit — delegates to AmmMath */
  calculateDepositLp(amountA: bigint, amountB: bigint): bigint {
    return ammDepositLp(
      this.props.totalLpTokens,
      this.props.reserveA,
      this.props.reserveB,
      amountA,
      amountB,
    );
  }

  /** Calculate withdrawal amounts for LP tokens burned — delegates to AmmMath */
  calculateWithdrawal(lpAmount: bigint): { amountA: bigint; amountB: bigint } {
    const result = ammWithdrawal(
      this.props.totalLpTokens,
      this.props.reserveA,
      this.props.reserveB,
      lpAmount,
    );
    return { amountA: result.withdrawA, amountB: result.withdrawB };
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

  /** Get raw props for persistence */
  toProps(): PoolProps {
    return { ...this.props };
  }
}
