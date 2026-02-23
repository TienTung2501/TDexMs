//// SolverNet DEX — Protocol Constants
////
//// All protocol-wide constants used across validators.
//// Constants are defined as top-level values for zero-cost inlining.
//// All basis-point calculations use FEE_DENOMINATOR = 10000.

// ============================================================================
// Fee Constants
// ============================================================================

/// Fee denominator — all fees are expressed as numerator/10000.
/// e.g., fee_numerator = 30 means 0.3% fee.
pub const fee_denominator: Int = 10_000

/// Minimum allowed fee numerator (0.01%).
pub const min_fee_numerator: Int = 1

/// Maximum allowed fee numerator (3.0%).
pub const max_fee_numerator: Int = 300

/// Protocol fee share — 1/6 of the LP fee goes to the protocol.
/// Expressed as denominator (protocol gets fee_amount / protocol_fee_share).
pub const protocol_fee_share: Int = 6

// ============================================================================
// Pool Constants
// ============================================================================

/// Minimum liquidity locked forever in the pool on first deposit.
/// Prevents economic attacks on near-empty pools.
/// Set to 1000 LP token units.
pub const minimum_liquidity: Int = 1_000

/// Minimum initial pool creation liquidity in lovelace (2 ADA).
pub const min_pool_creation_lovelace: Int = 2_000_000

/// Minimum UTxO ADA value required in any output (1.5 ADA safety margin).
pub const min_utxo_lovelace: Int = 1_500_000

// ============================================================================
// Settings Constants
// ============================================================================

/// Maximum protocol fee in basis points (5% = 500 bps).
pub const max_protocol_fee_bps: Int = 500

/// Minimum pool initial liquidity enforced by settings (2 ADA).
pub const min_settings_pool_liquidity: Int = 2_000_000

// ============================================================================
// Intent / Escrow Constants
// ============================================================================

/// Default maximum number of partial fills per intent.
pub const default_max_partial_fills: Int = 5

/// Minimum fill percentage of remaining amount (10%).
/// Prevents griefing via micro-fills.
/// Expressed as 10 out of 100.
pub const min_fill_percent_num: Int = 10

pub const min_fill_percent_den: Int = 100

// ============================================================================
// Order Constants
// ============================================================================

/// Minimum interval between DCA fills (in slots, ~20 seconds * 180 = ~1 hour).
pub const min_dca_interval: Int = 180

// ============================================================================
// Token Constants
// ============================================================================

/// Pool NFT token name prefix for human readability.
/// Actual token name = blake2b_256(consumed_utxo) truncated to 32 bytes.
pub const pool_nft_prefix: ByteArray = "SNPOOL"

/// LP token name prefix.
pub const lp_token_prefix: ByteArray = "SNLP"

/// Intent token name prefix.
pub const intent_token_prefix: ByteArray = "SNINT"
//// SolverNet DEX — AMM Math Library
////
//// Pure mathematical functions for the constant product AMM.
//// All functions are deterministic with no side effects.
//// Integer arithmetic only — no floating point.
//// Rounding convention: ALWAYS round DOWN for user output, round UP for protocol.

use aiken/math
use solvernet/constants.{fee_denominator, minimum_liquidity, protocol_fee_share}

// ============================================================================
// Core AMM Functions
// ============================================================================

/// Calculate the output amount for a swap using constant product formula.
///
/// Formula: output = (reserve_out * input_with_fee) / (reserve_in * fee_den + input_with_fee)
/// where input_with_fee = input_amount * (fee_den - fee_numerator)
///
/// This rounds DOWN (floor division) — user gets slightly less, protecting the pool.
///
/// ## Arguments
/// * `reserve_in`    — Current reserve of the input token
/// * `reserve_out`   — Current reserve of the output token
/// * `input_amount`  — Amount of input token being swapped
/// * `fee_numerator` — Fee in basis points (e.g., 30 = 0.3%)
///
/// ## Returns
/// The output amount the user receives (after fees)
pub fn calculate_swap_output(
  reserve_in: Int,
  reserve_out: Int,
  input_amount: Int,
  fee_numerator: Int,
) -> Int {
  // Fail fast on invalid inputs
  expect reserve_in > 0
  expect reserve_out > 0
  expect input_amount > 0
  let input_with_fee = input_amount * ( fee_denominator - fee_numerator )
  let numerator = reserve_out * input_with_fee
  let denominator = reserve_in * fee_denominator + input_with_fee
  // Floor division — rounds down for user safety
  numerator / denominator
}

