/**
 * Domain Entity: Order
 * Represents advanced order types (Limit, DCA, StopLoss).
 */
import type { OrderType, OrderStatus } from '../../shared/index.js';

export interface OrderProps {
  id: string;
  type: OrderType;
  creator: string;
  inputPolicyId: string;
  inputAssetName: string;
  outputPolicyId: string;
  outputAssetName: string;
  // Limit / StopLoss
  inputAmount?: bigint;
  priceNumerator?: bigint;
  priceDenominator?: bigint;
  // DCA
  totalBudget?: bigint;
  amountPerInterval?: bigint;
  intervalSlots?: number;
  remainingBudget?: bigint;
  executedIntervals?: number;
  // Common
  deadline: number;
  status: OrderStatus;
  escrowTxHash?: string;
  escrowOutputIndex?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  private props: OrderProps;

  constructor(props: OrderProps) {
    this.props = { ...props };
  }

  get id(): string { return this.props.id; }
  get type(): OrderType { return this.props.type; }
  get creator(): string { return this.props.creator; }
  get status(): OrderStatus { return this.props.status; }
  get deadline(): number { return this.props.deadline; }
  get inputAmount(): bigint | undefined { return this.props.inputAmount; }
  get totalBudget(): bigint | undefined { return this.props.totalBudget; }
  get remainingBudget(): bigint | undefined { return this.props.remainingBudget; }
  get priceNumerator(): bigint | undefined { return this.props.priceNumerator; }
  get priceDenominator(): bigint | undefined { return this.props.priceDenominator; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** Check if market price meets limit order condition */
  meetsLimitPrice(marketPriceNum: bigint, marketPriceDen: bigint): boolean {
    if (this.props.type !== 'LIMIT' || !this.props.priceNumerator || !this.props.priceDenominator) {
      return false;
    }
    // Cross-multiply: market_num * target_den >= target_num * market_den
    return marketPriceNum * this.props.priceDenominator >= this.props.priceNumerator * marketPriceDen;
  }

  /** Check if stop-loss should trigger */
  triggersStopLoss(marketPriceNum: bigint, marketPriceDen: bigint): boolean {
    if (this.props.type !== 'STOP_LOSS' || !this.props.priceNumerator || !this.props.priceDenominator) {
      return false;
    }
    // market_num * stop_den <= stop_num * market_den (price dropped to or below stop)
    return marketPriceNum * this.props.priceDenominator <= this.props.priceNumerator * marketPriceDen;
  }

  isExpired(currentTimeMs?: number): boolean {
    return (currentTimeMs ?? Date.now()) >= this.props.deadline;
  }

  canBeExecuted(): boolean {
    return ['ACTIVE', 'PARTIALLY_FILLED'].includes(this.props.status) && !this.isExpired();
  }

  /**
   * Record a single DCA interval execution.
   * Deducts amountPerInterval from remainingBudget and increments executedIntervals.
   * Automatically promotes status to FILLED when budget is exhausted.
   * MUST only be called after on-chain TX confirmation.
   */
  recordExecution(): void {
    const amount = this.props.amountPerInterval ?? 0n;
    if (this.props.remainingBudget !== undefined) {
      this.props.remainingBudget = this.props.remainingBudget > amount
        ? this.props.remainingBudget - amount
        : 0n;
    }
    this.props.executedIntervals = (this.props.executedIntervals ?? 0) + 1;
    // If budget is exhausted, mark fully filled; otherwise partially filled
    if (!this.props.remainingBudget || this.props.remainingBudget === 0n) {
      this.props.status = 'FILLED';
    } else {
      this.props.status = 'PARTIALLY_FILLED';
    }
    this.props.updatedAt = new Date();
  }

  /**
   * Check whether enough wall-clock time has elapsed for the next DCA interval.
   * One Cardano slot ≈ 1 second.
   */
  isDcaIntervalRipe(nowMs: number = Date.now()): boolean {
    if (this.props.type !== 'DCA') return false;
    const slots = this.props.intervalSlots ?? 0;
    if (slots === 0) return true; // no interval limit — always ripe
    const elapsedMs = this.props.createdAt.getTime() +
      ((this.props.executedIntervals ?? 0) + 1) * slots * 1_000;
    return nowMs >= elapsedMs;
  }

  markActive(txHash: string, outputIndex: number): void {
    this.props.status = 'ACTIVE';
    this.props.escrowTxHash = txHash;
    this.props.escrowOutputIndex = outputIndex;
    this.props.updatedAt = new Date();
  }

  markFilled(): void {
    this.props.status = 'FILLED';
    this.props.updatedAt = new Date();
  }

  markCancelled(): void {
    this.props.status = 'CANCELLED';
    this.props.updatedAt = new Date();
  }

  toProps(): OrderProps {
    return { ...this.props };
  }
}
