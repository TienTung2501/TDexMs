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
}
