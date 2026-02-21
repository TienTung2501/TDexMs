//// SolverNet DEX — Core Type Definitions
////
//// All on-chain types used across validators and minting policies.
//// Types follow Aiken conventions: PascalCase for types, snake_case for fields.
//// Designed for compact CBOR encoding and audit-ready clarity.

use aiken/crypto.{Blake2b_224, Hash, Script, VerificationKeyHash}
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId}
use cardano/transaction.{OutputReference}

// ============================================================================
// Common Types
// ============================================================================

/// Represents a native token identifier (policy ID + asset name).
/// For ADA: use `ada_asset_class()`.
pub type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName,
}

/// Convenience constructor for the ADA asset class.
pub fn ada_asset_class() -> AssetClass {
  AssetClass { policy_id: #"", asset_name: #"" }
}

/// POSIX timestamp in milliseconds.
pub type POSIXTime =
  Int

/// A script hash reference type alias.
pub type ScriptHash =
  Hash<Blake2b_224, Script>

// ============================================================================
// Factory Types
// ============================================================================

/// Factory global state — stored at the single factory UTxO.
/// The factory tracks pool creation and ensures trading pair uniqueness.
pub type FactoryDatum {
  /// NFT identifying this factory UTxO (thread token)
  factory_nft: AssetClass,
  /// Monotonically increasing pool counter
  pool_count: Int,
  /// Admin verification key hash (governs factory operations)
  admin: VerificationKeyHash,
  /// Reference to the settings UTxO for protocol params
  settings_utxo: OutputReference,
}

/// Actions that can be performed on the factory.
pub type FactoryRedeemer {
  /// Create a new liquidity pool
  CreatePool {
    /// First asset of the trading pair
    asset_a: AssetClass,
    /// Second asset of the trading pair
    asset_b: AssetClass,
    /// Initial deposit of asset A
    initial_a: Int,
    /// Initial deposit of asset B
    initial_b: Int,
    /// Fee numerator (denominator = 10000)
    fee_numerator: Int,
  }
  /// Update factory settings (admin only)
  UpdateSettings
}

// ============================================================================
// Pool Types
// ============================================================================

/// Pool state — each AMM pool has its own UTxO with this datum.
/// Implements constant product (x*y=k) invariant.
pub type PoolDatum {
  /// Unique pool identifier (Pool NFT asset class)
  pool_nft: AssetClass,
  /// First asset in the trading pair (canonically ordered: A < B)
  asset_a: AssetClass,
  /// Second asset in the trading pair
  asset_b: AssetClass,
  /// Total LP tokens currently in circulation
  total_lp_tokens: Int,
  /// Fee numerator (denominator is fixed at 10000)
  /// e.g., 30 = 0.3% fee per swap
  fee_numerator: Int,
  /// Accumulated protocol fees for asset A
  protocol_fees_a: Int,
  /// Accumulated protocol fees for asset B
  protocol_fees_b: Int,
  /// Root K = floor(sqrt(reserve_a * reserve_b)) at last state change.
  /// Used for manipulation resistance checks.
  last_root_k: Int,
}

/// Actions that can be performed on a pool.
pub type PoolRedeemer {
  /// Execute a token swap against the pool
  Swap { direction: SwapDirection, min_output: Int }
  /// Add liquidity to the pool (proportional deposit)
  Deposit { min_lp_tokens: Int }
  /// Remove liquidity from the pool (burn LP tokens)
  Withdraw { lp_tokens_burned: Int }
  /// Collect accumulated protocol fees (admin only)
  CollectFees
  /// Close the pool — admin burns the pool NFT and reclaims all reserves
  ClosePool
}

/// Direction of a swap.
pub type SwapDirection {
  /// Swap asset A for asset B
  AToB
  /// Swap asset B for asset A
  BToA
}

// ============================================================================
// Escrow (Intent) Types
// ============================================================================

/// Escrow datum — locks user funds with swap intent parameters.
/// Each intent is a separate UTxO, eliminating eUTXO concurrency issues.
pub type EscrowDatum {
  /// Auth token proving this is a legitimate escrow UTxO
  escrow_token: AssetClass,
  /// Owner of the intent (can cancel)
  owner: Address,
  /// Asset being offered (locked in this UTxO)
  input_asset: AssetClass,
  /// Total amount originally offered
  input_amount: Int,
  /// Asset desired in return
  output_asset: AssetClass,
  /// Minimum acceptable output amount (slippage protection)
  min_output: Int,
  /// Deadline (POSIX time ms). After this, anyone can reclaim to owner.
  deadline: POSIXTime,
  /// Maximum number of partial fills allowed (prevents griefing)
  max_partial_fills: Int,
  /// Number of fills already executed
  fill_count: Int,
  /// Remaining input amount (decreases with partial fills)
  remaining_input: Int,
}

/// Actions that can be performed on an escrow UTxO.
pub type EscrowRedeemer {
  /// Owner cancels the intent and reclaims funds
  Cancel
  /// Solver fills the intent (partially or fully)
  Fill {
    /// Amount of input asset consumed in this fill
    input_consumed: Int,
    /// Amount of output asset delivered to owner
    output_delivered: Int,
  }
  /// Reclaim expired intent (anyone can trigger, funds go to owner)
  Reclaim
}

// ============================================================================
// Order Types
// ============================================================================

/// Advanced order datum — supports limit orders, DCA, and stop-loss.
/// These are long-lived UTxOs that can be partially filled over time.
pub type OrderDatum {
  /// Order type discriminator
  order_type: OrderType,
  /// Owner address
  owner: Address,
  /// Input asset (being sold)
  asset_in: AssetClass,
  /// Output asset (being bought)
  asset_out: AssetClass,
  /// Order-specific parameters
  params: OrderParams,
  /// Auth token for this order
  order_token: AssetClass,
}

/// Discriminator for different order types.
pub type OrderType {
  /// Execute when price reaches target
  LimitOrder
  /// Dollar-cost averaging — periodic purchases
  DCA
  /// Execute when price drops below threshold
  StopLoss
}

/// Parameters that govern order execution behavior.
pub type OrderParams {
  /// Target price as rational number (numerator, denominator)
  /// For LimitOrder: buy when price <= target (or sell when >=)
  target_price_num: Int,
  target_price_den: Int,
  /// For DCA: amount per interval
  amount_per_interval: Int,
  /// For DCA: minimum slot interval between fills
  min_interval: Int,
  /// For DCA: slot of last fill execution
  last_fill_slot: Int,
  /// Total remaining budget
  remaining_budget: Int,
  /// Global deadline for the order
  deadline: POSIXTime,
}

/// Actions that can be performed on an order.
pub type OrderRedeemer {
  /// Cancel the order (owner only)
  CancelOrder
  /// Execute/fill the order
  ExecuteOrder {
    /// Amount consumed from budget
    amount_consumed: Int,
    /// Amount of output asset delivered
    output_delivered: Int,
  }
}

// ============================================================================
// Settings Types
// ============================================================================

/// Global protocol configuration — acts as read-only reference for other validators.
pub type SettingsDatum {
  /// Protocol admin (script hash for multi-sig)
  admin: ScriptHash,
  /// Protocol fee in basis points (e.g., 5 = 0.05%)
  protocol_fee_bps: Int,
  /// Minimum initial pool liquidity in lovelace
  min_pool_liquidity: Int,
  /// Minimum intent size in lovelace
  min_intent_size: Int,
  /// Solver bond requirement in lovelace (future use)
  solver_bond: Int,
  /// Fee collector address
  fee_collector: Address,
  /// Protocol version (monotonically increasing)
  version: Int,
}

/// Actions on the settings validator.
pub type SettingsRedeemer {
  /// Update protocol parameters (admin only)
  UpdateProtocolSettings
}

// ============================================================================
// Minting Policy Types
// ============================================================================

/// Redeemer for the Pool NFT minting policy.
pub type PoolNFTRedeemer {
  /// Mint a new pool NFT (during pool creation)
  MintPoolNFT {
    /// TX output reference consumed to ensure global uniqueness
    consumed_utxo: OutputReference,
  }
  /// Burn a pool NFT (pool closure — future feature)
  BurnPoolNFT
}

/// Redeemer for the LP Token minting policy.
pub type LPRedeemer {
  /// Mint or burn LP tokens (positive = mint, negative = burn)
  MintOrBurnLP {
    /// Which pool this LP action belongs to
    pool_nft: AssetClass,
    /// Amount to mint (positive) or burn (negative)
    amount: Int,
  }
}

/// Redeemer for the Intent Token minting policy.
pub type IntentTokenRedeemer {
  /// Mint intent auth token (user creates intent)
  MintIntentToken {
    /// TX output reference consumed to ensure uniqueness
    consumed_utxo: OutputReference,
  }
  /// Burn intent auth token (fill or cancel)
  BurnIntentToken
}
