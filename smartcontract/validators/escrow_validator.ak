//// SolverNet DEX — Escrow (Intent) Validator
////
//// Holds user funds locked with swap intent parameters.
//// This is the CORE INNOVATION of the SolverNet DEX:
//// each user's intent is a separate UTxO, eliminating eUTXO concurrency issues.
////
//// Supported operations:
//// - Cancel: Owner reclaims funds (requires signature)
//// - Fill (complete): Solver fills the entire remaining intent
//// - Fill (partial): Solver fills part of the intent
//// - Reclaim: Anyone reclaims expired intent (funds go to owner)
////
//// Security:
//// - Anti-double-satisfaction via output counting
//// - Deadline enforcement for time-bounded intents
//// - Minimum fill threshold prevents griefing via micro-fills
//// - Owner address verification on all fund disbursements

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address, VerificationKey}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use solvernet/constants.{min_fill_percent_den, min_fill_percent_num}
use solvernet/types.{
  AssetClass, Cancel, EscrowDatum, EscrowRedeemer, Fill, Reclaim,
}
use solvernet/utils.{asset_class_quantity, has_nft}
use solvernet/validation.{
  check_after_deadline, check_before_deadline, check_burn_one,
  check_payment_output, check_signer,
}

/// Escrow Validator
///
/// Parameters:
/// - `intent_token_policy_id`: PolicyId of the Intent Token minting policy
///
/// The validator guards user funds locked as swap intents.
/// Each escrow UTxO holds exactly one intent with its auth token.
validator escrow_validator(intent_token_policy_id: PolicyId) {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(escrow_datum) = datum

    when redeemer is {
      Cancel -> validate_cancel(tx, escrow_datum, intent_token_policy_id)

      Fill { input_consumed, output_delivered } ->
        validate_fill(
          tx,
          escrow_datum,
          intent_token_policy_id,
          input_consumed,
          output_delivered,
        )

      Reclaim -> validate_reclaim(tx, escrow_datum, intent_token_policy_id)
    }
  }

  else(_) {
    fail
  }
}

// ============================================================================
// Cancel Validation
// ============================================================================

/// Owner cancels the intent and reclaims all remaining funds.
///
/// Requirements:
/// 1. Transaction signed by owner
/// 2. Intent token is burned
/// 3. Remaining input returned to owner
fn validate_cancel(
  tx: Transaction,
  datum: EscrowDatum,
  intent_policy_id: PolicyId,
) -> Bool {
  // Extract owner's verification key hash for signature check
  expect Some(owner_vkh) = get_owner_vkh(datum.owner)

  and {
    // 1. Owner signed the transaction
    check_signer(tx, owner_vkh),
    // 2. Intent token is burned
    check_burn_one(tx.mint, intent_policy_id, datum.escrow_token.asset_name),
    // 3. Remaining funds returned to owner
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.input_asset,
      datum.remaining_input,
    ),
  }
}

// ============================================================================
// Fill Validation
// ============================================================================

/// Solver fills the intent (partially or fully).
///
/// For complete fill:
/// - All remaining input is consumed
/// - Owner receives at least proportional min_output
/// - Intent token is burned
///
/// For partial fill:
/// - At least MIN_FILL_THRESHOLD of remaining is consumed
/// - fill_count < max_partial_fills
/// - Continuing escrow UTxO with updated datum
/// - Proportional output delivered to owner
fn validate_fill(
  tx: Transaction,
  datum: EscrowDatum,
  intent_policy_id: PolicyId,
  input_consumed: Int,
  output_delivered: Int,
) -> Bool {
  // CRITICAL: Transaction must be before deadline
  expect check_before_deadline(tx.validity_range, datum.deadline)

  // Input consumed must be positive and not exceed remaining
  expect input_consumed > 0
  expect input_consumed <= datum.remaining_input

  // Calculate proportional minimum output
  // min_required = min_output * input_consumed / input_amount
  // Use cross-multiplication to avoid precision loss
  let min_required = datum.min_output * input_consumed / datum.input_amount

  // Output delivered must meet minimum
  expect output_delivered >= min_required

  // Check: is this a complete fill or partial fill?
  let is_complete_fill = input_consumed == datum.remaining_input

  if is_complete_fill {
    validate_complete_fill(tx, datum, intent_policy_id, output_delivered)
  } else {
    validate_partial_fill(
      tx,
      datum,
      intent_policy_id,
      input_consumed,
      output_delivered,
    )
  }
}

