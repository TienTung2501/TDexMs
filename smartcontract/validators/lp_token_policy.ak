//// SolverNet DEX — LP Token Minting Policy
////
//// Manages liquidity provider tokens — minted on deposit, burned on withdrawal.
//// Uses the "forwarding mint" pattern: ALL validation logic is delegated to
//// the Pool Validator. This keeps the minting policy minimal (~2KB).
////
//// Each pool has its own LP token asset name (= pool NFT asset name),
//// establishing a 1:1 correspondence between pool identity and LP token identity.
////
//// Security: LP tokens can only be minted/burned when the pool validator is
//// invoked in the same transaction, preventing unauthorized inflation/deflation.

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
///   (only this validator can authorize LP mint/burn)
///
/// The LP token policy is intentionally simple — it only checks that
/// the pool validator is involved in the transaction. The pool validator
/// handles all the complex validation (proportional deposit, correct burn, etc.).
validator lp_token_policy(pool_validator_hash: ScriptHash) {
  mint(redeemer: LPRedeemer, policy_id: PolicyId, tx: Transaction) {
    let MintOrBurnLP { pool_nft, amount } = redeemer

    // Get the minted/burned tokens under this policy
    let minted_tokens = assets.tokens(tx.mint, policy_id)

    and {
      // 1. Amount must be non-zero
      amount != 0,
      // 2. Pool validator is invoked in this transaction
      //    (a pool UTxO with the specified pool NFT must be in the inputs)
      check_pool_validator_invoked(tx.inputs, pool_validator_hash, pool_nft),
      // 3. Exactly one token name is minted/burned under this policy
      //    and the amount matches the redeemer
      check_lp_mint_amount(minted_tokens, pool_nft.asset_name, amount),
    }
    // 4. LP token asset name must match pool NFT asset name
    //    (This is already ensured by check #3 since we use pool_nft.asset_name)
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
