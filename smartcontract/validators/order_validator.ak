//// SolverNet DEX — Order Validator
////
//// Advanced order types built on top of the intent mechanism:
//// - Limit Orders: Execute when price reaches target
//// - DCA (Dollar-Cost Averaging): Periodic purchases at intervals
//// - Stop-Loss: Execute when price drops below threshold
////
//// These are long-lived UTxOs that can be partially filled over time.
//// Each order has an auth token for identity and anti-spoofing.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address, VerificationKey}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use solvernet/math.{meets_limit_price}
use solvernet/types.{
  AssetClass, CancelOrder, DCA, ExecuteOrder, LimitOrder, OrderDatum,
  OrderParams, OrderRedeemer, StopLoss,
}
use solvernet/utils.{asset_class_quantity, has_nft}
use solvernet/validation.{
  check_before_deadline, check_burn_one, check_payment_output, check_signer,
}

/// Order Validator
///
/// Parameters:
/// - `intent_token_policy_id`: PolicyId of the auth token minting policy
///   (reuses the intent token policy for order auth tokens)
validator order_validator(intent_token_policy_id: PolicyId) {
  spend(
    datum: Option<OrderDatum>,
    redeemer: OrderRedeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(order_datum) = datum

    when redeemer is {
      CancelOrder ->
        validate_cancel_order(tx, order_datum, intent_token_policy_id)
      ExecuteOrder { amount_consumed, output_delivered } ->
        validate_execute_order(
          tx,
          order_datum,
          intent_token_policy_id,
          amount_consumed,
          output_delivered,
        )
    }
  }

  else(_) {
    fail
  }
}

// ============================================================================
// Cancel Order
// ============================================================================

/// Owner cancels the order and reclaims remaining budget.
fn validate_cancel_order(
  tx: Transaction,
  datum: OrderDatum,
  token_policy_id: PolicyId,
) -> Bool {
  expect Some(owner_vkh) = get_order_owner_vkh(datum.owner)

  and {
    // 1. Owner signed
    check_signer(tx, owner_vkh),
    // 2. Order token burned
    check_burn_one(tx.mint, token_policy_id, datum.order_token.asset_name),
    // 3. Remaining budget returned to owner
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.asset_in,
      datum.params.remaining_budget,
    ),
  }
}

// ============================================================================
// Execute Order
// ============================================================================

/// Execute an order (solver or keeper fills it).
fn validate_execute_order(
  tx: Transaction,
  datum: OrderDatum,
  token_policy_id: PolicyId,
  amount_consumed: Int,
  output_delivered: Int,
) -> Bool {
  // Must be before deadline
  expect check_before_deadline(tx.validity_range, datum.params.deadline)

  // Amount consumed must be positive and within budget
  expect amount_consumed > 0
  expect amount_consumed <= datum.params.remaining_budget

  // Dispatch based on order type
  when datum.order_type is {
    LimitOrder ->
      validate_limit_order(
        tx,
        datum,
        token_policy_id,
        amount_consumed,
        output_delivered,
      )
    DCA ->
      validate_dca_order(
        tx,
        datum,
        token_policy_id,
        amount_consumed,
        output_delivered,
      )
    StopLoss ->
      validate_stop_loss_order(
        tx,
        datum,
        token_policy_id,
        amount_consumed,
        output_delivered,
      )
  }
}

// ============================================================================
// Limit Order
// ============================================================================

/// Validate limit order execution.
/// Execution price must meet target price.
fn validate_limit_order(
  tx: Transaction,
  datum: OrderDatum,
  token_policy_id: PolicyId,
  amount_consumed: Int,
  output_delivered: Int,
) -> Bool {
  let is_complete = amount_consumed == datum.params.remaining_budget

  and {
    // 1. Price meets target (cross-multiplication check)
    meets_limit_price(
      amount_consumed,
      output_delivered,
      datum.params.target_price_num,
      datum.params.target_price_den,
    ),
    // 2. Output delivered to owner
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.asset_out,
      output_delivered,
    ),
    // 3. Handle complete vs partial fill
    if is_complete {
      // Burn order token
      check_burn_one(tx.mint, token_policy_id, datum.order_token.asset_name)
    } else {
      // Continue with updated budget
      check_limit_continuation(tx.outputs, datum, amount_consumed)
    },
  }
}

// ============================================================================
// DCA Order
// ============================================================================