/// Calculate the fee amount charged on a swap.
///
/// ## Returns
/// (lp_fee, protocol_fee) — The LP fee and protocol fee portions.
pub fn calculate_swap_fee(input_amount: Int, fee_numerator: Int) -> (Int, Int) {
  let total_fee = input_amount * fee_numerator / fee_denominator
  // Protocol gets 1/6 of total fee (rounded down)
  let protocol_fee = total_fee / protocol_fee_share
  let lp_fee = total_fee - protocol_fee
  (lp_fee, protocol_fee)
}

/// Verify the constant product invariant after a swap.
///
/// After swap: (Ra' - delta_fee_a) * (Rb' - delta_fee_b) >= Ra * Rb
/// The new reserves (after protocol fee accrual) must preserve or increase K.
///
/// ## Returns
/// True if the invariant holds.
pub fn verify_constant_product(
  old_reserve_a: Int,
  old_reserve_b: Int,
  new_reserve_a: Int,
  new_reserve_b: Int,
) -> Bool {
  // Use multiplication instead of division to avoid rounding issues
  new_reserve_a * new_reserve_b >= old_reserve_a * old_reserve_b
}

// ============================================================================
// Liquidity Functions
// ============================================================================

/// Calculate initial LP tokens for the first liquidity deposit.
///
/// initial_lp = sqrt(amount_a * amount_b) - MINIMUM_LIQUIDITY
///
/// MINIMUM_LIQUIDITY (1000) is locked forever to prevent pool drain attacks.
///
/// ## Returns
/// Number of LP tokens minted to the depositor.
pub fn calculate_initial_lp(amount_a: Int, amount_b: Int) -> Int {
  expect amount_a > 0
  expect amount_b > 0
  let product = amount_a * amount_b
  expect Some(root) = math.sqrt(product)
  // Lock MINIMUM_LIQUIDITY forever
  let lp_tokens = root - minimum_liquidity
  // Must yield positive LP tokens
  expect lp_tokens > 0
  lp_tokens
}

/// Calculate LP tokens for subsequent deposits (proportional).
///
/// lp_minted = total_lp * min(delta_a / reserve_a, delta_b / reserve_b)
///
/// Uses cross-multiplication to avoid integer division precision loss.
///
/// ## Returns
/// Number of LP tokens minted to the depositor.
pub fn calculate_deposit_lp(
  total_lp: Int,
  reserve_a: Int,
  reserve_b: Int,
  deposit_a: Int,
  deposit_b: Int,
) -> Int {
  expect reserve_a > 0
  expect reserve_b > 0
  expect total_lp > 0
  // lp_from_a = total_lp * deposit_a / reserve_a
  // lp_from_b = total_lp * deposit_b / reserve_b
  // We use cross-multiplication to find min without dividing first
  let lp_from_a = total_lp * deposit_a / reserve_a
  let lp_from_b = total_lp * deposit_b / reserve_b
  // Use the smaller ratio (protects pool from imbalanced deposits)
  math.min(lp_from_a, lp_from_b)
}

/// Calculate withdrawal amounts for LP token redemption.
///
/// asset_a_out = floor(reserve_a * lp_burned / total_lp)
/// asset_b_out = floor(reserve_b * lp_burned / total_lp)
///
/// ## Returns
/// (amount_a, amount_b) to return to the LP provider.
pub fn calculate_withdrawal(
  total_lp: Int,
  reserve_a: Int,
  reserve_b: Int,
  lp_burned: Int,
) -> (Int, Int) {
  expect total_lp > 0
  expect lp_burned > 0
  expect lp_burned <= total_lp
  // Floor division — rounds down, protecting pool
  let amount_a = reserve_a * lp_burned / total_lp
  let amount_b = reserve_b * lp_burned / total_lp
  (amount_a, amount_b)
}

