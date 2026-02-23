/**
 * NettingEngine — Intent/Escrow Aggregation for Batch Settlement
 *
 * Aggregates buy and sell intents (escrows) for the same pool, calculates
 * the NET swap amount that needs to go through the AMM, and determines
 * the best batch grouping.
 *
 * Benefits:
 * - Reduced AMM price impact (buy and sell partially cancel out)
 * - Fewer on-chain swaps == lower TX fees
 * - Better execution prices for users
 *
 * Example:
 *   User A: Buy 100 ADA → tBTC
 *   User B: Sell 80 ADA ← tBTC (equivalent to Buy tBTC → ADA)
 *   Net: Only 20 ADA needs to go through AMM (A→B direction)
 *   User B gets matched directly with User A's order.
 *
 * Architecture:
 * - SolverEngine calls NettingEngine.analyze() with a list of escrow UTxOs
 * - Returns BatchPlan with: netted pairs, residual AMM swap, expected outputs
 * - SolverEngine then builds a single batched TX using the plan
 */
import { getLogger } from '../config/logger.js';
import { calculateSwapOutput, FEE_DENOMINATOR } from './AmmMath.js';

const logger = getLogger().child({ service: 'netting-engine' });

// ============================================================================
// Types
// ============================================================================

export interface EscrowInfo {
  /** Escrow UTxO reference */
  txHash: string;
  outputIndex: number;
  /** Swap direction relative to pool: 'AToB' or 'BToA' */
  direction: 'AToB' | 'BToA';
  /** Amount of input remaining */
  remainingInput: bigint;
  /** Minimum output required (slippage protection) */
  minOutput: bigint;
  /** Original input amount (for pro-rata min_output scaling) */
  originalInput: bigint;
  /** Escrow owner address (bech32) */
  ownerAddress: string;
}

export interface PoolState {
  /** Active reserve A (after subtracting protocol fees) */
  activeA: bigint;
  /** Active reserve B */
  activeB: bigint;
  /** Fee numerator (basis points out of 10000) */
  feeNumerator: bigint;
}

export interface FillResult {
  escrow: EscrowInfo;
  /** Actual input consumed (may be < remainingInput for partial fill) */
  inputConsumed: bigint;
  /** Output to deliver to owner */
  outputDelivered: bigint;
  /** Whether this is a complete fill */
  isComplete: boolean;
}

export interface BatchPlan {
  /** Individual fill results for each escrow */
  fills: FillResult[];
  /** Net A→B flow through AMM (positive = sell A for B) */
  netAToB: bigint;
  /** Net B→A flow through AMM (positive = sell B for A) */
  netBToA: bigint;
  /** Approximate total output from AMM */
  ammOutput: bigint;
  /** How many escrows were fully filled */
  completeFills: number;
  /** How many were partially filled */
  partialFills: number;
}

// ============================================================================
// NettingEngine
// ============================================================================

export class NettingEngine {

  /**
   * Analyze a set of escrows against pool state and produce an optimal batch plan.
   *
   * Strategy:
   * 1. Separate escrows by direction (AToB vs BToA)
   * 2. Calculate gross flows in each direction
   * 3. Net them: only the residual needs AMM execution
   * 4. Allocate outputs proportionally
   */
  static analyze(escrows: EscrowInfo[], pool: PoolState): BatchPlan {
    if (escrows.length === 0) {
      return { fills: [], netAToB: 0n, netBToA: 0n, ammOutput: 0n, completeFills: 0, partialFills: 0 };
    }

    // Separate by direction
    const aToBEscrows = escrows.filter(e => e.direction === 'AToB');
    const bToAEscrows = escrows.filter(e => e.direction === 'BToA');

    // Gross flows
    const grossAToB = aToBEscrows.reduce((sum, e) => sum + e.remainingInput, 0n);
    const grossBToA = bToAEscrows.reduce((sum, e) => sum + e.remainingInput, 0n);

    logger.info(
      {
        aToBCount: aToBEscrows.length,
        bToACount: bToAEscrows.length,
        grossAToB: grossAToB.toString(),
        grossBToA: grossBToA.toString(),
      },
      'Netting analysis',
    );

    // If all intents go the same direction, no netting possible
    if (aToBEscrows.length === 0 || bToAEscrows.length === 0) {
      return this.singleDirectionPlan(escrows, pool);
    }

    // Cross-match: convert BToA's input (token B) to equivalent A using spot price
    // spot_price_BInA = activeA / activeB (how much A per 1 B)
    // equivalentA = grossBToA * activeA / activeB
    const equivalentAFromBToA = pool.activeB > 0n
      ? (grossBToA * pool.activeA) / pool.activeB
      : 0n;

    // Net flow:
    // If grossAToB > equivalentAFromBToA: net A→B, BToA fully absorbed
    // If equivalentAFromBToA > grossAToB: net B→A, AToB fully absorbed
    let netAToB = 0n;
    let netBToA = 0n;

    if (grossAToB > equivalentAFromBToA) {
      netAToB = grossAToB - equivalentAFromBToA;
    } else {
      // Convert back to B units
      const equivalentBFromAToB = pool.activeA > 0n
        ? (grossAToB * pool.activeB) / pool.activeA
        : 0n;
      netBToA = grossBToA - equivalentBFromAToB;
    }

    // Calculate AMM output for the net flow
    let ammOutput = 0n;
    if (netAToB > 0n) {
      ammOutput = calculateSwapOutput(pool.activeA, pool.activeB, netAToB, pool.feeNumerator);
    } else if (netBToA > 0n) {
      ammOutput = calculateSwapOutput(pool.activeB, pool.activeA, netBToA, pool.feeNumerator);
    }

    // Allocate outputs to each escrow proportionally
    const fills = this.allocateOutputs(
      aToBEscrows, bToAEscrows, pool, netAToB, netBToA, ammOutput,
    );

    const completeFills = fills.filter(f => f.isComplete).length;
    const partialFills = fills.filter(f => !f.isComplete).length;

    logger.info(
      {
        netAToB: netAToB.toString(),
        netBToA: netBToA.toString(),
        ammOutput: ammOutput.toString(),
        completeFills,
        partialFills,
        nettingRatio: grossAToB > 0n || grossBToA > 0n
          ? `${100 - Number((netAToB + netBToA) * 100n / (grossAToB + grossBToA + 1n))}%`
          : '0%',
      },
      'Netting plan computed',
    );

    return { fills, netAToB, netBToA, ammOutput, completeFills, partialFills };
  }

