/**
 * Use Case: Create Order (Limit / DCA / StopLoss)
 * Builds an unsigned TX that locks user funds into the order validator.
 */
import { v4 as uuid } from 'uuid';
import { Order } from '../../domain/entities/Order.js';
import type { IOrderRepository } from '../../domain/ports/IOrderRepository.js';
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { InvalidSwapParamsError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';
import { MAX_DEADLINE_MS } from '../../shared/index.js';
import type { OrderType } from '../../shared/index.js';

export interface CreateOrderInput {
  type: OrderType;
  senderAddress: string;
  inputAsset: string;
  outputAsset: string;
  inputAmount: string;
  priceNumerator: string;
  priceDenominator: string;
  totalBudget?: string;
  amountPerInterval?: string;
  intervalSlots?: number;
  deadline: number;
  changeAddress: string;
}

export interface CreateOrderOutput {
  orderId: string;
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  status: string;
}

export class CreateOrder {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly txBuilder: ITxBuilder,
  ) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderOutput> {
    this.validate(input);

    const inputAsset = AssetId.fromString(input.inputAsset);
    const outputAsset = AssetId.fromString(input.outputAsset);

    // Build unsigned TX
    const txResult: BuildTxResult = await this.txBuilder.buildOrderTx({
      senderAddress: input.senderAddress,
      changeAddress: input.changeAddress,
      orderType: input.type,
      inputAssetId: input.inputAsset,
      outputAssetId: input.outputAsset,
      inputAmount: BigInt(input.inputAmount),
      priceNumerator: BigInt(input.priceNumerator),
      priceDenominator: BigInt(input.priceDenominator),
      totalBudget: input.totalBudget ? BigInt(input.totalBudget) : undefined,
      amountPerInterval: input.amountPerInterval ? BigInt(input.amountPerInterval) : undefined,
      intervalSlots: input.intervalSlots,
      deadline: input.deadline,
    });

    // Persist the order with on-chain reference
    const orderId = `ord_${uuid().replace(/-/g, '').slice(0, 12)}`;
    const order = new Order({
      id: orderId,
      type: input.type,
      creator: input.senderAddress,
      inputPolicyId: inputAsset.policyId,
      inputAssetName: inputAsset.assetName,
      outputPolicyId: outputAsset.policyId,
      outputAssetName: outputAsset.assetName,
      inputAmount: BigInt(input.inputAmount),
      priceNumerator: BigInt(input.priceNumerator),
      priceDenominator: BigInt(input.priceDenominator),
      totalBudget: input.totalBudget ? BigInt(input.totalBudget) : undefined,
      amountPerInterval: input.amountPerInterval ? BigInt(input.amountPerInterval) : undefined,
      intervalSlots: input.intervalSlots,
      remainingBudget: input.totalBudget ? BigInt(input.totalBudget) : BigInt(input.inputAmount),
      executedIntervals: 0,
      deadline: input.deadline,
      status: 'CREATED',
      escrowTxHash: txResult.txHash,
      escrowOutputIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.orderRepo.save(order);

    return {
      orderId,
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      status: 'CREATED',
    };
  }

  private validate(input: CreateOrderInput): void {
    if (input.inputAsset === input.outputAsset) {
      throw new InvalidSwapParamsError('Input and output assets must be different');
    }
    if (BigInt(input.inputAmount) <= 0n) {
      throw new InvalidSwapParamsError('Input amount must be positive');
    }
    if (BigInt(input.priceNumerator) <= 0n || BigInt(input.priceDenominator) <= 0n) {
      throw new InvalidSwapParamsError('Price numerator and denominator must be positive');
    }
    if (input.deadline <= Date.now()) {
      throw new InvalidSwapParamsError('Deadline must be in the future');
    }
    if (input.deadline > Date.now() + MAX_DEADLINE_MS) {
      throw new InvalidSwapParamsError('Deadline too far in the future (max 7 days)');
    }
    if (input.type === 'DCA') {
      if (!input.totalBudget || BigInt(input.totalBudget) <= 0n) {
        throw new InvalidSwapParamsError('DCA orders require a positive totalBudget');
      }
      if (!input.amountPerInterval || BigInt(input.amountPerInterval) <= 0n) {
        throw new InvalidSwapParamsError('DCA orders require a positive amountPerInterval');
      }
      if (!input.intervalSlots || input.intervalSlots <= 0) {
        throw new InvalidSwapParamsError('DCA orders require a positive intervalSlots');
      }
    }
  }
}
