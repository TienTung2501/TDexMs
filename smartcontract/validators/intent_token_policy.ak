//// SolverNet DEX — Intent Token Minting Policy
////
//// Authentication tokens for escrow (intent) UTxOs.
//// Similar to Pool NFT policy — uses one-shot pattern for uniqueness.
//// Prevents spoofing of intent UTxOs by unauthorized parties.
////
//// Each intent gets a unique token with name = hash(consumed_utxo).
//// The token is burned when the intent is filled, cancelled, or reclaimed.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Output, Transaction}
use solvernet/types.{BurnIntentToken, IntentTokenRedeemer, MintIntentToken}
use solvernet/utils.{derive_token_name}
use solvernet/validation.{check_utxo_spent}

/// Intent Token Minting Policy
///
/// Parameters:
/// - `escrow_validator_hash`: Hash of the escrow validator
///   (minted token must go to the escrow address)
///
/// Mint: Exactly 1 token, uniquely named via consumed UTxO hash.
/// Burn: Any time (fill, cancel, or reclaim will burn it).
validator intent_token_policy(escrow_validator_hash: ScriptHash) {
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
          // 3. The minted token goes to the escrow validator address
          check_token_at_escrow(
            tx.outputs,
            escrow_validator_hash,
            policy_id,
            expected_token_name,
          ),
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

/// Verify that the minted token goes to an output at the escrow validator address.
fn check_token_at_escrow(
  outputs: List<Output>,
  escrow_hash: ScriptHash,
  policy_id: PolicyId,
  token_name: ByteArray,
) -> Bool {
  list.any(
    outputs,
    fn(out) {
      and {
        // Output is at escrow validator address
        out.address.payment_credential == Script(escrow_hash),
        // Output contains the minted token
        assets.quantity_of(out.value, policy_id, token_name) == 1,
      }
    },
  )
}