// ============================================================================
// Deposit Ratio Validation
// ============================================================================

/// Verify that a deposit is proportional (within acceptable rounding tolerance).
///
/// Checks: |deposit_a/reserve_a - deposit_b/reserve_b| <= tolerance
/// Using cross-multiplication: |deposit_a * reserve_b - deposit_b * reserve_a| <= tolerance * reserve_a * reserve_b / fee_den
///
/// We simplify by checking: deposit_a * reserve_b is approximately equal to deposit_b * reserve_a
/// Tolerance: difference must be < max(reserve_a, reserve_b) to allow ±1 unit rounding.
pub fn is_proportional_deposit(
  reserve_a: Int,
  reserve_b: Int,
  deposit_a: Int,
  deposit_b: Int,
) -> Bool {
  expect reserve_a > 0
  expect reserve_b > 0
  let cross_a = deposit_a * reserve_b
  let cross_b = deposit_b * reserve_a
  let diff =
    if cross_a >= cross_b {
      cross_a - cross_b
    } else {
      cross_b - cross_a
    }
  // Allow rounding tolerance of max(reserve_a, reserve_b)
  // This permits ±1 unit difference in deposit amounts
  diff <= math.max(reserve_a, reserve_b)
}

// ============================================================================
// Root K Calculation
// ============================================================================

/// Calculate the root K value for a pool state.
///
/// root_k = floor(sqrt(reserve_a * reserve_b))
///
/// Used for detecting K manipulation between transactions.
pub fn calculate_root_k(reserve_a: Int, reserve_b: Int) -> Int {
  let product = reserve_a * reserve_b
  expect Some(root) = math.sqrt(product)
  root
}

// ============================================================================
// Price Calculation
// ============================================================================

/// Calculate the effective price of a swap (as a rational number).
///
/// price = output_amount * price_den / input_amount
///
/// Used by order validator to check limit/stop-loss conditions.
pub fn effective_price(
  input_amount: Int,
  output_amount: Int,
  price_denominator: Int,
) -> Int {
  expect input_amount > 0
  output_amount * price_denominator / input_amount
}

/// Check if execution price meets limit order target.
///
/// For a buy order: effective_price <= target_price
/// Uses cross multiplication: output * target_den * input >= input * target_num * price_basis
/// Simplified: output_delivered * target_price_den >= amount_consumed * target_price_num
pub fn meets_limit_price(
  amount_consumed: Int,
  output_delivered: Int,
  target_price_num: Int,
  target_price_den: Int,
) -> Bool {
  // Cross multiply to avoid division
  // Want: output/consumed >= num/den (buy: getting at least this many per unit)
  // => output * den >= consumed * num
  output_delivered * target_price_den >= amount_consumed * target_price_num
}

// ============================================================================
// Tests
// ============================================================================

test test_calculate_swap_output_basic() {
  // Pool: 1000 A, 2000 B, fee = 30 (0.3%)
  // Swap 100 A -> B
  let output = calculate_swap_output(1000, 2000, 100, 30)
  // Expected: 2000 * 100 * 9970 / (1000 * 10000 + 100 * 9970) = 1994000000 / 10997000 = 181
  output == 181
}

test test_calculate_swap_output_no_fee() {
  // With zero fee: output = reserve_out * input / (reserve_in + input)
  // = 2000 * 100 / (1000 + 100) = 200000 / 1100 = 181
  let output = calculate_swap_output(1000, 2000, 100, 0)
  output == 181
}

test test_verify_constant_product() {
  // Old: 1000 * 2000 = 2_000_000
  // New: 1100 * 1819 = 2_000_900 >= 2_000_000 ✓
  verify_constant_product(1000, 2000, 1100, 1819)
}

