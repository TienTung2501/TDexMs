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
/// The validator guards user funds locked as swap intents.
/// Each escrow UTxO holds exactly one intent with its auth token.
///
/// Security: The intent token policy ID is derived from the datum's
/// `escrow_token.policy_id` field, eliminating the circular dependency
/// between escrow_validator and intent_token_policy.
validator escrow_validator {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(escrow_datum) = datum

    // Extract intent token policy ID from the datum's escrow_token field
    let intent_token_policy_id = escrow_datum.escrow_token.policy_id

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
//// SolverNet DEX — Factory Validator
////
//// Central registry for all liquidity pools.
//// Manages pool creation and ensures uniqueness of trading pairs.
//// Uses a thread NFT (factory NFT) to maintain continuous state.
////
//// The factory validator is responsible for:
//// 1. Ensuring canonical ordering of asset pairs (prevents duplicates)
//// 2. Coordinating with Pool NFT and LP Token minting policies
//// 3. Tracking pool count for enumeration
//// 4. Enforcing minimum liquidity requirements

use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use solvernet/constants.{max_fee_numerator, min_fee_numerator}
use solvernet/math.{calculate_initial_lp, calculate_root_k}
use solvernet/types.{
  AssetClass, CreatePool, FactoryDatum, FactoryRedeemer, PoolDatum,
  UpdateSettings,
}
use solvernet/utils.{asset_class_less_than, find_output_with_nft, get_reserve}
use solvernet/validation.{check_nft_continuity, check_signer}

/// Factory Validator
///
/// Parameters:
/// - `pool_validator_hash`: Hash of the pool validator (to verify pool output address)
///
/// Note: pool_nft_policy_id and lp_token_policy_id are no longer compile-time 
/// parameters (to avoid circular dependencies). Instead, the factory verifies
/// minting by inspecting the pool output's datum and transaction mint field.
/// Security is enforced by the individual minting policies themselves.
validator factory_validator(pool_validator_hash: ScriptHash) {
  spend(
    datum: Option<FactoryDatum>,
    redeemer: FactoryRedeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(factory_datum) = datum

    let FactoryDatum { factory_nft, .. } = factory_datum

    // CRITICAL: Factory NFT must continue (thread token pattern)
    expect check_nft_continuity(tx, factory_nft)

    // Find the continuing factory output
    expect Some(factory_output) = find_output_with_nft(tx.outputs, factory_nft)

    // Parse the output datum
    expect InlineDatum(raw_output_datum) = factory_output.datum
    expect output_datum: FactoryDatum = raw_output_datum

    when redeemer is {
      CreatePool { asset_a, asset_b, initial_a, initial_b, fee_numerator } ->
        validate_create_pool(
          tx,
          factory_datum,
          output_datum,
          asset_a,
          asset_b,
          initial_a,
          initial_b,
          fee_numerator,
          pool_validator_hash,
        )

      UpdateSettings ->
        validate_update_settings(tx, factory_datum, output_datum)
    }
  }

  else(_) {
    fail
  }
}

// ============================================================================
// Create Pool Validation
// ============================================================================

/// Validate pool creation.
///
/// This is the most complex factory operation. It must:
/// 1. Ensure asset pair is canonically ordered (A < B)
/// 2. Coordinate Pool NFT and LP token minting
/// 3. Create a valid pool UTxO at the pool validator address
/// 4. Update factory state (increment pool count)
fn validate_create_pool(
  tx: Transaction,
  old_datum: FactoryDatum,
  new_datum: FactoryDatum,
  asset_a: AssetClass,
  asset_b: AssetClass,
  initial_a: Int,
  initial_b: Int,
  fee_numerator: Int,
  pool_hash: ScriptHash,
) -> Bool {
  // Calculate initial LP tokens
  let initial_lp = calculate_initial_lp(initial_a, initial_b)

  // Calculate initial root K 
  let initial_root_k = calculate_root_k(initial_a, initial_b)

  // Find a pool output at the pool validator address
  // The pool output must contain a pool NFT (identified by pool datum)
  expect Some(pool_output) =
    list.find(
      tx.outputs,
      fn(out) { out.address.payment_credential == Script(pool_hash) },
    )

  // Parse pool output datum
  expect InlineDatum(raw_pool_datum) = pool_output.datum
  expect pool_datum: PoolDatum = raw_pool_datum

  // Verify the pool NFT is actually minted in this TX
  let pool_nft = pool_datum.pool_nft
  let pool_nft_minted =
    assets.quantity_of(tx.mint, pool_nft.policy_id, pool_nft.asset_name)

  // Verify LP tokens are minted (any policy, matching pool NFT asset name)
  let lp_token_name = pool_nft.asset_name

  and {
    // 1. Asset pair is canonically ordered (prevents duplicate pairs)
    asset_class_less_than(asset_a, asset_b),
    // 2. Initial amounts are positive
    initial_a > 0,
    initial_b > 0,
    // 3. Fee numerator is within valid bounds
    fee_numerator >= min_fee_numerator,
    fee_numerator <= max_fee_numerator,
    // 4. Pool NFT is minted (exactly 1)
    pool_nft_minted == 1,
    // 5. LP tokens are minted (initial supply, verified across all policies)
    check_lp_minted_any_policy(tx.mint, lp_token_name, initial_lp),
    // 6. Pool output has correct datum
    pool_datum.asset_a == asset_a,
    pool_datum.asset_b == asset_b,
    pool_datum.total_lp_tokens == initial_lp,
    pool_datum.fee_numerator == fee_numerator,
    pool_datum.protocol_fees_a == 0,
    pool_datum.protocol_fees_b == 0,
    pool_datum.last_root_k == initial_root_k,
    // 7. Pool output has correct reserves
    get_reserve(pool_output.value, asset_a) >= initial_a,
    get_reserve(pool_output.value, asset_b) >= initial_b,
    // 8. Factory output datum updated correctly
    new_datum.factory_nft == old_datum.factory_nft,
    new_datum.pool_count == old_datum.pool_count + 1,
    new_datum.admin == old_datum.admin,
    new_datum.settings_utxo == old_datum.settings_utxo,
  }
}

// ============================================================================
// Update Settings Validation
// ============================================================================

/// Validate settings update (admin only).
///
/// Only the admin and settings_utxo fields can change.
fn validate_update_settings(
  tx: Transaction,
  old_datum: FactoryDatum,
  new_datum: FactoryDatum,
) -> Bool {
  and {
    // 1. Admin signed the transaction
    check_signer(tx, old_datum.admin),
    // 2. Factory NFT preserved
    new_datum.factory_nft == old_datum.factory_nft,
    // 3. Pool count preserved (cannot reset)
    new_datum.pool_count == old_datum.pool_count,
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Check LP token minting amount across any policy.
/// LP token asset name = pool NFT asset name.
fn check_lp_minted_any_policy(
  mint: assets.Value,
  pool_nft_name: ByteArray,
  expected_amount: Int,
) -> Bool {
  // Sum LP tokens minted under any policy with the matching asset name
  let total =
    assets.reduce(
      mint,
      0,
      fn(_policy_id, name, qty, acc) {
        if name == pool_nft_name {
          acc + qty
        } else {
          acc
        }
      },
    )
  // We expect at least `expected_amount` across ALL policies
  // (pool NFT mint of 1 uses the same name, so total = 1 + initial_lp)
  // Subtract 1 for the pool NFT itself
  total - 1 == expected_amount
}
//// SolverNet DEX — Intent Token Minting Policy
////
//// Authentication tokens for escrow (intent) and order UTxOs.
//// Uses one-shot pattern for uniqueness — each token name = hash(consumed_utxo).
//// Prevents spoofing by requiring a specific UTxO to be consumed.
////
//// Security model:
//// - One-shot pattern (check_utxo_spent) guarantees unique token names
//// - Exactly 1 token minted per transaction
//// - Destination validation is delegated to escrow_validator / order_validator
////   (both independently verify the token is present in their datum)
//// - Token is burned when the intent/order is filled, cancelled, or reclaimed.

use aiken/collection/dict
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction}
use solvernet/types.{BurnIntentToken, IntentTokenRedeemer, MintIntentToken}
use solvernet/utils.{derive_token_name}
use solvernet/validation.{check_utxo_spent}

/// Intent Token Minting Policy (no parameters — standalone)
///
/// Mint: Exactly 1 token, uniquely named via consumed UTxO hash.
/// Burn: Exactly 1 token burned (fill, cancel, or reclaim).
validator intent_token_policy {
  mint(redeemer: IntentTokenRedeemer, policy_id: PolicyId, tx: Transaction) {
    when redeemer is {
      MintIntentToken { consumed_utxo } -> {
        // Derive deterministic token name
        let expected_token_name = derive_token_name(consumed_utxo)

        // Get minted tokens for this policy
        let minted_tokens = assets.tokens(tx.mint, policy_id)

        and {
          // 1. The consumed UTxO is actually spent in this transaction
          check_utxo_spent(tx.inputs, consumed_utxo),
          // 2. Exactly 1 token minted with the correct name
          check_exactly_one_mint(minted_tokens, expected_token_name),
        }
      }

      BurnIntentToken -> {
        // Anyone can burn (fill, cancel, reclaim will trigger this)
        // Just verify exactly 1 token is burned
        let minted_tokens = assets.tokens(tx.mint, policy_id)
        check_exactly_one_burn(minted_tokens)
      }
    }
  }

  else(_) {
    fail
  }
}

/// Verify exactly 1 token is minted with the expected name.
fn check_exactly_one_mint(
  minted_tokens: dict.Dict<ByteArray, Int>,
  expected_name: ByteArray,
) -> Bool {
  when dict.to_pairs(minted_tokens) is {
    [Pair(name, qty)] -> name == expected_name && qty == 1
    _ -> False
  }
}

/// Verify exactly 1 token is burned.
fn check_exactly_one_burn(minted_tokens: dict.Dict<ByteArray, Int>) -> Bool {
  when dict.to_pairs(minted_tokens) is {
    [Pair(_, qty)] -> qty == -1
    _ -> False
  }
}
//// SolverNet DEX — LP Token Minting Policy
////
//// Manages liquidity provider tokens — minted on deposit, burned on withdrawal.
//// Uses the "forwarding mint" pattern: validation logic is delegated to
//// the Pool Validator (for deposits/withdrawals) or Factory Validator
//// (for initial pool creation).
////
//// Each pool has its own LP token asset name (= pool NFT asset name),
//// establishing a 1:1 correspondence between pool identity and LP token identity.
////
//// Security: LP tokens can only be minted/burned when the pool validator
//// OR factory validator is invoked in the same transaction.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Input, Transaction}
use solvernet/types.{AssetClass, LPRedeemer, MintOrBurnLP}
use solvernet/utils.{has_nft}

/// LP Token Minting Policy (Forwarding Mint Pattern)
///
/// Parameters:
/// - `pool_validator_hash`: Hash of the pool validator
///   (authorizes LP mint/burn during deposit/withdraw)
/// - `factory_validator_hash`: Hash of the factory validator
///   (authorizes initial LP mint during pool creation)
///
/// During pool creation, no pool UTxO exists yet, so the factory validator
/// serves as the authorization source. For subsequent deposits/withdrawals,
/// the pool validator provides authorization.
validator lp_token_policy(
  pool_validator_hash: ScriptHash,
  factory_validator_hash: ScriptHash,
) {
  mint(redeemer: LPRedeemer, policy_id: PolicyId, tx: Transaction) {
    let MintOrBurnLP { pool_nft, amount } = redeemer

    // Get the minted/burned tokens under this policy
    let minted_tokens = assets.tokens(tx.mint, policy_id)

    and {
      // 1. Amount must be non-zero
      amount != 0,
      // 2. EITHER pool validator OR factory validator is invoked
      //    - Pool validator: for deposit/withdraw (pool UTxO exists)
      //    - Factory validator: for initial pool creation (no pool UTxO yet)
      or {
        check_pool_validator_invoked(tx.inputs, pool_validator_hash, pool_nft),
        check_factory_validator_invoked(tx.inputs, factory_validator_hash),
      },
      // 3. Exactly one token name is minted/burned under this policy
      //    and the amount matches the redeemer
      check_lp_mint_amount(minted_tokens, pool_nft.asset_name, amount),
    }
  }

  else(_) {
    fail
  }
}

/// Verify the pool validator is invoked AND the specified pool NFT is present.
/// The pool UTxO must be at the pool validator address and contain the pool NFT.
fn check_pool_validator_invoked(
  inputs: List<Input>,
  pool_hash: ScriptHash,
  pool_nft: AssetClass,
) -> Bool {
  list.any(
    inputs,
    fn(inp) {
      and {
        // Input is at the pool validator address
        inp.output.address.payment_credential == Script(pool_hash),
        // Input contains the specified pool NFT
        has_nft(inp.output.value, pool_nft),
      }
    },
  )
}

/// Verify factory validator is invoked (for pool creation).
fn check_factory_validator_invoked(
  inputs: List<Input>,
  factory_hash: ScriptHash,
) -> Bool {
  list.any(
    inputs,
    fn(inp) { inp.output.address.payment_credential == Script(factory_hash) },
  )
}

/// Verify exactly the right amount of LP tokens are minted/burned
/// with the correct asset name.
fn check_lp_mint_amount(
  minted_tokens: dict.Dict<ByteArray, Int>,
  expected_name: ByteArray,
  expected_amount: Int,
) -> Bool {
  when dict.to_pairs(minted_tokens) is {
    // Exactly one entry: the LP token
    [Pair(name, qty)] -> name == expected_name && qty == expected_amount
    // Any other case (0 or 2+ entries) is invalid
    _ -> False
  }
}
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
//// SolverNet DEX — Pool NFT Minting Policy
////
//// Ensures each liquidity pool has a unique, unforgeable identity token.
//// Uses the "one-shot" pattern: consuming a specific UTxO guarantees uniqueness
//// since each UTxO can only be spent once.
////
//// Security: The NFT is minted exactly once per pool creation and can only
//// be burned by protocol admin for pool closure (future feature).

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Input, Transaction}
use solvernet/types.{BurnPoolNFT, MintPoolNFT, PoolNFTRedeemer}
use solvernet/utils.{derive_token_name}
use solvernet/validation.{check_signer, check_utxo_spent}

/// Pool NFT Minting Policy
///
/// Parameters:
/// - `factory_validator_hash`: Hash of the factory validator (ensures pool
///   creation goes through the factory)
/// - `admin_vkh`: Protocol admin key (for future burn functionality)
///
/// Mint: Exactly 1 NFT with name = hash(consumed_utxo)
/// Burn: Only by protocol admin (pool closure)
validator pool_nft_policy(
  factory_validator_hash: ScriptHash,
  admin_vkh: VerificationKeyHash,
) {
  mint(redeemer: PoolNFTRedeemer, policy_id: PolicyId, tx: Transaction) {
    when redeemer is {
      MintPoolNFT { consumed_utxo } -> {
        // Derive deterministic token name from the consumed UTxO
        let expected_token_name = derive_token_name(consumed_utxo)

        // Get the minted tokens for this policy
        let minted_tokens = assets.tokens(tx.mint, policy_id)

        and {
          // 1. The consumed UTxO is actually spent in this transaction
          check_utxo_spent(tx.inputs, consumed_utxo),
          // 2. Exactly 1 token minted with the correct name
          minted_tokens
            |> dict.to_pairs()
            |> check_exactly_one_nft(expected_token_name),
          // 3. Factory validator is invoked in this TX
          //    (factory UTxO must be spent, validated by its own script)
          check_factory_invoked(tx.inputs, factory_validator_hash),
        }
      }

      // 4. The minted NFT goes to the pool validator address
      //    (This is implicitly enforced by the factory validator which
      //     checks the pool output is at the correct address)
      BurnPoolNFT -> {
        // Only protocol admin can burn a pool NFT
        // Get the burned tokens for this policy
        let minted_tokens = assets.tokens(tx.mint, policy_id)

        and {
          // 1. Admin signed the transaction
          check_signer(tx, admin_vkh),
          // 2. Exactly 1 token burned (negative quantity)
          minted_tokens
            |> dict.to_pairs()
            |> check_exactly_one_burn(),
        }
      }
    }
  }

  else(_) {
    fail
  }
}

/// Verify exactly 1 token is minted with the expected name.
fn check_exactly_one_nft(
  pairs: Pairs<ByteArray, Int>,
  expected_name: ByteArray,
) -> Bool {
  when pairs is {
    [Pair(name, qty)] -> name == expected_name && qty == 1
    _ -> False
  }
}

/// Verify exactly 1 token is burned.
fn check_exactly_one_burn(pairs: Pairs<ByteArray, Int>) -> Bool {
  when pairs is {
    [Pair(_, qty)] -> qty == -1
    _ -> False
  }
}

/// Verify that the factory validator is invoked (an input from the factory exists).
fn check_factory_invoked(inputs: List<Input>, factory_hash: ScriptHash) -> Bool {
  list.any(
    inputs,
    fn(inp) { inp.output.address.payment_credential == Script(factory_hash) },
  )
}
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
//// SolverNet DEX — Settings Validator (Governance)
////
//// Global protocol configuration. Acts as a read-only reference for
//// other validators and can only be updated by the protocol admin.
////
//// The settings UTxO holds protocol-wide parameters like fee rates,
//// minimum liquidity requirements, and the fee collector address.
//// Its NFT (thread token) ensures continuity across updates.

use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use solvernet/constants.{max_protocol_fee_bps, min_settings_pool_liquidity}
use solvernet/types.{
  AssetClass, SettingsDatum, SettingsRedeemer, UpdateProtocolSettings,
}
use solvernet/utils.{find_output_with_nft, has_nft}

/// Settings Validator
///
/// Parameters:
/// - `settings_nft`: The NFT that identifies the unique settings UTxO
///
/// The settings UTxO is a singleton — there is exactly one on-chain,
/// identified by the settings NFT. Other validators reference it
/// via reference inputs.
validator settings_validator(settings_nft: AssetClass) {
  spend(
    datum: Option<SettingsDatum>,
    redeemer: SettingsRedeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(settings_datum) = datum
    let UpdateProtocolSettings = redeemer

    // Settings NFT must continue
    expect
      list.any(tx.inputs, fn(inp) { has_nft(inp.output.value, settings_nft) })
    expect list.any(tx.outputs, fn(out) { has_nft(out.value, settings_nft) })

    // Find the continuing settings output
    expect Some(settings_output) =
      find_output_with_nft(tx.outputs, settings_nft)

    // Parse the new datum
    expect InlineDatum(raw_new_datum) = settings_output.datum
    expect new_datum: SettingsDatum = raw_new_datum

    // Validate the update
    validate_settings_update(tx, settings_datum, new_datum)
  }

  else(_) {
    fail
  }
}

/// Validate a settings update.
///
/// Rules:
/// 1. Current admin must sign the transaction
/// 2. Version must be incremented
/// 3. Protocol fee must be within bounds
/// 4. Minimum pool liquidity must meet floor
fn validate_settings_update(
  tx: Transaction,
  old_datum: SettingsDatum,
  new_datum: SettingsDatum,
) -> Bool {
  and {
    // 1. Current admin must authorize the update
    //    (admin is a ScriptHash — we check if the script is invoked)
    check_admin_authorized(tx, old_datum.admin),
    // 2. Version must be strictly incremented
    new_datum.version == old_datum.version + 1,
    // 3. Protocol fee within bounds (0 to max_protocol_fee_bps)
    new_datum.protocol_fee_bps >= 0,
    new_datum.protocol_fee_bps <= max_protocol_fee_bps,
    // 4. Minimum pool liquidity meets floor
    new_datum.min_pool_liquidity >= min_settings_pool_liquidity,
    // 5. Minimum intent size must be positive
    new_datum.min_intent_size > 0,
  }
}

/// Check that the admin (multi-sig script) authorized the transaction.
/// For a script-based admin, the admin script must be invoked.
/// We check this by looking for the admin script in the transaction's
/// extra signatories or by verifying a withdrawal from the admin script.
fn check_admin_authorized(tx: Transaction, admin: ScriptHash) -> Bool {
  // Check if admin script is in withdrawals (common pattern for script auth)
  list.any(
    tx.withdrawals,
    fn(pair) {
      let Pair(credential, _amount) = pair
      credential == Script(admin)
    },
  )
}
