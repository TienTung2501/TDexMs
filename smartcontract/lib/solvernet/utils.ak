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
