/**
 * Use Case: Execute DCA/Limit Order (Domain layer wrapper)
 *
 * Gaps G3 / audit R-04, R-14: Provides a proper domain use-case instead of routes
 * calling TxBuilder directly. Adds:
 *   - Order existence + type/status validation
 *   - DCA interval ripeness check
 *   - Structured error types
 *   - Optimistic DB state update after TX build (consistent with other use-cases)
 *
 * NOTE: This use-case builds and returns the unsigned TX.
 * The caller (API client or OrderExecutorCron) must sign, submit, and await
 * on-chain confirmation. For automated execution the OrderExecutorCron provides
 * full confirmation-gated DB updates.
 */
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import {
  OrderNotFoundError,
  InvalidSwapParamsError,
} from '../../domain/errors/index.js';

export interface ExecuteOrderInput {
  /** DB order UUID */
  orderId: string;
  /** Pool UTxO reference to execute against */
  poolUtxoRef: { txHash: string; outputIndex: number };
  /** Solver / keeper address that will sign and submit the TX */
  solverAddress: string;
}

export interface ExecuteOrderOutput {
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  orderId: string;
  orderType: string;
  remainingBudget: string | null;
  executedIntervals: number | null;
}

export class ExecuteOrderUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: ExecuteOrderInput): Promise<ExecuteOrderOutput> {
    if (!input.orderId) throw new InvalidSwapParamsError('orderId is required');
    if (!input.solverAddress) throw new InvalidSwapParamsError('solverAddress is required');

    // Validate order
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new OrderNotFoundError(input.orderId);

    const props = order.toProps();

    // Must have an on-chain escrow UTxO
    if (!props.escrowTxHash || props.escrowOutputIndex === undefined) {
      throw new InvalidSwapParamsError(
        `Order ${input.orderId} has no on-chain escrow UTxO — cannot execute`,
      );
    }

    // Must be in an executable status
    const executable: string[] = ['ACTIVE', 'PARTIALLY_FILLED'];
    if (!executable.includes(props.status)) {
      throw new InvalidSwapParamsError(
        `Order ${input.orderId} is not executable — status: ${props.status}`,
      );
    }

    // For DCA orders, validate the interval is ripe
    if (props.type === 'DCA' && !order.isDcaIntervalRipe()) {
      throw new InvalidSwapParamsError(
        `DCA order ${input.orderId} interval has not elapsed yet`,
      );
    }

    // Build the execute-order TX
    const txResult: BuildTxResult = await this.txBuilder.buildExecuteOrderTx({
      solverAddress: input.solverAddress,
      orderUtxoRef: {
        txHash: props.escrowTxHash,
        outputIndex: props.escrowOutputIndex,
      },
      poolUtxoRef: input.poolUtxoRef,
    });

    // Optimistic DB status update: mark as PENDING so UI shows progress
    // Full remainingBudget/executedIntervals update happens after confirmation
    // (handled by OrderExecutorCron or a future POST /tx/confirm hook).
    if (props.status === 'ACTIVE') {
      await this.orderRepo.updateStatus(input.orderId, 'PENDING');
    }

    return {
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      orderId: input.orderId,
      orderType: props.type,
      remainingBudget: props.remainingBudget?.toString() ?? null,
      executedIntervals: props.executedIntervals ?? null,
    };
  }
}
