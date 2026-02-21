//// SolverNet DEX — Pool Validator
////
//// Core AMM logic implementing the constant product (x*y=k) invariant.
//// Manages liquidity deposits, withdrawals, and token swaps.
////
//// This is the most critical validator — it guards all pool reserves.
//// Every operation must preserve the constant product invariant and
//// correctly update the pool datum.
////
//// Security considerations:
//// - Constant product invariant is checked on every swap
//// - LP tokens are only minted/burned proportionally
//// - Pool NFT continuity ensures no pool substitution
//// - Protocol fees are tracked separately and cannot be withdrawn by LPs
//// - Minimum liquidity is locked forever to prevent pool drain

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/assets
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use solvernet/constants.{fee_denominator, protocol_fee_share}
use solvernet/math.{
  calculate_deposit_lp, calculate_initial_lp, calculate_root_k,
  calculate_withdrawal, is_proportional_deposit, verify_constant_product,
}
use solvernet/types.{
  AToB, AssetClass, BToA, ClosePool, CollectFees, Deposit, PoolDatum,
  PoolRedeemer, Swap, SwapDirection, Withdraw,
}
use solvernet/utils.{find_output_with_nft, get_reserve, has_nft}
use solvernet/validation.{
  check_mint_exact_any_policy, check_nft_continuity, check_signer,
}

/// Pool Validator
///
/// Parameters:
/// - `admin_vkh`: Protocol admin verification key hash
///
/// Note: `lp_token_policy_id` is verified via transaction minting data
/// (checking that exactly the right amount of tokens with the pool NFT
/// asset name is minted under ANY policy). The LP token policy itself
/// provides the forward-check to ensure only authorized minting.
/// This design eliminates the circular dependency between pool and LP validators.
validator pool_validator(admin_vkh: VerificationKeyHash) {
  spend(
    datum: Option<PoolDatum>,
    redeemer: PoolRedeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    // Extract datum — fail if not present
    expect Some(pool_datum) = datum

    let PoolDatum { pool_nft, asset_a, asset_b, .. } = pool_datum

    when redeemer is {
      // ClosePool: admin burns the pool NFT and reclaims all reserves
      // Does NOT require NFT continuity (the NFT is being burned)
      ClosePool -> validate_close_pool(tx, pool_datum, admin_vkh)

      // All other redeemers require NFT continuity (thread token pattern)
      _ -> {
        // CRITICAL: Pool NFT must continue (thread token pattern)
        expect check_nft_continuity(tx, pool_nft)

        // Find the continuing pool output (the output that has the pool NFT)
        expect Some(pool_output) = find_output_with_nft(tx.outputs, pool_nft)

        // Parse the output datum
        expect InlineDatum(raw_output_datum) = pool_output.datum
        expect output_datum: PoolDatum = raw_output_datum

        // Find the input pool UTxO (the input that has the pool NFT)
        expect Some(pool_input) =
          list.find(tx.inputs, fn(inp) { has_nft(inp.output.value, pool_nft) })

        // Current reserves from the input pool UTxO
        let reserve_a_in = get_reserve(pool_input.output.value, asset_a)
        let reserve_b_in = get_reserve(pool_input.output.value, asset_b)

        // New reserves from the output pool UTxO
        let reserve_a_out = get_reserve(pool_output.value, asset_a)
        let reserve_b_out = get_reserve(pool_output.value, asset_b)

        when redeemer is {
          Swap { direction, min_output } ->
            validate_swap(
              tx,
              pool_datum,
              output_datum,
              reserve_a_in,
              reserve_b_in,
              reserve_a_out,
              reserve_b_out,
              direction,
              min_output,
            )

          Deposit { min_lp_tokens } ->
            validate_deposit(
              tx,
              pool_datum,
              output_datum,
              reserve_a_in,
              reserve_b_in,
              reserve_a_out,
              reserve_b_out,
              min_lp_tokens,
            )

          Withdraw { lp_tokens_burned } ->
            validate_withdraw(
              tx,
              pool_datum,
              output_datum,
              reserve_a_in,
              reserve_b_in,
              reserve_a_out,
              reserve_b_out,
              lp_tokens_burned,
            )

          CollectFees ->
            validate_collect_fees(
              tx,
              pool_datum,
              output_datum,
              reserve_a_in,
              reserve_b_in,
              reserve_a_out,
              reserve_b_out,
              admin_vkh,
            )

          // ClosePool is already handled above
          ClosePool -> fail
        }
      }
    }
  }

  else(_) {
    fail
  }
}

// ============================================================================
// Swap Validation
// ============================================================================

