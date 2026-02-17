/**
 * Use Case: Cancel Intent
 */
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { ITxBuilder } from '../../domain/ports/ITxBuilder.js';
import { IntentNotFoundError } from '../../domain/errors/index.js';

export interface CancelIntentInput {
  intentId: string;
  senderAddress: string;
}

export interface CancelIntentOutput {
  intentId: string;
  unsignedTx: string;
  status: string;
}

export class CancelIntent {
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: CancelIntentInput): Promise<CancelIntentOutput> {
    const intent = await this.intentRepo.findById(input.intentId);
    if (!intent) {
      throw new IntentNotFoundError(input.intentId);
    }

    if (!intent.canBeCancelled()) {
      throw new IntentNotFoundError(input.intentId); // Status doesn't allow cancel
    }

    const txResult = await this.txBuilder.buildCancelIntentTx({
      intentId: input.intentId,
      senderAddress: input.senderAddress,
    });

    intent.markCancelled();
    await this.intentRepo.save(intent);

    return {
      intentId: input.intentId,
      unsignedTx: txResult.unsignedTx,
      status: 'CANCELLING',
    };
  }
}
