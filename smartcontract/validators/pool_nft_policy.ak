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
