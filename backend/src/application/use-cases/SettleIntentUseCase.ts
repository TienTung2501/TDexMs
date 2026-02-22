/**
 * Use Case: Settle Intent (Domain layer wrapper for settlement TX)
 *
 * Gaps G1 / audit R-14: Provides a proper domain use-case instead of routes
 * calling TxBuilder directly. Adds:
 *   - Intent existence + status validation
 *   - Structured error types
 *   - Clear input/output contracts
 *
 * NOTE: This use-case builds and returns the unsigned TX only.
 * DB status updates (FILLING → FILLED) are handled by SolverEngine after
 * on-chain confirmation, per the CRITICAL RULE.
 */
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { IntentNotFoundError } from '../../domain/errors/index.js';

export interface SettleIntentInput {
  /** DB intent IDs (UUIDs) to settle in this batch */
  intentIds: string[];
  /** Pool UTxO reference to settle against */
  poolUtxoRef: { txHash: string; outputIndex: number };
  /** Solver (signer) address */
  solverAddress: string;
}

export interface SettleIntentOutput {
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  /** Number of intents included in this batch */
  intentCount: number;
}

export class SettleIntentUseCase {
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: SettleIntentInput): Promise<SettleIntentOutput> {
    if (!input.intentIds.length) {
      throw new Error('At least one intent ID is required');
    }
    if (!input.solverAddress) {
      throw new Error('solverAddress is required');
    }

    // Validate each intent: must exist and be in a settleable status
    const intents = await Promise.all(
      input.intentIds.map((id) => this.intentRepo.findById(id)),
    );

    const utxoRefs: Array<{ txHash: string; outputIndex: number }> = [];
    for (let i = 0; i < intents.length; i++) {
      const intent = intents[i]!;
      const id = input.intentIds[i]!;

      if (!intent) {
        throw new IntentNotFoundError(id);
      }

      const settleable: string[] = ['ACTIVE', 'FILLING'];
      if (!settleable.includes(intent.status)) {
        throw new Error(`Intent ${id} is in non-settleable status: ${intent.status}`);
      }

      if (!intent.escrowTxHash || intent.escrowOutputIndex === undefined) {
        throw new Error(`Intent ${id} has no on-chain escrow UTxO recorded`);
      }

      utxoRefs.push({
        txHash: intent.escrowTxHash,
        outputIndex: intent.escrowOutputIndex,
      });
    }

    // Build settlement TX
    const txResult: BuildTxResult = await this.txBuilder.buildSettlementTx({
      intentUtxoRefs: utxoRefs,
      poolUtxoRef: input.poolUtxoRef,
      solverAddress: input.solverAddress,
    });

    return {
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      intentCount: input.intentIds.length,
    };
  }
}
