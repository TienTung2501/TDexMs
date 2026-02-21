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
