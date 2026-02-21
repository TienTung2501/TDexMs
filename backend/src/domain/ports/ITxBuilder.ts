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

export interface ReclaimTxParams {
  /** The escrow UTxO txHash to reclaim */
  escrowTxHash: string;
  /** The escrow UTxO output index */
  escrowOutputIndex: number;
  /** Address of the keeper (pays TX fees, signed by keeper wallet) */
  keeperAddress: string;
  /** Owner address — funds are returned here */
  ownerAddress: string;
}

export interface CollectFeesTxParams {
  /** Admin address that signs the TX */
  adminAddress: string;
  /** Pool IDs to collect fees from */
  poolIds: string[];
}

export interface UpdateSettingsTxParams {
  /** Admin address that signs the TX */
  adminAddress: string;
  /** New protocol settings */
  newSettings: {
    maxProtocolFeeBps: number;
    minPoolLiquidity: bigint;
    nextVersion: number;
  };
}

export interface UpdateFactoryAdminTxParams {
  /** Current admin address */
  currentAdminAddress: string;
  /** New admin's verification key hash */
  newAdminVkh: string;
}

export interface BurnPoolNFTTxParams {
  /** Admin address that signs the TX */
  adminAddress: string;
  /** Pool ID whose NFT to burn */
  poolId: string;
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

  /** Build a reclaim TX for expired escrow — permissionless, keeper pays fees */
  buildReclaimTx(params: ReclaimTxParams): Promise<BuildTxResult>;

  /** Build a TX to collect accumulated protocol fees from pool(s) — admin only */
  buildCollectFeesTx(params: CollectFeesTxParams): Promise<BuildTxResult>;

  /** Build a TX to update global protocol settings — admin only */
  buildUpdateSettingsTx(params: UpdateSettingsTxParams): Promise<BuildTxResult>;

  /** Build a TX to transfer factory admin to a new VKH — admin only */
  buildUpdateFactoryAdminTx(params: UpdateFactoryAdminTxParams): Promise<BuildTxResult>;

  /** Build a TX to burn a pool NFT (pool closure) — admin only */
  buildBurnPoolNFTTx(params: BurnPoolNFTTxParams): Promise<BuildTxResult>;
}