/// Validate DCA order execution.
/// Must respect interval timing and fixed amount per fill.
fn validate_dca_order(
  tx: Transaction,
  datum: OrderDatum,
  token_policy_id: PolicyId,
  amount_consumed: Int,
  output_delivered: Int,
) -> Bool {
  // DCA must consume exactly amount_per_interval
  let expected_amount = datum.params.amount_per_interval
  let new_remaining = datum.params.remaining_budget - amount_consumed
  let is_final_fill = new_remaining < expected_amount

  and {
    // 1. Exactly the right amount consumed
    //    (Last fill may consume less if remaining < interval amount)
    or {
      amount_consumed == expected_amount,
      and {
        is_final_fill,
        amount_consumed == datum.params.remaining_budget,
      },
    },
    // 2. Output delivered to owner at market rate
    output_delivered > 0,
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.asset_out,
      output_delivered,
    ),
    // 3. Handle continuation or completion
    if is_final_fill {
      // Final fill: burn order token
      check_burn_one(tx.mint, token_policy_id, datum.order_token.asset_name)
    } else {
      // Continue with updated datum
      check_dca_continuation(tx, datum, amount_consumed)
    },
  }
}

// ============================================================================
// Stop-Loss Order
// ============================================================================

/// Validate stop-loss order execution.
/// Triggers when price drops below threshold — converts entire remaining budget.
fn validate_stop_loss_order(
  tx: Transaction,
  datum: OrderDatum,
  token_policy_id: PolicyId,
  amount_consumed: Int,
  output_delivered: Int,
) -> Bool {
  and {
    // 1. Full remaining amount converted
    amount_consumed == datum.params.remaining_budget,
    // 2. Output delivered to owner
    output_delivered > 0,
    check_payment_output(
      tx.outputs,
      datum.owner,
      datum.asset_out,
      output_delivered,
    ),
    // 3. Order token burned (stop-loss is always complete)
    check_burn_one(tx.mint, token_policy_id, datum.order_token.asset_name),
  }
}

// ============================================================================
// Continuation Helpers
// ============================================================================

/// Check the continuing UTxO for a partially filled limit order.
fn check_limit_continuation(
  outputs: List<Output>,
  datum: OrderDatum,
  amount_consumed: Int,
) -> Bool {
  let new_remaining = datum.params.remaining_budget - amount_consumed

  // Find continuing output with order token
  expect Some(cont_output) =
    list.find(outputs, fn(out) { has_nft(out.value, datum.order_token) })

  // Parse continuing datum
  expect InlineDatum(raw_datum) = cont_output.datum
  expect cont_datum: OrderDatum = raw_datum

  and {
    // Immutable fields preserved
    cont_datum.order_type == datum.order_type,
    cont_datum.owner == datum.owner,
    cont_datum.asset_in == datum.asset_in,
    cont_datum.asset_out == datum.asset_out,
    cont_datum.order_token == datum.order_token,
    // Params preserved except remaining_budget
    cont_datum.params.target_price_num == datum.params.target_price_num,
    cont_datum.params.target_price_den == datum.params.target_price_den,
    cont_datum.params.deadline == datum.params.deadline,
    // Budget updated
    cont_datum.params.remaining_budget == new_remaining,
    // Continuing output has correct value
    asset_class_quantity(cont_output.value, datum.asset_in) >= new_remaining,
  }
}

/// Check the continuing UTxO for a DCA order after a fill.
fn check_dca_continuation(
  tx: Transaction,
  datum: OrderDatum,
  amount_consumed: Int,
) -> Bool {
  let new_remaining = datum.params.remaining_budget - amount_consumed

  // Find continuing output with order token
  expect Some(cont_output) =
    list.find(tx.outputs, fn(out) { has_nft(out.value, datum.order_token) })

  // Parse continuing datum
  expect InlineDatum(raw_datum) = cont_output.datum
  expect cont_datum: OrderDatum = raw_datum

  and {
    // Immutable fields preserved
    cont_datum.order_type == datum.order_type,
    cont_datum.owner == datum.owner,
    cont_datum.asset_in == datum.asset_in,
    cont_datum.asset_out == datum.asset_out,
    cont_datum.order_token == datum.order_token,
    // Params preserved except remaining_budget and last_fill_slot
    cont_datum.params.target_price_num == datum.params.target_price_num,
    cont_datum.params.target_price_den == datum.params.target_price_den,
    cont_datum.params.amount_per_interval == datum.params.amount_per_interval,
    cont_datum.params.min_interval == datum.params.min_interval,
    cont_datum.params.deadline == datum.params.deadline,
    // Budget updated
    cont_datum.params.remaining_budget == new_remaining,
    // Continuing output has correct value
    asset_class_quantity(cont_output.value, datum.asset_in) >= new_remaining,
  }
}

// ============================================================================
// Address Helper
// ============================================================================

/// Extract verification key hash from order owner address.
fn get_order_owner_vkh(owner: Address) -> Option<VerificationKeyHash> {
  when owner.payment_credential is {
    VerificationKey(vkh) -> Some(vkh)
    _ -> None
  }
}
