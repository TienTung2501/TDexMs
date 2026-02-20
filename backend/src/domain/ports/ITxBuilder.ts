/**
 * Port: Transaction Builder Interface
 * Abstraction over Lucid TX construction.
 */

export interface SwapTxParams {
  senderAddress: string;
  changeAddress: string;
  inputAssetId: string;
  inputAmount: bigint;
  outputAssetId: string;
  minOutput: bigint;
  deadline: number;
  partialFill: boolean;
}

export interface DepositTxParams {
  poolId: string;
  senderAddress: string;
  changeAddress: string;
  amountA: bigint;
  amountB: bigint;
  minLpTokens: bigint;
}

export interface WithdrawTxParams {
  poolId: string;
  senderAddress: string;
  changeAddress: string;
  lpTokenAmount: bigint;
  minAmountA: bigint;
  minAmountB: bigint;
}

export interface CreatePoolTxParams {
  creatorAddress: string;
  changeAddress: string;
  assetAId: string;
  assetBId: string;
  initialAmountA: bigint;
  initialAmountB: bigint;
  feeNumerator: number;
}

export interface CancelIntentTxParams {
  intentId: string;
  senderAddress: string;
}

export interface SettlementTxParams {
  intentUtxoRefs: Array<{ txHash: string; outputIndex: number }>;
  poolUtxoRef: { txHash: string; outputIndex: number };
  solverAddress: string;
}

export interface OrderTxParams {
  senderAddress: string;
  changeAddress: string;
  orderType: 'LIMIT' | 'DCA' | 'STOP_LOSS';
  inputAssetId: string;
  outputAssetId: string;
  /** For LIMIT/STOP_LOSS: total input amount */
  inputAmount: bigint;
  /** Price as numerator/denominator rational */
  priceNumerator: bigint;
  priceDenominator: bigint;
  /** For DCA: total budget */
  totalBudget?: bigint;
  /** For DCA: amount per interval */
  amountPerInterval?: bigint;
  /** For DCA: min interval between fills (slots) */
  intervalSlots?: number;
  deadline: number;
}

export interface CancelOrderTxParams {
  orderId: string;
  senderAddress: string;
  escrowTxHash: string;
  escrowOutputIndex: number;
}

export interface BuildTxResult {
  unsignedTx: string;   // CBOR hex
  txHash: string;
  estimatedFee: bigint;
}

export interface ITxBuilder {
  /** Build an intent creation TX (lock funds in escrow) */
  buildCreateIntentTx(params: SwapTxParams): Promise<BuildTxResult>;

  /** Build an intent cancellation TX */
  buildCancelIntentTx(params: CancelIntentTxParams): Promise<BuildTxResult>;

  /** Build a pool creation TX */
  buildCreatePoolTx(params: CreatePoolTxParams): Promise<BuildTxResult>;

  /** Build a deposit TX */
  buildDepositTx(params: DepositTxParams): Promise<BuildTxResult>;

  /** Build a withdrawal TX */
  buildWithdrawTx(params: WithdrawTxParams): Promise<BuildTxResult>;

  /** Build a batch settlement TX (solver) */
  buildSettlementTx(params: SettlementTxParams): Promise<BuildTxResult>;

  /** Build an advanced order TX (Limit/DCA/StopLoss — lock in order validator) */
  buildOrderTx(params: OrderTxParams): Promise<BuildTxResult>;

  /** Build an order cancellation TX */
  buildCancelOrderTx(params: CancelOrderTxParams): Promise<BuildTxResult>;
}