/// Validate a swap operation against the pool.
///
/// Checks:
/// 1. Datum fields preserved (only protocol_fees may change)
/// 2. Constant product invariant holds
/// 3. Fee calculated correctly
/// 4. Output meets minimum slippage requirement
/// 5. Root K updated correctly
fn validate_swap(
  _tx: Transaction,
  old_datum: PoolDatum,
  new_datum: PoolDatum,
  reserve_a_in: Int,
  reserve_b_in: Int,
  reserve_a_out: Int,
  reserve_b_out: Int,
  direction: SwapDirection,
  min_output: Int,
) -> Bool {
  // Calculate input and output amounts based on direction
  let (input_amount, output_amount, new_protocol_fee_a, new_protocol_fee_b) =
    when direction is {
      AToB -> {
        let input_amt = reserve_a_out - reserve_a_in
        let output_amt = reserve_b_in - reserve_b_out
        // Protocol fee accrues on the input side (A)
        let protocol_fee =
          input_amt * old_datum.fee_numerator / fee_denominator / protocol_fee_share
        (
          input_amt,
          output_amt,
          old_datum.protocol_fees_a + protocol_fee,
          old_datum.protocol_fees_b,
        )
      }
      BToA -> {
        let input_amt = reserve_b_out - reserve_b_in
        let output_amt = reserve_a_in - reserve_a_out
        // Protocol fee accrues on the input side (B)
        let protocol_fee =
          input_amt * old_datum.fee_numerator / fee_denominator / protocol_fee_share
        (
          input_amt,
          output_amt,
          old_datum.protocol_fees_a,
          old_datum.protocol_fees_b + protocol_fee,
        )
      }
    }

  // Calculate new root K
  let new_root_k = calculate_root_k(reserve_a_out, reserve_b_out)

  and {
    // 1. Input amount must be positive
    input_amount > 0,
    // 2. Output amount must be positive
    output_amount > 0,
    // 3. Output meets minimum (slippage protection)
    output_amount >= min_output,
    // 4. Constant product invariant holds
    verify_constant_product(
      reserve_a_in,
      reserve_b_in,
      reserve_a_out,
      reserve_b_out,
    ),
    // 5. Datum immutable fields preserved
    new_datum.pool_nft == old_datum.pool_nft,
    new_datum.asset_a == old_datum.asset_a,
    new_datum.asset_b == old_datum.asset_b,
    new_datum.fee_numerator == old_datum.fee_numerator,
    // 6. Total LP tokens unchanged during swap
    new_datum.total_lp_tokens == old_datum.total_lp_tokens,
    // 7. Protocol fees updated correctly
    new_datum.protocol_fees_a == new_protocol_fee_a,
    new_datum.protocol_fees_b == new_protocol_fee_b,
    // 8. Root K updated
    new_datum.last_root_k == new_root_k,
    // 9. Root K must not decrease (anti-manipulation)
    new_root_k >= old_datum.last_root_k,
  }
}

// ============================================================================
// Deposit Validation
// ============================================================================

/// Validate a liquidity deposit operation.
///
/// Checks:
/// 1. Both assets deposited proportionally (± rounding)
/// 2. Correct LP tokens minted
/// 3. Datum updated correctly
fn validate_deposit(
  tx: Transaction,
  old_datum: PoolDatum,
  new_datum: PoolDatum,
  reserve_a_in: Int,
  reserve_b_in: Int,
  reserve_a_out: Int,
  reserve_b_out: Int,
  min_lp_tokens: Int,
) -> Bool {
  let deposit_a = reserve_a_out - reserve_a_in
  let deposit_b = reserve_b_out - reserve_b_in

  // Calculate LP tokens to mint
  let lp_to_mint =
    if old_datum.total_lp_tokens == 0 {
      // First deposit: sqrt(a * b) - MINIMUM_LIQUIDITY
      calculate_initial_lp(deposit_a, deposit_b)
    } else {
      // Subsequent deposit: proportional
      calculate_deposit_lp(
        old_datum.total_lp_tokens,
        reserve_a_in,
        reserve_b_in,
        deposit_a,
        deposit_b,
      )
    }

  // New root K
  let new_root_k = calculate_root_k(reserve_a_out, reserve_b_out)

  // LP token asset name = pool NFT asset name
  let lp_token_name = old_datum.pool_nft.asset_name

  and {
    // 1. Both deposits must be positive
    deposit_a > 0,
    deposit_b > 0,
    // 2. For subsequent deposits, amounts must be proportional
    or {
      old_datum.total_lp_tokens == 0,
      is_proportional_deposit(reserve_a_in, reserve_b_in, deposit_a, deposit_b),
    },
    // 3. LP tokens minted match expected amount
    lp_to_mint >= min_lp_tokens,
    // 4. LP minting policy mints exactly the right amount (any policy)
    check_mint_exact_any_policy(tx.mint, lp_token_name, lp_to_mint),
    // 5. Datum fields preserved
    new_datum.pool_nft == old_datum.pool_nft,
    new_datum.asset_a == old_datum.asset_a,
    new_datum.asset_b == old_datum.asset_b,
    new_datum.fee_numerator == old_datum.fee_numerator,
    // 6. Total LP updated
    new_datum.total_lp_tokens == old_datum.total_lp_tokens + lp_to_mint,
    // 7. Protocol fees unchanged during deposit
    new_datum.protocol_fees_a == old_datum.protocol_fees_a,
    new_datum.protocol_fees_b == old_datum.protocol_fees_b,
    // 8. Root K updated
    new_datum.last_root_k == new_root_k,
  }
}

// ============================================================================
// Withdraw Validation
// ============================================================================

