/**
 * Domain Entity: Intent
 * Represents a user's swap intent throughout its lifecycle.
 * Pure domain logic — no framework dependencies.
 */
import type { IntentStatus } from '@solvernet/shared';

export interface IntentProps {
  id: string;
  status: IntentStatus;
  creator: string;
  inputPolicyId: string;
  inputAssetName: string;
  inputAmount: bigint;
  outputPolicyId: string;
  outputAssetName: string;
  minOutput: bigint;
  actualOutput?: bigint;
  deadline: number;
  partialFill: boolean;
  maxPartialFills: number;
  fillCount: number;
  remainingInput: bigint;
  escrowTxHash?: string;
  escrowOutputIndex?: number;
  settlementTxHash?: string;
  solverAddress?: string;
  createdAt: Date;
  updatedAt: Date;
  settledAt?: Date;
}

export class Intent {
  private props: IntentProps;

  constructor(props: IntentProps) {
    this.props = { ...props };
  }

  // ─── Getters ──────────────────────────────────────
  get id(): string { return this.props.id; }
  get status(): IntentStatus { return this.props.status; }
  get creator(): string { return this.props.creator; }
  get inputPolicyId(): string { return this.props.inputPolicyId; }
  get inputAssetName(): string { return this.props.inputAssetName; }
  get inputAmount(): bigint { return this.props.inputAmount; }
  get outputPolicyId(): string { return this.props.outputPolicyId; }
  get outputAssetName(): string { return this.props.outputAssetName; }
  get minOutput(): bigint { return this.props.minOutput; }
  get actualOutput(): bigint | undefined { return this.props.actualOutput; }
  get deadline(): number { return this.props.deadline; }
  get partialFill(): boolean { return this.props.partialFill; }
  get maxPartialFills(): number { return this.props.maxPartialFills; }
  get fillCount(): number { return this.props.fillCount; }
  get remainingInput(): bigint { return this.props.remainingInput; }
  get escrowTxHash(): string | undefined { return this.props.escrowTxHash; }
  get escrowOutputIndex(): number | undefined { return this.props.escrowOutputIndex; }
  get settlementTxHash(): string | undefined { return this.props.settlementTxHash; }
  get solverAddress(): string | undefined { return this.props.solverAddress; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get settledAt(): Date | undefined { return this.props.settledAt; }

  // ─── Domain Logic ─────────────────────────────────

  /** Check if intent has expired */
  isExpired(currentTimeMs?: number): boolean {
    const now = currentTimeMs ?? Date.now();
    return now >= this.props.deadline;
  }

  /** Check if intent can be filled */
  canBeFilled(currentTimeMs?: number): boolean {
    const validStatuses: IntentStatus[] = ['ACTIVE', 'FILLING'];
    return validStatuses.includes(this.props.status) && !this.isExpired(currentTimeMs);
  }

  /** Check if intent can be cancelled */
  canBeCancelled(): boolean {
    const cancellableStatuses: IntentStatus[] = ['CREATED', 'PENDING', 'ACTIVE', 'FILLING'];
    return cancellableStatuses.includes(this.props.status);
  }

  /** Mark as pending (TX submitted) */
  markPending(escrowTxHash: string, outputIndex: number): void {
    this.props.status = 'PENDING';
    this.props.escrowTxHash = escrowTxHash;
    this.props.escrowOutputIndex = outputIndex;
    this.props.updatedAt = new Date();
  }

  /** Mark as active (TX confirmed on-chain) */
  markActive(): void {
    this.props.status = 'ACTIVE';
    this.props.updatedAt = new Date();
  }

  /** Mark as partially filled */
  markPartiallyFilled(filledAmount: bigint, fillCount: number): void {
    this.props.status = 'FILLING';
    this.props.remainingInput = this.props.remainingInput - filledAmount;
    this.props.fillCount = fillCount;
    this.props.updatedAt = new Date();
  }

  /** Mark as fully filled (settled) */
  markFilled(settlementTxHash: string, actualOutput: bigint, solverAddress: string): void {
    this.props.status = 'FILLED';
    this.props.settlementTxHash = settlementTxHash;
    this.props.actualOutput = actualOutput;
    this.props.solverAddress = solverAddress;
    this.props.remainingInput = 0n;
    this.props.settledAt = new Date();
    this.props.updatedAt = new Date();
  }

  /** Mark as cancelled */
  markCancelled(): void {
    this.props.status = 'CANCELLED';
    this.props.updatedAt = new Date();
  }

  /** Mark as expired */
  markExpired(): void {
    this.props.status = 'EXPIRED';
    this.props.updatedAt = new Date();
  }

  /** Mark as reclaimed (funds returned after expiry) */
  markReclaimed(): void {
    this.props.status = 'RECLAIMED';
    this.props.updatedAt = new Date();
  }

  /** Get raw props for persistence */
  toProps(): IntentProps {
    return { ...this.props };
  }
}
