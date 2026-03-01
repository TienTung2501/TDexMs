/**
 * Use Case: Withdraw Liquidity
 */
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import type { WsServer } from '../../interface/ws/WsServer.js';
import { PoolNotFoundError, InvalidSwapParamsError } from '../../domain/errors/index.js';

export interface WithdrawLiquidityInput {
  poolId: string;
  lpTokenAmount: string;
  minAmountA: string;
  minAmountB: string;
  senderAddress: string;
  changeAddress: string;
}

export interface WithdrawLiquidityOutput {
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  estimatedAmountA: string;
  estimatedAmountB: string;
  /** Fields forwarded to POST /tx/confirm for deferred DB update */
  poolId: string;
  newReserveA: string;
  newReserveB: string;
  newTotalLp: string;
}

export class WithdrawLiquidity {
  constructor(
    private readonly poolRepo: IPoolRepository,
    private readonly txBuilder: ITxBuilder,
    private readonly wsServer?: WsServer,
  ) {}

  async execute(input: WithdrawLiquidityInput): Promise<WithdrawLiquidityOutput> {
    const pool = await this.poolRepo.findById(input.poolId);
    if (!pool) {
      throw new PoolNotFoundError(input.poolId);
    }

    const lpAmount = BigInt(input.lpTokenAmount);
    if (lpAmount <= 0n || lpAmount > pool.totalLpTokens) {
      throw new InvalidSwapParamsError('Invalid LP token amount');
    }

    const { amountA, amountB } = pool.calculateWithdrawal(lpAmount);

    if (amountA < BigInt(input.minAmountA) || amountB < BigInt(input.minAmountB)) {
      throw new InvalidSwapParamsError('Withdrawal below minimums');
    }

    const txResult: BuildTxResult = await this.txBuilder.buildWithdrawTx({
      poolId: input.poolId,
      senderAddress: input.senderAddress,
      changeAddress: input.changeAddress,
      lpTokenAmount: lpAmount,
      minAmountA: BigInt(input.minAmountA),
      minAmountB: BigInt(input.minAmountB),
    });

    // B3 fix (revised): Compute new reserves now, defer DB update to POST /tx/confirm.
    // Previously updating here caused reserve deflation if the user rejected wallet signing.
    const newReserveA = pool.reserveA - amountA;
    const newReserveB = pool.reserveB - amountB;
    const newTotalLp = pool.totalLpTokens - lpAmount;

    return {
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      estimatedAmountA: amountA.toString(),
      estimatedAmountB: amountB.toString(),
      poolId: input.poolId,
      newReserveA: newReserveA.toString(),
      newReserveB: newReserveB.toString(),
      newTotalLp: newTotalLp.toString(),
    };
    };
  }