test test_verify_constant_product_fails() {
  // New product is less than old
  !verify_constant_product(1000, 2000, 1100, 1800)
}

test test_calculate_initial_lp() {
  // sqrt(1_000_000 * 2_000_000) = sqrt(2_000_000_000_000) ≈ 1_414_213
  // LP = 1_414_213 - 1000 = 1_413_213
  let lp = calculate_initial_lp(1_000_000, 2_000_000)
  lp == 1_413_213
}

test test_calculate_deposit_lp() {
  // Existing pool: 1000 A, 2000 B, 1000 LP
  // Deposit: 100 A, 200 B
  // lp_from_a = 1000 * 100 / 1000 = 100
  // lp_from_b = 1000 * 200 / 2000 = 100
  // min(100, 100) = 100
  let lp = calculate_deposit_lp(1000, 1000, 2000, 100, 200)
  lp == 100
}

test test_calculate_withdrawal() {
  // Pool: 1000 A, 2000 B, 500 total LP
  // Burn 100 LP
  // a_out = 1000 * 100 / 500 = 200
  // b_out = 2000 * 100 / 500 = 400
  let (a_out, b_out) = calculate_withdrawal(500, 1000, 2000, 100)
  a_out == 200 && b_out == 400
}

test test_is_proportional_deposit() {
  // Pool: 1000 A, 2000 B
  // Deposit: 100 A, 200 B -> ratio is exact
  is_proportional_deposit(1000, 2000, 100, 200)
}

test test_is_proportional_deposit_rounding() {
  // Pool: 1000 A, 2001 B
  // Deposit: 100 A, 200 B -> slight rounding is OK
  is_proportional_deposit(1000, 2001, 100, 200)
}

test test_meets_limit_price() {
  // Target price: 2/1 (want at least 2 output per 1 input)
  // Got: 210 output for 100 input -> 210/100 = 2.1 >= 2.0 ✓
  meets_limit_price(100, 210, 2, 1)
}

test test_meets_limit_price_fails() {
  // Target price: 2/1
  // Got: 190 output for 100 input -> 1.9 < 2.0 ✗
  !meets_limit_price(100, 190, 2, 1)
}

test test_calculate_swap_fee() {
  // Input: 1000, fee: 30 bps (0.3%)
  // Total fee = 1000 * 30 / 10000 = 3
  // Protocol fee = 3 / 6 = 0
  // LP fee = 3 - 0 = 3
  let (lp_fee, protocol_fee) = calculate_swap_fee(1000, 30)
  lp_fee == 3 && protocol_fee == 0
}

test test_calculate_swap_fee_larger() {
  // Input: 100_000, fee: 30 bps
  // Total fee = 100_000 * 30 / 10000 = 300
  // Protocol fee = 300 / 6 = 50
  // LP fee = 300 - 50 = 250
  let (lp_fee, protocol_fee) = calculate_swap_fee(100_000, 30)
  lp_fee == 250 && protocol_fee == 50
}
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
  /// Reclaim expired order (permissionless — anyone can trigger after deadline)
  ReclaimOrder
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
//// SolverNet DEX — Utility Functions
////
//// Helper functions for working with values, assets, addresses,
//// and transaction contexts. Used across all validators.

use aiken/builtin
use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash, blake2b_256}
use aiken/primitive/bytearray
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{AssetName, PolicyId, Value}
use cardano/transaction.{Input, Output, OutputReference}
use solvernet/types.{AssetClass}

// ============================================================================
// Asset Class Helpers
// ============================================================================

/// Get the quantity of a specific AssetClass within a Value.
pub fn asset_class_quantity(value: Value, asset: AssetClass) -> Int {
  let AssetClass { policy_id, asset_name } = asset
  assets.quantity_of(value, policy_id, asset_name)
}

/// Check if a Value contains at least a specified quantity of an asset.
pub fn has_asset(value: Value, asset: AssetClass, min_quantity: Int) -> Bool {
  asset_class_quantity(value, asset) >= min_quantity
}

