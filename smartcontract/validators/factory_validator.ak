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

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use solvernet/constants.{max_fee_numerator, min_fee_numerator}
use solvernet/math.{calculate_initial_lp, calculate_root_k}
use solvernet/types.{
  AssetClass, CreatePool, FactoryDatum, FactoryRedeemer, PoolDatum,
  UpdateSettings,
}
use solvernet/utils.{
  asset_class_less_than, find_output_with_nft, get_reserve, has_nft,
}
use solvernet/validation.{check_mint_one, check_nft_continuity, check_signer}

/// Factory Validator
///
/// Parameters:
/// - `pool_nft_policy_id`: PolicyId of the Pool NFT minting policy
/// - `lp_token_policy_id`: PolicyId of the LP Token minting policy
/// - `pool_validator_hash`: Hash of the pool validator (to verify pool output address)
validator factory_validator(
  pool_nft_policy_id: PolicyId,
  lp_token_policy_id: PolicyId,
  pool_validator_hash: ScriptHash,
) {
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
          pool_nft_policy_id,
          lp_token_policy_id,
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
  pool_nft_policy: PolicyId,
  lp_policy: PolicyId,
  pool_hash: ScriptHash,
) -> Bool {
  // Find a pool NFT being minted in this transaction  
  // The pool NFT token name is derived from a consumed UTxO
  // We verify it by checking that exactly one token is minted under the policy
  expect Some(pool_nft_name) = find_minted_nft_name(tx.mint, pool_nft_policy)

  let pool_nft =
    AssetClass { policy_id: pool_nft_policy, asset_name: pool_nft_name }

  // Calculate initial LP tokens
  let initial_lp = calculate_initial_lp(initial_a, initial_b)

  // Calculate initial root K
  let initial_root_k = calculate_root_k(initial_a, initial_b)

  // Find the pool output (at pool validator address, containing pool NFT)
  expect Some(pool_output) = find_pool_output(tx.outputs, pool_hash, pool_nft)

  // Parse pool output datum
  expect InlineDatum(raw_pool_datum) = pool_output.datum
  expect pool_datum: PoolDatum = raw_pool_datum

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
    check_mint_one(tx.mint, pool_nft_policy, pool_nft_name),
    // 5. LP tokens are minted (initial supply)
    check_lp_minted(tx.mint, lp_policy, pool_nft_name, initial_lp),
    // 6. Pool output has correct datum
    pool_datum.pool_nft == pool_nft,
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

/// Find the name of the NFT being minted under a policy.
/// Returns None if no tokens or more than one token is minted.
fn find_minted_nft_name(
  mint: assets.Value,
  policy_id: PolicyId,
) -> Option<ByteArray> {
  let token_dict = assets.tokens(mint, policy_id)
  when dict.to_pairs(token_dict) is {
    [Pair(name, qty)] ->
      if qty == 1 {
        Some(name)
      } else {
        None
      }
    _ -> None
  }
}

/// Find the pool output at the pool validator address containing the pool NFT.
fn find_pool_output(
  outputs: List<Output>,
  pool_hash: ScriptHash,
  pool_nft: AssetClass,
) -> Option<Output> {
  list.find(
    outputs,
    fn(out) {
      and {
        out.address.payment_credential == Script(pool_hash),
        has_nft(out.value, pool_nft),
      }
    },
  )
}

/// Check LP token minting amount.
/// LP token asset name = pool NFT asset name.
fn check_lp_minted(
  mint: assets.Value,
  lp_policy: PolicyId,
  pool_nft_name: ByteArray,
  expected_amount: Int,
) -> Bool {
  // LP token name equals pool NFT name (1:1 correspondence)
  let lp_minted = assets.quantity_of(mint, lp_policy, pool_nft_name)
  lp_minted == expected_amount
}
