/**
 * Use Case: Deposit Liquidity
 */
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { PoolNotFoundError, InvalidSwapParamsError } from '../../domain/errors/index.js';

export interface DepositLiquidityInput {
  poolId: string;
  amountA: string;
  amountB: string;
  minLpTokens: string;
  senderAddress: string;
  changeAddress: string;
}

export interface DepositLiquidityOutput {
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  estimatedLpTokens: string;
}

export class DepositLiquidity {
  constructor(
    private readonly poolRepo: IPoolRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: DepositLiquidityInput): Promise<DepositLiquidityOutput> {
    const pool = await this.poolRepo.findById(input.poolId);
    if (!pool) {
      throw new PoolNotFoundError(input.poolId);
    }

    if (BigInt(input.amountA) <= 0n || BigInt(input.amountB) <= 0n) {
      throw new InvalidSwapParamsError('Deposit amounts must be positive');
    }

    // Estimate LP tokens
    let estimatedLp: bigint;
    if (pool.totalLpTokens === 0n) {
      estimatedLp = pool.calculateInitialLp(BigInt(input.amountA), BigInt(input.amountB));
    } else {
      estimatedLp = pool.calculateDepositLp(BigInt(input.amountA), BigInt(input.amountB));
    }

    if (estimatedLp < BigInt(input.minLpTokens)) {
      throw new InvalidSwapParamsError('Estimated LP tokens below minimum');
    }

    const txResult: BuildTxResult = await this.txBuilder.buildDepositTx({
      poolId: input.poolId,
      senderAddress: input.senderAddress,
      changeAddress: input.changeAddress,
      amountA: BigInt(input.amountA),
      amountB: BigInt(input.amountB),
      minLpTokens: BigInt(input.minLpTokens),
      lpToMint: estimatedLp,
    });

    // B3 fix: Optimistically update pool reserves in DB after building TX
    const newReserveA = pool.reserveA + BigInt(input.amountA);
    const newReserveB = pool.reserveB + BigInt(input.amountB);
    const newTotalLp = pool.totalLpTokens + estimatedLp;
    await this.poolRepo.updateReserves(
      pool.id,
      newReserveA,
      newReserveB,
      newTotalLp,
      txResult.txHash,
      pool.outputIndex, // Will be corrected by ChainSync
    );

    return {
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      estimatedLpTokens: estimatedLp.toString(),
    };
  }
}