/// Check if a Value contains exactly 1 of the given NFT.
pub fn has_nft(value: Value, nft: AssetClass) -> Bool {
  asset_class_quantity(value, nft) == 1
}

/// Canonical ordering for asset pairs: asset_a < asset_b.
/// Uses lexicographic comparison on (policy_id, asset_name).
pub fn asset_class_less_than(a: AssetClass, b: AssetClass) -> Bool {
  if a.policy_id == b.policy_id {
    bytearray.compare(a.asset_name, b.asset_name) == Less
  } else {
    bytearray.compare(a.policy_id, b.policy_id) == Less
  }
}

// ============================================================================
// Output Reference Helpers
// ============================================================================

/// Derive a unique token name from an OutputReference.
/// Uses blake2b_256 hash truncated to 32 bytes (maximum AssetName length).
pub fn derive_token_name(utxo_ref: OutputReference) -> AssetName {
  let serialized = serialise_output_reference(utxo_ref)
  let hash = blake2b_256(serialized)
  hash
}

/// Serialize an OutputReference into a ByteArray for hashing.
/// Uses deterministic CBOR serialization of the full OutputReference.
fn serialise_output_reference(utxo_ref: OutputReference) -> ByteArray {
  builtin.serialise_data(utxo_ref)
}

// ============================================================================
// Transaction Input/Output Helpers
// ============================================================================

/// Find an input by its OutputReference.
pub fn find_input(
  inputs: List<Input>,
  utxo_ref: OutputReference,
) -> Option<Input> {
  list.find(inputs, fn(inp) { inp.output_reference == utxo_ref })
}

/// Check if a specific OutputReference is spent in the transaction.
pub fn is_utxo_spent(inputs: List<Input>, utxo_ref: OutputReference) -> Bool {
  list.any(inputs, fn(inp) { inp.output_reference == utxo_ref })
}

/// Find all outputs sent to a specific address.
pub fn outputs_at_address(outputs: List<Output>, addr: Address) -> List<Output> {
  list.filter(outputs, fn(out) { out.address == addr })
}

/// Find the first output at a specific script address (by script hash).
pub fn find_output_by_script(
  outputs: List<Output>,
  script_hash: ScriptHash,
) -> Option<Output> {
  list.find(
    outputs,
    fn(out) { out.address.payment_credential == Script(script_hash) },
  )
}

/// Find outputs containing a specific NFT.
pub fn find_output_with_nft(
  outputs: List<Output>,
  nft: AssetClass,
) -> Option<Output> {
  list.find(outputs, fn(out) { has_nft(out.value, nft) })
}

/// Count minted/burned tokens of a specific policy and asset name in the mint field.
pub fn minted_quantity(
  mint: Value,
  policy_id: PolicyId,
  asset_name: AssetName,
) -> Int {
  assets.quantity_of(mint, policy_id, asset_name)
}

/// Count total number of distinct token names minted/burned under a specific policy.
pub fn count_policy_tokens(mint: Value, policy_id: PolicyId) -> Int {
  let token_dict = assets.tokens(mint, policy_id)
  dict.foldr(
    token_dict,
    0,
    fn(_name, qty, acc) {
      if qty != 0 {
        acc + 1
      } else {
        acc
      }
    },
  )
}

// ============================================================================
// Address Helpers
// ============================================================================

/// Check if a transaction is signed by a specific verification key hash.
pub fn is_signed_by(
  extra_signatories: List<VerificationKeyHash>,
  vkh: VerificationKeyHash,
) -> Bool {
  list.has(extra_signatories, vkh)
}

/// Extract the payment credential's verification key hash from an address.
/// Returns None if the address is script-based.
pub fn address_to_vkh(addr: Address) -> Option<VerificationKeyHash> {
  when addr.payment_credential is {
    VerificationKey(vkh) -> Some(vkh)
    _ -> None
  }
}

// ============================================================================
// Value Helpers
// ============================================================================

