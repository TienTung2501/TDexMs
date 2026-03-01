/**
 * Use Case: Deposit Liquidity
 */
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import type { WsServer } from '../../interface/ws/WsServer.js';
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
  /** Fields forwarded to POST /tx/confirm for deferred DB update (prevents reserve corruption on TX failure) */
  poolId: string;
  newReserveA: string;
  newReserveB: string;
  newTotalLp: string;
}

export class DepositLiquidity {
  constructor(
    private readonly poolRepo: IPoolRepository,
    private readonly txBuilder: ITxBuilder,
    private readonly wsServer?: WsServer,
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

    // B3 fix (revised): Compute new reserves now, but defer the actual DB update to
    // POST /tx/confirm so reserves are ONLY updated when the TX is confirmed on-chain.
    // Previously updating here caused reserve inflation if the user rejected wallet signing.
    const newReserveA = pool.reserveA + BigInt(input.amountA);
    const newReserveB = pool.reserveB + BigInt(input.amountB);
    const newTotalLp = pool.totalLpTokens + estimatedLp;

    return {
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      estimatedLpTokens: estimatedLp.toString(),
      poolId: input.poolId,
      newReserveA: newReserveA.toString(),
      newReserveB: newReserveB.toString(),
      newTotalLp: newTotalLp.toString(),
    };
  }
}
