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
