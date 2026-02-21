/**
 * Use Case: Create Pool
 */
import { v4 as uuid } from 'uuid';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { PoolAlreadyExistsError, InvalidSwapParamsError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';
import { Pool } from '../../domain/entities/Pool.js';
import { MIN_POOL_LIQUIDITY, MIN_FEE_NUMERATOR, MAX_FEE_NUMERATOR } from '../../shared/index.js';

/** Must match TxBuilder.MIN_SCRIPT_LOVELACE — the minimum ADA sent to script UTxOs */
const MIN_SCRIPT_LOVELACE = 2_000_000n;

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

    // Parse asset details for persistence
    const assetAPolicy = inputA.isAda ? '' : inputA.policyId;
    const assetAName = inputA.isAda ? '' : inputA.assetName;
    const assetBPolicy = inputB.isAda ? '' : inputB.policyId;
    const assetBName = inputB.isAda ? '' : inputB.assetName;

    // On-chain ADA reserves include MIN_SCRIPT_LOVELACE, so DB must match
    const onChainReserveA = inputA.isAda
      ? BigInt(input.initialAmountA) + MIN_SCRIPT_LOVELACE
      : BigInt(input.initialAmountA);
    const onChainReserveB = inputB.isAda
      ? BigInt(input.initialAmountB) + MIN_SCRIPT_LOVELACE
      : BigInt(input.initialAmountB);

    // Save pool record to database (pending state — TX not yet confirmed)
    const now = new Date();
    const pool = new Pool({
      id: poolId,
      poolNftPolicyId: txResult.poolMeta?.poolNftPolicyId ?? '',
      poolNftAssetName: txResult.poolMeta?.poolNftAssetName ?? '',
      assetAPolicyId: assetAPolicy,
      assetAAssetName: assetAName,
      assetADecimals: inputA.isAda ? 6 : 0,
      assetATicker: inputA.isAda ? 'ADA' : undefined,
      assetBPolicyId: assetBPolicy,
      assetBAssetName: assetBName,
      assetBDecimals: 0,
      assetBTicker: undefined,
      reserveA: onChainReserveA,
      reserveB: onChainReserveB,
      totalLpTokens: txResult.poolMeta?.initialLp ?? 0n,
      feeNumerator: input.feeNumerator,
      protocolFeeAccA: 0n,
      protocolFeeAccB: 0n,
      tvlAda: 0n,
      volume24h: 0n,
      fees24h: 0n,
      txHash: txResult.txHash,
      outputIndex: 0,
      state: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
    });
    await this.poolRepo.save(pool);

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
