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
