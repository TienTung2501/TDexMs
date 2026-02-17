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
  Input, Output, OutputReference, Transaction, ValidityRange,
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