/// Validate a liquidity withdrawal operation.
///
/// Checks:
/// 1. LP tokens are burned
/// 2. Proportional share of assets released
/// 3. Pool reserves updated correctly
fn validate_withdraw(
  tx: Transaction,
  old_datum: PoolDatum,
  new_datum: PoolDatum,
  reserve_a_in: Int,
  reserve_b_in: Int,
  reserve_a_out: Int,
  reserve_b_out: Int,
  lp_tokens_burned: Int,
) -> Bool {
  // Calculate proportional share
  let (expected_a_out, expected_b_out) =
    calculate_withdrawal(
      old_datum.total_lp_tokens,
      reserve_a_in,
      reserve_b_in,
      lp_tokens_burned,
    )

  // Assets removed from pool
  let withdrawn_a = reserve_a_in - reserve_a_out
  let withdrawn_b = reserve_b_in - reserve_b_out

  // LP token asset name = pool NFT asset name
  let lp_token_name = old_datum.pool_nft.asset_name

  // New root K
  let new_root_k = calculate_root_k(reserve_a_out, reserve_b_out)

  and {
    // 1. LP tokens burned must be positive
    lp_tokens_burned > 0,
    // 2. Cannot burn more than total supply
    lp_tokens_burned <= old_datum.total_lp_tokens,
    // 3. LP minting policy burns exactly the right amount (negative mint, any policy)
    check_mint_exact_any_policy(tx.mint, lp_token_name, -lp_tokens_burned),
    // 4. Withdrawn amounts match proportional share
    withdrawn_a == expected_a_out,
    withdrawn_b == expected_b_out,
    // 5. Remaining reserves are non-negative
    reserve_a_out >= 0,
    reserve_b_out >= 0,
    // 6. Datum fields preserved
    new_datum.pool_nft == old_datum.pool_nft,
    new_datum.asset_a == old_datum.asset_a,
    new_datum.asset_b == old_datum.asset_b,
    new_datum.fee_numerator == old_datum.fee_numerator,
    // 7. Total LP decremented
    new_datum.total_lp_tokens == old_datum.total_lp_tokens - lp_tokens_burned,
    // 8. Protocol fees unchanged during withdrawal
    new_datum.protocol_fees_a == old_datum.protocol_fees_a,
    new_datum.protocol_fees_b == old_datum.protocol_fees_b,
    // 9. Root K updated
    new_datum.last_root_k == new_root_k,
  }
}

// ============================================================================
// Collect Fees Validation
// ============================================================================

/// Validate protocol fee collection (admin only).
///
/// Checks:
/// 1. Admin signed the transaction
/// 2. Only protocol fee amounts are removed
/// 3. Fee counters are zeroed in datum
fn validate_collect_fees(
  tx: Transaction,
  old_datum: PoolDatum,
  new_datum: PoolDatum,
  reserve_a_in: Int,
  reserve_b_in: Int,
  reserve_a_out: Int,
  reserve_b_out: Int,
  admin: VerificationKeyHash,
) -> Bool {
  // Fee amounts being collected
  let fees_a = reserve_a_in - reserve_a_out
  let fees_b = reserve_b_in - reserve_b_out

  and {
    // 1. Admin signed the transaction
    check_signer(tx, admin),
    // 2. Only protocol fees are removed (not more)
    fees_a == old_datum.protocol_fees_a,
    fees_b == old_datum.protocol_fees_b,
    // 3. Datum fields preserved
    new_datum.pool_nft == old_datum.pool_nft,
    new_datum.asset_a == old_datum.asset_a,
    new_datum.asset_b == old_datum.asset_b,
    new_datum.fee_numerator == old_datum.fee_numerator,
    new_datum.total_lp_tokens == old_datum.total_lp_tokens,
    // 4. Protocol fees zeroed in output datum
    new_datum.protocol_fees_a == 0,
    new_datum.protocol_fees_b == 0,
    // 5. Root K preserved (fee collection doesn't change trading reserves)
    // Note: reserves decrease by protocol_fees amounts, which were accumulated
    // but not part of the trading reserves
    new_datum.last_root_k == old_datum.last_root_k,
  }
}

// ============================================================================
// Close Pool Validation (Admin — Pool Closure)
// ============================================================================

/// Validate pool closure — admin burns the pool NFT and reclaims reserves.
///
/// Checks:
/// 1. Admin signed the transaction
/// 2. Pool NFT is burned (exactly -1 minted)
///
/// NOTE: No NFT continuity check — the NFT is being destroyed.
/// All remaining assets in the pool UTxO are released to the admin.
fn validate_close_pool(
  tx: Transaction,
  pool_datum: PoolDatum,
  admin: VerificationKeyHash,
) -> Bool {
  let pool_nft = pool_datum.pool_nft

  // Check that the pool NFT is being burned (-1 quantity in mint)
  let nft_burned =
    assets.quantity_of(tx.mint, pool_nft.policy_id, pool_nft.asset_name) == -1

  and {
    // 1. Admin signed the transaction
    check_signer(tx, admin),
    // 2. Pool NFT is burned
    nft_burned,
  }
}
