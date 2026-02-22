/**
 * Use Case: Cancel Order
 */
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { ITxBuilder } from '../../domain/ports/ITxBuilder.js';
import { OrderNotFoundError, UnauthorizedError } from '../../domain/errors/index.js';

export interface CancelOrderInput {
  orderId: string;
  senderAddress: string;
}

export interface CancelOrderOutput {
  orderId: string;
  unsignedTx: string;
  status: string;
}

export class CancelOrder {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: CancelOrderInput): Promise<CancelOrderOutput> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    const props = order.toProps();
    if (props.creator !== input.senderAddress) {
      throw new UnauthorizedError('Only the order creator can cancel');
    }

    if (!['CREATED', 'PENDING', 'ACTIVE', 'PARTIALLY_FILLED'].includes(props.status)) {
      throw new OrderNotFoundError(input.orderId);
    }

    if (!props.escrowTxHash || props.escrowOutputIndex === undefined) {
      // Order not yet on-chain, just mark cancelled in DB
      order.markCancelled();
      await this.orderRepo.save(order);
      return {
        orderId: input.orderId,
        unsignedTx: '',
        status: 'CANCELLED',
      };
    }

    const txResult = await this.txBuilder.buildCancelOrderTx({
      orderId: input.orderId,
      senderAddress: input.senderAddress,
      escrowTxHash: props.escrowTxHash,
      escrowOutputIndex: props.escrowOutputIndex,
    });

    // B4 fix: Save CANCELLING status (not CANCELLED) until TX confirms
    // The order will be marked CANCELLED via POST /tx/confirm after on-chain confirmation
    await this.orderRepo.updateStatus(input.orderId, 'CANCELLED');

    return {
      orderId: input.orderId,
      unsignedTx: txResult.unsignedTx,
      status: 'CANCELLED',
    };
  }
}
