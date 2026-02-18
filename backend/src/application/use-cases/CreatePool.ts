/**
 * Use Case: Create Pool
 */
import { v4 as uuid } from 'uuid';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { PoolAlreadyExistsError, InvalidSwapParamsError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';
import { MIN_POOL_LIQUIDITY, MIN_FEE_NUMERATOR, MAX_FEE_NUMERATOR } from '../../shared/index.js';

export interface CreatePoolInput {
  assetA: string;
  assetB: string;
  initialAmountA: string;
  initialAmountB: string;
  feeNumerator: number;
  creatorAddress: string;
  changeAddress: string;
}

export interface CreatePoolOutput {
  poolId: string;
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
}

export class CreatePool {
  constructor(
    private readonly poolRepo: IPoolRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: CreatePoolInput): Promise<CreatePoolOutput> {
    this.validate(input);

    const inputA = AssetId.fromString(input.assetA);
    const inputB = AssetId.fromString(input.assetB);

    // Check pair doesn't already exist
    const existing = await this.poolRepo.findByPair(inputA.id, inputB.id);
    if (existing) {
      throw new PoolAlreadyExistsError(input.assetA, input.assetB);
    }

    // Build TX
    const txResult: BuildTxResult = await this.txBuilder.buildCreatePoolTx({
      creatorAddress: input.creatorAddress,
      changeAddress: input.changeAddress,
      assetAId: input.assetA,
      assetBId: input.assetB,
      initialAmountA: BigInt(input.initialAmountA),
      initialAmountB: BigInt(input.initialAmountB),
      feeNumerator: input.feeNumerator,
    });

    const poolId = `pool_${uuid().replace(/-/g, '').slice(0, 12)}`;

    return {
      poolId,
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
    };
  }

  private validate(input: CreatePoolInput): void {
    if (input.assetA === input.assetB) {
      throw new InvalidSwapParamsError('Assets must be different');
    }
    if (BigInt(input.initialAmountA) < BigInt(MIN_POOL_LIQUIDITY)) {
      throw new InvalidSwapParamsError(`Initial amount A must be at least ${MIN_POOL_LIQUIDITY}`);
    }
    if (BigInt(input.initialAmountB) < BigInt(MIN_POOL_LIQUIDITY)) {
      throw new InvalidSwapParamsError(`Initial amount B must be at least ${MIN_POOL_LIQUIDITY}`);
    }
    if (input.feeNumerator < MIN_FEE_NUMERATOR || input.feeNumerator > MAX_FEE_NUMERATOR) {
      throw new InvalidSwapParamsError(`Fee must be between ${MIN_FEE_NUMERATOR} and ${MAX_FEE_NUMERATOR} BPS`);
    }
  }
}
