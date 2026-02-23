/**
 * AmmMath — Centralized AMM calculation module
 *
 * All AMM math lives here to ensure consistency between:
 * - TxBuilder (buildSettlementTx, buildWithdrawTx, buildDepositTx, buildExecuteOrderTx)
 * - NettingEngine
 * - Solver Engine price simulations
 *
 * Constants match Aiken `solvernet/constants.ak` exactly.
 */

// ============================================================================
// Protocol Constants (match Aiken constants.ak)
// ============================================================================

/** Fee denominator — all fees are basis points out of 10,000 */
export const FEE_DENOMINATOR = 10_000n;

/** Protocol fee share — 1/6 of the LP fee goes to the protocol */
export const PROTOCOL_FEE_SHARE = 6n;

/** Minimum UTxO ADA value (1.5 ADA safety margin) */
export const MIN_UTXO_LOVELACE = 1_500_000n;

// ============================================================================
// Active Reserve Calculation
// ============================================================================

export interface ActiveReserves {
  activeA: bigint;
  activeB: bigint;
}

/**
 * Compute active reserves by subtracting accumulated protocol fees
 * from physical (on-chain) reserves.
 *
 * active_reserve = physical_reserve - protocol_fees
 *
 * This is CRITICAL for correct AMM math. The physical UTxO value includes
 * protocol fees that belong to admin, NOT to the LP pool.
 */
export function getActiveReserves(
  physicalA: bigint,
  physicalB: bigint,
  protocolFeesA: bigint,
  protocolFeesB: bigint,
): ActiveReserves {
  return {
    activeA: physicalA - protocolFeesA,
    activeB: physicalB - protocolFeesB,
  };
}

// ============================================================================
// Swap Calculations
// ============================================================================

/**
 * Calculate swap output using constant product formula with fee deduction.
 *
 * Matches Aiken math.calculate_swap_output EXACTLY:
 *   input_with_fee = input_amount * (fee_denominator - fee_numerator)
 *   numerator = reserve_out * input_with_fee
 *   denominator = reserve_in * fee_denominator + input_with_fee
 *   output = numerator / denominator
 *
 * CRITICAL: We multiply before dividing to avoid intermediate precision loss.
 * The old formula divided by FEE_DENOMINATOR early, losing up to 1 unit per swap.
 */
export function calculateSwapOutput(
  reserveIn: bigint,
  reserveOut: bigint,
  inputAmount: bigint,
  feeNumerator: bigint,
): bigint {
  const inputWithFee = inputAmount * (FEE_DENOMINATOR - feeNumerator);
  const numerator = reserveOut * inputWithFee;
  const denominator = reserveIn * FEE_DENOMINATOR + inputWithFee;
  return numerator / denominator;
}

/**
 * Calculate the protocol fee portion from a swap input.
 *
 * total_fee = input * feeNumerator / FEE_DENOMINATOR
 * protocol_fee = total_fee / PROTOCOL_FEE_SHARE
 */
export function calculateProtocolFee(
  inputAmount: bigint,
  feeNumerator: bigint,
): bigint {
  return (inputAmount * feeNumerator / FEE_DENOMINATOR) / PROTOCOL_FEE_SHARE;
}

/**
 * Reverse AMM: given a desired output, calculate the required input.
 *
 * Derived from the on-chain formula:
 *   output = reserveOut * input * (D - fee) / (reserveIn * D + input * (D - fee))
 *   => input = (reserveIn * output * D) / ((reserveOut - output) * (D - fee))
 *
 * Returns 0n if output >= reserveOut (impossible swap).
 */
export function calculateRequiredInput(
  reserveIn: bigint,
  reserveOut: bigint,
  desiredOutput: bigint,
  feeNumerator: bigint,
): bigint {
  if (desiredOutput >= reserveOut) return 0n;
  const numerator = reserveIn * desiredOutput * FEE_DENOMINATOR;
  const denominator = (reserveOut - desiredOutput) * (FEE_DENOMINATOR - feeNumerator);
  return denominator > 0n ? (numerator / denominator) + 1n : 0n; // +1 for ceiling
}

// ============================================================================
// LP Token Calculations
// ============================================================================

/** Integer square root via Newton's method — matches Aiken stdlib */
export function bigIntSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('Square root of negative number');
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/**
 * Calculate initial LP tokens for first deposit.
 * lp = sqrt(depositA * depositB) - MINIMUM_LIQUIDITY
 */
export function calculateInitialLp(depositA: bigint, depositB: bigint): bigint {
  return bigIntSqrt(depositA * depositB) - 1000n;
}

/**
 * Calculate LP tokens for subsequent deposits.
 * lp = min(totalLp * depositA / reserveA, totalLp * depositB / reserveB)
 */
export function calculateDepositLp(
  totalLp: bigint,
  reserveA: bigint,
  reserveB: bigint,
  depositA: bigint,
  depositB: bigint,
): bigint {
  const lpFromA = (totalLp * depositA) / reserveA;
  const lpFromB = (totalLp * depositB) / reserveB;
  return lpFromA < lpFromB ? lpFromA : lpFromB;
}

/**
 * Calculate proportional withdrawal amounts.
 * amountA = reserveA * lpBurned / totalLp
 * amountB = reserveB * lpBurned / totalLp
 */
export function calculateWithdrawal(
  totalLp: bigint,
  reserveA: bigint,
  reserveB: bigint,
  lpBurned: bigint,
): { withdrawA: bigint; withdrawB: bigint } {
  return {
    withdrawA: (reserveA * lpBurned) / totalLp,
    withdrawB: (reserveB * lpBurned) / totalLp,
  };
}

/**
 * Calculate root K = floor(sqrt(reserveA * reserveB))
 */
export function calculateRootK(reserveA: bigint, reserveB: bigint): bigint {
  return bigIntSqrt(reserveA * reserveB);
}

// ============================================================================
// Price Helpers
// ============================================================================

/**
 * Check if execution price meets limit order target price.
 * meets_limit_price: output * priceDen >= consumed * priceNum
 */
export function meetsLimitPrice(
  amountConsumed: bigint,
  outputDelivered: bigint,
  targetPriceNum: bigint,
  targetPriceDen: bigint,
): boolean {
  return outputDelivered * targetPriceDen >= amountConsumed * targetPriceNum;
}

/**
 * Calculate the maximum input amount that can be absorbed by a pool
 * while still meeting the target price for a Limit order.
 *
 * Binary search approach to find the largest input where the resulting
 * price still meets the limit.
 */
export function calculateMaxAbsorbableAmount(
  reserveIn: bigint,
  reserveOut: bigint,
  remainingBudget: bigint,
  feeNumerator: bigint,
  targetPriceNum: bigint,
  targetPriceDen: bigint,
): bigint {
  // Binary search: find largest input where price still meets target
  let lo = 0n;
  let hi = remainingBudget;
  let bestAmount = 0n;

  // Limit iterations for safety
  for (let i = 0; i < 128; i++) {
    if (lo > hi) break;
    const mid = (lo + hi) / 2n;
    if (mid === 0n) {
      lo = mid + 1n;
      continue;
    }

    const output = calculateSwapOutput(reserveIn, reserveOut, mid, feeNumerator);
    if (meetsLimitPrice(mid, output, targetPriceNum, targetPriceDen)) {
      bestAmount = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }

  return bestAmount;
}
