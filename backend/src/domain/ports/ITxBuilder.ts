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
  /** Actual LP tokens to mint (computed by use case based on pool state) */
  lpToMint: bigint;
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
  escrowTxHash?: string;
  escrowOutputIndex?: number;
}

export interface SettlementTxParams {
  intentUtxoRefs: Array<{ txHash: string; outputIndex: number }>;
  /** Pool UTxO reference (if known) — will be looked up on-chain by poolDbId if not provided */
  poolUtxoRef?: { txHash: string; outputIndex: number };
  /** DB pool ID — used to look up pool NFT on-chain if poolUtxoRef is not provided */
  poolDbId?: string;
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

export interface ExecuteOrderTxParams {
  /** Solver/keeper address that signs and pays fees */
  solverAddress: string;
  /** Order UTxO reference to execute */
  orderUtxoRef: { txHash: string; outputIndex: number };
  /** Pool UTxO reference to swap against */
  poolUtxoRef: { txHash: string; outputIndex: number };
}

export interface ReclaimOrderTxParams {
  /** Keeper address that signs and pays fees — permissionless after deadline */
  keeperAddress: string;
  /** Order UTxO txHash */
  orderTxHash: string;
  /** Order UTxO output index */
  orderOutputIndex: number;
  /** Owner address — remaining budget returned here */
  ownerAddress: string;
}

export interface DeploySettingsTxParams {
  /** Admin address that signs the TX */
  adminAddress: string;
  /** Protocol fee in basis points (default 5 = 0.05%) */
  protocolFeeBps?: number;
  /** Minimum pool liquidity in lovelace */
  minPoolLiquidity?: bigint;
  /** Minimum intent size in lovelace */
  minIntentSize?: bigint;
  /** Solver bond requirement in lovelace */
  solverBond?: bigint;
  /** Fee collector address (defaults to admin) */
  feeCollectorAddress?: string;
}

export interface DeployFactoryTxParams {
  /** Admin address that signs the TX */
  adminAddress: string;
}

export interface BuildTxResult {
  unsignedTx: string;   // CBOR hex
  txHash: string;
  estimatedFee: bigint;
  /** Extra metadata returned by buildCreatePoolTx for pool registration */
  poolMeta?: {
    poolNftPolicyId: string;
    poolNftAssetName: string;
    lpPolicyId: string;
    initialLp: bigint;
    /** Output index of the pool UTxO in the TX (for DB registration) */
    poolOutputIndex?: number;
  };
  /** Extra metadata returned by buildDeploySettingsTx for env configuration */
  settingsMeta?: {
    settingsNftPolicyId: string;
    settingsNftAssetName: string;
  };
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

  /** Build a reclaim TX for expired ORDER — permissionless, uses ReclaimOrder redeemer */
  buildReclaimOrderTx(params: ReclaimOrderTxParams): Promise<BuildTxResult>;

  /** Build a TX to collect accumulated protocol fees from pool(s) — admin only */
  buildCollectFeesTx(params: CollectFeesTxParams): Promise<BuildTxResult>;

  /** Build a TX to update global protocol settings — admin only */
  buildUpdateSettingsTx(params: UpdateSettingsTxParams): Promise<BuildTxResult>;

  /** Build a TX to transfer factory admin to a new VKH — admin only */
  buildUpdateFactoryAdminTx(params: UpdateFactoryAdminTxParams): Promise<BuildTxResult>;

  /** Build a TX to burn a pool NFT (pool closure) — admin only */
  buildBurnPoolNFTTx(params: BurnPoolNFTTxParams): Promise<BuildTxResult>;


  /** Build a TX for solver to execute a pending order against a pool */
  buildExecuteOrderTx(params: ExecuteOrderTxParams): Promise<BuildTxResult>;

  /** Build a TX to deploy the initial settings UTxO — admin bootstrap */
  buildDeploySettingsTx(params: DeploySettingsTxParams): Promise<BuildTxResult>;

  /** Build a TX to deploy the factory UTxO — admin bootstrap */
  buildDeployFactoryTx(params: DeployFactoryTxParams): Promise<BuildTxResult>;

  /** Get all derived validator addresses and policy IDs from the blueprint */
  getDerivedAddresses(): {
    escrowAddress: string;
    escrowHash: string;
    poolAddress: string;
    poolHash: string;
    factoryAddress: string;
    factoryHash: string;
    orderAddress: string;
    intentPolicyId: string;
    lpPolicyId: string;
    poolNftPolicyId: string;
    settingsAddress?: string;
    settingsParamStatus: 'parameterized' | 'unparameterized' | 'error';
  };

  /** Read on-chain state from factory/settings/pool validator UTxOs */
  getOnChainState(): Promise<OnChainProtocolState>;
}

// ─── On-Chain State Types ────────────────────

export interface OnChainAssetClass {
  policy_id: string;
  asset_name: string;
}

export interface FactoryOnChainState {
  address: string;
  utxo_ref: string | null;
  datum: {
    factory_nft: OnChainAssetClass;
    pool_count: number;
    admin: string;
    settings_utxo: string; // txHash#index
  } | null;
  nfts: OnChainAssetClass[];
  lovelace: string;
}

export interface SettingsOnChainState {
  address: string | null;
  utxo_ref: string | null;
  datum: {
    admin: string;
    protocol_fee_bps: number;
    min_pool_liquidity: number;
    min_intent_size: number;
    solver_bond: number;
    fee_collector: string;
    version: number;
  } | null;
  nfts: OnChainAssetClass[];
  lovelace: string;
  /** How the settings address was discovered */
  discovery_method: 'env_config' | 'factory_datum' | 'not_found';
}

export interface PoolOnChainState {
  address: string;
  pool_nft: OnChainAssetClass;
  utxo_ref: string;
  datum: {
    asset_a: OnChainAssetClass;
    asset_b: OnChainAssetClass;
    total_lp_tokens: string;
    fee_numerator: number;
    protocol_fees_a: string;
    protocol_fees_b: string;
    last_root_k: string;
  };
  reserves: { asset_a: string; asset_b: string };
  lovelace: string;
}

export interface OnChainProtocolState {
  factory: FactoryOnChainState;
  settings: SettingsOnChainState;
  pools: PoolOnChainState[];
  /** NFT relationship: which NFTs are used where */
  nft_relationships: {
    factory_nft: { policy_id: string; asset_name: string; minted_via: string } | null;
    settings_nft: { policy_id: string; asset_name: string; expected_policy: string } | null;
    pool_nfts: Array<{ policy_id: string; asset_name: string; pool_pair: string }>;
  };
}
