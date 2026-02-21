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