/// Get the reserve amount of an asset from a pool UTxO value.
pub fn get_reserve(value: Value, asset: AssetClass) -> Int {
  let AssetClass { policy_id, asset_name } = asset
  assets.quantity_of(value, policy_id, asset_name)
}

/// Calculate the difference in an asset between two values.
/// Returns new_amount - old_amount (positive means increase).
pub fn value_delta(old_value: Value, new_value: Value, asset: AssetClass) -> Int {
  let old_amount = get_reserve(old_value, asset)
  let new_amount = get_reserve(new_value, asset)
  new_amount - old_amount
}
//// SolverNet DEX — Common Validation Helpers
////
//// Reusable validation functions shared across validators.
//// All functions return Bool for composability with `and { ... }`.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval
use cardano/address.{Address}
use cardano/assets.{PolicyId, Value}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, ValidityRange,
}
use solvernet/types.{AssetClass, POSIXTime}
use solvernet/utils.{asset_class_quantity, has_nft}

// ============================================================================
// Signature Validation
// ============================================================================

/// Verify that a specific verification key signed the transaction.
pub fn check_signer(tx: Transaction, vkh: VerificationKeyHash) -> Bool {
  list.has(tx.extra_signatories, vkh)
}

// ============================================================================
// Deadline / Time Validation
// ============================================================================

/// Verify that the transaction is executed BEFORE the given deadline.
/// Uses the upper bound of the validity interval.
/// Returns True if the transaction's entire validity range is before the deadline.
pub fn check_before_deadline(
  validity_range: ValidityRange,
  deadline: POSIXTime,
) -> Bool {
  interval.is_entirely_before(validity_range, deadline)
}

/// Verify that the transaction is executed AFTER the given deadline.
/// Uses the lower bound of the validity interval.
/// Returns True if the transaction's entire validity range is after the deadline.
pub fn check_after_deadline(
  validity_range: ValidityRange,
  deadline: POSIXTime,
) -> Bool {
  interval.is_entirely_after(validity_range, deadline)
}

// ============================================================================
// NFT / Token Continuity Validation
// ============================================================================

/// Verify that an NFT exists in a transaction input.
pub fn check_nft_in_input(inputs: List<Input>, nft: AssetClass) -> Bool {
  list.any(inputs, fn(inp) { has_nft(inp.output.value, nft) })
}

/// Verify that an NFT continues to a transaction output.
pub fn check_nft_in_output(outputs: List<Output>, nft: AssetClass) -> Bool {
  list.any(outputs, fn(out) { has_nft(out.value, nft) })
}

/// Verify NFT continuity: exists in input AND continues to output.
/// Essential for thread tokens (factory NFT, pool NFT).
pub fn check_nft_continuity(tx: Transaction, nft: AssetClass) -> Bool {
  and {
    check_nft_in_input(tx.inputs, nft),
    check_nft_in_output(tx.outputs, nft),
  }
}

// ============================================================================
// Minting Validation
// ============================================================================

/// Verify exactly N tokens of a specific policy + asset_name are minted.
pub fn check_mint_exact(
  mint: Value,
  policy_id: PolicyId,
  asset_name: ByteArray,
  expected: Int,
) -> Bool {
  let minted = assets.quantity_of(mint, policy_id, asset_name)
  minted == expected
}

/// Verify that exactly `expected` tokens with the given asset name are
/// minted/burned across ANY policy. Used when the policy ID is not known
/// at compile time (e.g., LP token verification without parameterization).
///
/// This checks all policies for the asset name and sums quantities.
/// Security: The corresponding minting policy still enforces its own checks,
/// so this cross-policy sum only provides a "sanity check" for the pool validator.
pub fn check_mint_exact_any_policy(
  mint: Value,
  asset_name: ByteArray,
  expected: Int,
) -> Bool {
  let total =
    assets.reduce(
      mint,
      0,
      fn(_policy_id, name, qty, acc) {
        if name == asset_name {
          acc + qty
        } else {
          acc
        }
      },
    )
  total == expected
}

