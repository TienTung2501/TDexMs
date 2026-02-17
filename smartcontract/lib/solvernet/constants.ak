//// SolverNet DEX — Protocol Constants
////
//// All protocol-wide constants used across validators.
//// Constants are defined as top-level values for zero-cost inlining.
//// All basis-point calculations use FEE_DENOMINATOR = 10000.

// ============================================================================
// Fee Constants
// ============================================================================

/// Fee denominator — all fees are expressed as numerator/10000.
/// e.g., fee_numerator = 30 means 0.3% fee.
pub const fee_denominator: Int = 10_000

/// Minimum allowed fee numerator (0.01%).
pub const min_fee_numerator: Int = 1

/// Maximum allowed fee numerator (3.0%).
pub const max_fee_numerator: Int = 300

/// Protocol fee share — 1/6 of the LP fee goes to the protocol.
/// Expressed as denominator (protocol gets fee_amount / protocol_fee_share).
pub const protocol_fee_share: Int = 6

// ============================================================================
// Pool Constants
// ============================================================================

/// Minimum liquidity locked forever in the pool on first deposit.
/// Prevents economic attacks on near-empty pools.
/// Set to 1000 LP token units.
pub const minimum_liquidity: Int = 1_000

/// Minimum initial pool creation liquidity in lovelace (2 ADA).
pub const min_pool_creation_lovelace: Int = 2_000_000

/// Minimum UTxO ADA value required in any output (1.5 ADA safety margin).
pub const min_utxo_lovelace: Int = 1_500_000

// ============================================================================
// Settings Constants
// ============================================================================

/// Maximum protocol fee in basis points (5% = 500 bps).
pub const max_protocol_fee_bps: Int = 500

/// Minimum pool initial liquidity enforced by settings (2 ADA).
pub const min_settings_pool_liquidity: Int = 2_000_000

// ============================================================================
// Intent / Escrow Constants
// ============================================================================

/// Default maximum number of partial fills per intent.
pub const default_max_partial_fills: Int = 5

/// Minimum fill percentage of remaining amount (10%).
/// Prevents griefing via micro-fills.
/// Expressed as 10 out of 100.
pub const min_fill_percent_num: Int = 10

pub const min_fill_percent_den: Int = 100

// ============================================================================
// Order Constants
// ============================================================================

/// Minimum interval between DCA fills (in slots, ~20 seconds * 180 = ~1 hour).
pub const min_dca_interval: Int = 180

// ============================================================================
// Token Constants
// ============================================================================

/// Pool NFT token name prefix for human readability.
/// Actual token name = blake2b_256(consumed_utxo) truncated to 32 bytes.
pub const pool_nft_prefix: ByteArray = "SNPOOL"

/// LP token name prefix.
pub const lp_token_prefix: ByteArray = "SNLP"

/// Intent token name prefix.
pub const intent_token_prefix: ByteArray = "SNINT"