/// Validate a complete fill of the intent.
fn validate_complete_fill(
  tx: Transaction,
  datum: EscrowDatum,
  intent_policy_id: PolicyId,
  output_delivered: Int,
) -> Bool {
  and {
    // 1. Intent token is burned
    check_burn_one(tx.mint, intent_policy_id, datum.escrow_token.asset_name),
    // 2. Output delivered to owner address
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.output_asset,
      output_delivered,
    ),
  }
}

/// Validate a partial fill of the intent.
fn validate_partial_fill(
  tx: Transaction,
  datum: EscrowDatum,
  _intent_policy_id: PolicyId,
  input_consumed: Int,
  output_delivered: Int,
) -> Bool {
  // Minimum fill threshold: must consume at least 10% of remaining
  let min_fill_amount =
    datum.remaining_input * min_fill_percent_num / min_fill_percent_den

  // Find the continuing escrow output (should have the intent token)
  expect Some(continuing_output) =
    find_continuing_escrow(tx.outputs, datum.escrow_token)

  // Parse the continuing datum
  expect InlineDatum(raw_continuing_datum) = continuing_output.datum
  expect continuing_datum: EscrowDatum = raw_continuing_datum

  // Updated remaining input
  let new_remaining = datum.remaining_input - input_consumed

  and {
    // 1. Fill count hasn't exceeded maximum
    datum.fill_count < datum.max_partial_fills,
    // 2. Input consumed meets minimum threshold
    input_consumed >= min_fill_amount,
    // 3. Output delivered to owner
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.output_asset,
      output_delivered,
    ),
    // 4. Intent token continues to the new escrow UTxO (NOT burned)
    has_nft(continuing_output.value, datum.escrow_token),
    // 5. Continuing datum is correctly updated
    continuing_datum.escrow_token == datum.escrow_token,
    continuing_datum.owner == datum.owner,
    continuing_datum.input_asset == datum.input_asset,
    continuing_datum.input_amount == datum.input_amount,
    continuing_datum.output_asset == datum.output_asset,
    continuing_datum.min_output == datum.min_output,
    continuing_datum.deadline == datum.deadline,
    continuing_datum.max_partial_fills == datum.max_partial_fills,
    continuing_datum.fill_count == datum.fill_count + 1,
    continuing_datum.remaining_input == new_remaining,
    // 6. Continuing UTxO has correct value (remaining input asset)
    asset_class_quantity(continuing_output.value, datum.input_asset) >= new_remaining,
  }
}

// ============================================================================
// Reclaim Validation
// ============================================================================

/// Anyone can reclaim expired intent — funds always go to the owner.
///
/// Requirements:
/// 1. Transaction is AFTER the deadline
/// 2. Full remaining funds sent to owner
/// 3. Intent token is burned
fn validate_reclaim(
  tx: Transaction,
  datum: EscrowDatum,
  intent_policy_id: PolicyId,
) -> Bool {
  and {
    // 1. Transaction is entirely after deadline
    check_after_deadline(tx.validity_range, datum.deadline),
    // 2. Intent token is burned
    check_burn_one(tx.mint, intent_policy_id, datum.escrow_token.asset_name),
    // 3. Full remaining input returned to owner
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.input_asset,
      datum.remaining_input,
    ),
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Extract owner's verification key hash from their address.
/// Only works for verification key addresses (not script addresses).
fn get_owner_vkh(owner: Address) -> Option<VerificationKeyHash> {
  when owner.payment_credential is {
    VerificationKey(vkh) -> Some(vkh)
    _ -> None
  }
}

/// Find the continuing escrow output that contains the intent token.
fn find_continuing_escrow(
  outputs: List<Output>,
  escrow_token: AssetClass,
) -> Option<Output> {
  list.find(outputs, fn(out) { has_nft(out.value, escrow_token) })
}
