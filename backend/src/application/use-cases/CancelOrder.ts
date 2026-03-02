/**
 * Use Case: Cancel Order
 */
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { ITxBuilder } from '../../domain/ports/ITxBuilder.js';
import { OrderNotFoundError, UnauthorizedError } from '../../domain/errors/index.js';
import { getEventBus } from '../../domain/events/index.js';

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
      getEventBus().emit('order.statusChanged', {
        orderId: input.orderId,
        oldStatus: props.status as any,
        newStatus: 'CANCELLED',
        creator: props.creator,
        timestamp: Date.now(),
      });
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

    // Note: Order is immediately marked CANCELLED when TX is built (unlike intents which use
    // CANCELLING → CANCELLED two-step). This is safe because canBeCancelled() already guards
    // the allowed states strictly. The subsequent confirmTx call is idempotent.
    await this.orderRepo.updateStatus(input.orderId, 'CANCELLED');
    getEventBus().emit('order.statusChanged', {
      orderId: input.orderId,
      oldStatus: props.status as any,
      newStatus: 'CANCELLED',
      creator: props.creator,
      timestamp: Date.now(),
    });

    return {
      orderId: input.orderId,
      unsignedTx: txResult.unsignedTx,
      status: 'CANCELLED',
    };
  }
}
