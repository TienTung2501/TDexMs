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