/// Verify exactly 1 token is minted (for NFT minting).
pub fn check_mint_one(
  mint: Value,
  policy_id: PolicyId,
  asset_name: ByteArray,
) -> Bool {
  check_mint_exact(mint, policy_id, asset_name, 1)
}

/// Verify exactly 1 token is burned (for NFT burning).
pub fn check_burn_one(
  mint: Value,
  policy_id: PolicyId,
  asset_name: ByteArray,
) -> Bool {
  check_mint_exact(mint, policy_id, asset_name, -1)
}

// ============================================================================
// Output Validation
// ============================================================================

/// Verify that an output is sent to the expected address.
pub fn check_output_address(output: Output, expected: Address) -> Bool {
  output.address == expected
}

/// Verify that an output contains at least the specified value of an asset.
pub fn check_output_has_asset(
  output: Output,
  asset: AssetClass,
  min_qty: Int,
) -> Bool {
  asset_class_quantity(output.value, asset) >= min_qty
}

/// Verify that an output is paid to the correct address with correct asset amount.
/// This is the primary check for escrow fills: output must go to owner.
pub fn check_payment_output(
  outputs: List<Output>,
  recipient: Address,
  asset: AssetClass,
  min_amount: Int,
) -> Bool {
  list.any(
    outputs,
    fn(out) {
      and {
        out.address == recipient,
        asset_class_quantity(out.value, asset) >= min_amount,
      }
    },
  )
}

/// Anti-double-satisfaction version: each output must carry an InlineDatum
/// containing the unique intent/order token asset_name, ensuring a 1-to-1
/// mapping between escrow UTxOs and payment outputs.
/// This prevents a solver from satisfying multiple escrows with a single output.
pub fn check_payment_output_secure(
  outputs: List<Output>,
  recipient: Address,
  asset: AssetClass,
  min_amount: Int,
  intent_id: ByteArray,
) -> Bool {
  list.any(
    outputs,
    fn(out) {
      and {
        out.address == recipient,
        asset_class_quantity(out.value, asset) >= min_amount,
        out.datum == InlineDatum(intent_id),
      }
    },
  )
}

// ============================================================================
// UTxO Spent Validation
// ============================================================================

/// Verify that a specific UTxO is spent (consumed) in the transaction.
/// Used for one-shot NFT minting uniqueness.
pub fn check_utxo_spent(inputs: List<Input>, utxo_ref: OutputReference) -> Bool {
  list.any(inputs, fn(inp) { inp.output_reference == utxo_ref })
}

// ============================================================================
// Pool-specific Validation Helpers
// ============================================================================

/// Verify that pool datum is preserved (fields that shouldn't change).
/// Checks: pool_nft, asset_a, asset_b, fee_numerator remain the same.
/// Only total_lp_tokens, protocol_fees, and last_root_k may change.
pub fn check_pool_datum_preserved(
  old_pool_nft: AssetClass,
  old_asset_a: AssetClass,
  old_asset_b: AssetClass,
  old_fee_numerator: Int,
  new_pool_nft: AssetClass,
  new_asset_a: AssetClass,
  new_asset_b: AssetClass,
  new_fee_numerator: Int,
) -> Bool {
  and {
    old_pool_nft == new_pool_nft,
    old_asset_a == new_asset_a,
    old_asset_b == new_asset_b,
    old_fee_numerator == new_fee_numerator,
  }
}

// ============================================================================
// Anti-Double-Satisfaction Check
// ============================================================================

/// For escrow fills, we need to ensure each escrow UTxO gets its own output.
/// This prevents a solver from satisfying multiple escrows with a single output.
///
/// Strategy: Count outputs to the owner address with at least min_amount.
/// The count must be at least as many as the number of escrows being filled for that owner.
pub fn count_outputs_to_address(
  outputs: List<Output>,
  addr: Address,
  asset: AssetClass,
  min_amount: Int,
) -> Int {
  list.foldr(
    outputs,
    0,
    fn(out, acc) {
      if out.address == addr && asset_class_quantity(out.value, asset) >= min_amount {
        acc + 1
      } else {
        acc
      }
    },
  )
}
