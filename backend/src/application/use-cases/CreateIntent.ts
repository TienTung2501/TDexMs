/**
 * Use Case: Create Intent
 * Builds an unsigned TX that locks user funds into escrow.
 */
import { v4 as uuid } from 'uuid';
import { Intent } from '../../domain/entities/Intent.js';
import type { IIntentRepository } from '../../domain/ports/IIntentRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { InvalidSwapParamsError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';
import { MAX_DEADLINE_MS } from '../../shared/index.js';

export interface CreateIntentInput {
  quoteId?: string;
  senderAddress: string;
  inputAsset: string;
  inputAmount: string;
  outputAsset: string;
  minOutput: string;
  deadline: number;
  partialFill: boolean;
  changeAddress: string;
}

export interface CreateIntentOutput {
  intentId: string;
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  status: string;
}

export class CreateIntent {
  constructor(
    private readonly intentRepo: IIntentRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: CreateIntentInput): Promise<CreateIntentOutput> {
    // Validate
    this.validate(input);

    const inputAsset = AssetId.fromString(input.inputAsset);
    const outputAsset = AssetId.fromString(input.outputAsset);

    // Build unsigned TX
    const txResult: BuildTxResult = await this.txBuilder.buildCreateIntentTx({
      senderAddress: input.senderAddress,
      changeAddress: input.changeAddress,
      inputAssetId: input.inputAsset,
      inputAmount: BigInt(input.inputAmount),
      outputAssetId: input.outputAsset,
      minOutput: BigInt(input.minOutput),
      deadline: input.deadline,
      partialFill: input.partialFill,
    });

    // Create domain entity
    const intentId = `int_${uuid().replace(/-/g, '').slice(0, 12)}`;
    const intent = new Intent({
      id: intentId,
      status: 'CREATED',
      creator: input.senderAddress,
      inputPolicyId: inputAsset.policyId,
      inputAssetName: inputAsset.assetName,
      inputAmount: BigInt(input.inputAmount),
      outputPolicyId: outputAsset.policyId,
      outputAssetName: outputAsset.assetName,
      minOutput: BigInt(input.minOutput),
      deadline: input.deadline,
      partialFill: input.partialFill,
      maxPartialFills: input.partialFill ? 5 : 1,
      fillCount: 0,
      remainingInput: BigInt(input.inputAmount),
      escrowTxHash: txResult.txHash,
      escrowOutputIndex: 0,  // Escrow output is always the first output in the TX
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Persist
    await this.intentRepo.save(intent);

    return {
      intentId,
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      status: 'CREATED',
    };
  }

  private validate(input: CreateIntentInput): void {
    if (input.inputAsset === input.outputAsset) {
      throw new InvalidSwapParamsError('Input and output assets must be different');
    }
    if (BigInt(input.inputAmount) <= 0n) {
      throw new InvalidSwapParamsError('Input amount must be positive');
    }
    if (BigInt(input.minOutput) <= 0n) {
      throw new InvalidSwapParamsError('Minimum output must be positive');
    }
    if (input.deadline <= Date.now()) {
      throw new InvalidSwapParamsError('Deadline must be in the future');
    }
    if (input.deadline > Date.now() + MAX_DEADLINE_MS) {
      throw new InvalidSwapParamsError('Deadline too far in the future (max 7 days)');
    }
  }
}