  /**
   * Simple single-direction plan (no netting possible).
   * Each escrow gets its output from the AMM sequentially.
   */
  private static singleDirectionPlan(escrows: EscrowInfo[], pool: PoolState): BatchPlan {
    const fills: FillResult[] = [];
    let currentActiveA = pool.activeA;
    let currentActiveB = pool.activeB;
    let totalNetAToB = 0n;
    let totalNetBToA = 0n;
    let totalAmmOutput = 0n;

    for (const escrow of escrows) {
      const reserveIn = escrow.direction === 'AToB' ? currentActiveA : currentActiveB;
      const reserveOut = escrow.direction === 'AToB' ? currentActiveB : currentActiveA;

      let inputConsumed = escrow.remainingInput;
      let output = calculateSwapOutput(reserveIn, reserveOut, inputConsumed, pool.feeNumerator);

      // Check if output would drain too much — cap at 50% of reserve
      if (output >= reserveOut) {
        const maxOutput = reserveOut / 2n;
        // Approximate: reduce input proportionally
        inputConsumed = (inputConsumed * maxOutput) / (output > 0n ? output : 1n);
        output = calculateSwapOutput(reserveIn, reserveOut, inputConsumed, pool.feeNumerator);
      }

      // Check min output (slippage)
      const minRequired = escrow.originalInput > 0n
        ? (escrow.minOutput * inputConsumed) / escrow.originalInput
        : escrow.minOutput;

      if (output < minRequired) {
        logger.warn(
          { txHash: escrow.txHash, output: output.toString(), minRequired: minRequired.toString() },
          'Escrow below min output — skipping in batch',
        );
        continue;
      }

      const isComplete = inputConsumed >= escrow.remainingInput;

      fills.push({ escrow, inputConsumed, outputDelivered: output, isComplete });

      // Update virtual pool state for next escrow
      if (escrow.direction === 'AToB') {
        currentActiveA += inputConsumed;
        currentActiveB -= output;
        totalNetAToB += inputConsumed;
      } else {
        currentActiveB += inputConsumed;
        currentActiveA -= output;
        totalNetBToA += inputConsumed;
      }
      totalAmmOutput += output;
    }

    return {
      fills,
      netAToB: totalNetAToB,
      netBToA: totalNetBToA,
      ammOutput: totalAmmOutput,
      completeFills: fills.filter(f => f.isComplete).length,
      partialFills: fills.filter(f => !f.isComplete).length,
    };
  }

  /**
   * Allocate AMM output + netted cross-match to individual escrows.
   * 
   * For the minority direction (fully netted): output = cross-rate from majority
   * For the majority direction (partially netted): AMM output for the residual
   */
  private static allocateOutputs(
    aToBEscrows: EscrowInfo[],
    bToAEscrows: EscrowInfo[],
    pool: PoolState,
    netAToB: bigint,
    _netBToA: bigint,
    ammOutput: bigint,
  ): FillResult[] {
    const fills: FillResult[] = [];

    if (netAToB > 0n) {
      // A→B is majority; B→A is fully netted (absorbed at spot price)
      // BToA escrows: output at spot price (no AMM slippage!)
      for (const escrow of bToAEscrows) {
        // B→A at spot: output_A = inputB * activeA / activeB
        const output = pool.activeB > 0n
          ? (escrow.remainingInput * pool.activeA) / pool.activeB
          : 0n;
        fills.push({
          escrow,
          inputConsumed: escrow.remainingInput,
          outputDelivered: output,
          isComplete: true,
        });
      }

      // AToB escrows: proportional share of AMM output
      const totalAToBInput = aToBEscrows.reduce((s, e) => s + e.remainingInput, 0n);
      for (const escrow of aToBEscrows) {
        // AMM output + spot-matched output proportional to input share
        const output = totalAToBInput > 0n
          ? (ammOutput * escrow.remainingInput) / totalAToBInput
          : 0n;
        fills.push({
          escrow,
          inputConsumed: escrow.remainingInput,
          outputDelivered: output,
          isComplete: true,
        });
      }
    } else {
      // B→A is majority (or equal); A→B is fully netted
      for (const escrow of aToBEscrows) {
        // A→B at spot: output_B = inputA * activeB / activeA
        const output = pool.activeA > 0n
          ? (escrow.remainingInput * pool.activeB) / pool.activeA
          : 0n;
        fills.push({
          escrow,
          inputConsumed: escrow.remainingInput,
          outputDelivered: output,
          isComplete: true,
        });
      }

      const totalBToAInput = bToAEscrows.reduce((s, e) => s + e.remainingInput, 0n);
      for (const escrow of bToAEscrows) {
        const output = totalBToAInput > 0n
          ? (ammOutput * escrow.remainingInput) / totalBToAInput
          : 0n;
        fills.push({
          escrow,
          inputConsumed: escrow.remainingInput,
          outputDelivered: output,
          isComplete: true,
        });
      }
    }

    return fills;
  }
}
