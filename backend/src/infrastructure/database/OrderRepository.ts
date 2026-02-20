/**
 * Order Repository — Prisma implementation
 */
import type { PrismaClient, Order as PrismaOrder } from '@prisma/client';
import type { OrderType, OrderStatus } from '../../shared/index.js';
import { Order, type OrderProps } from '../../domain/entities/Order.js';
import type {
  IOrderRepository,
  OrderFilters,
  OrderPage,
} from '../../domain/ports/IOrderRepository.js';

export class OrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(order: Order): Promise<void> {
    const props = order.toProps();
    await this.prisma.order.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        type: props.type as never,
        creator: props.creator,
        inputPolicyId: props.inputPolicyId,
        inputAssetName: props.inputAssetName,
        outputPolicyId: props.outputPolicyId,
        outputAssetName: props.outputAssetName,
        inputAmount: props.inputAmount?.toString() ?? null,
        priceNumerator: props.priceNumerator?.toString() ?? null,
        priceDenominator: props.priceDenominator?.toString() ?? null,
        totalBudget: props.totalBudget?.toString() ?? null,
        amountPerInterval: props.amountPerInterval?.toString() ?? null,
        intervalSlots: props.intervalSlots ?? null,
        remainingBudget: props.remainingBudget?.toString() ?? null,
        executedIntervals: props.executedIntervals ?? 0,
        deadline: BigInt(props.deadline),
        status: props.status as never,
        escrowTxHash: props.escrowTxHash ?? null,
        escrowOutputIdx: props.escrowOutputIndex ?? null,
      },
      update: {
        status: props.status as never,
        remainingBudget: props.remainingBudget?.toString() ?? null,
        executedIntervals: props.executedIntervals ?? 0,
        escrowTxHash: props.escrowTxHash ?? null,
        escrowOutputIdx: props.escrowOutputIndex ?? null,
      },
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findMany(filters: OrderFilters): Promise<OrderPage> {
    const where: Record<string, unknown> = {};
    if (filters.creator) where.creator = filters.creator;
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    const limit = filters.limit ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
      }),
      this.prisma.order.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => this.toDomain(r));
    const cursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, cursor, hasMore, total };
  }

  async findExecutableOrders(): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: { in: ['ACTIVE', 'PARTIALLY_FILLED'] },
        deadline: { gt: BigInt(Date.now()) },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async countByStatus(status: OrderStatus): Promise<number> {
    return this.prisma.order.count({ where: { status } });
  }

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { status: status as never } });
  }

  async markExpired(currentTimeMs: number): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: {
        status: { in: ['ACTIVE', 'PARTIALLY_FILLED', 'CREATED', 'PENDING'] },
        deadline: { lte: BigInt(currentTimeMs) },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  private toDomain(row: PrismaOrder): Order {
    return new Order({
      id: row.id,
      type: row.type as OrderType,
      creator: row.creator,
      inputPolicyId: row.inputPolicyId,
      inputAssetName: row.inputAssetName,
      outputPolicyId: row.outputPolicyId,
      outputAssetName: row.outputAssetName,
      inputAmount: row.inputAmount ? BigInt(row.inputAmount.toString()) : undefined,
      priceNumerator: row.priceNumerator ? BigInt(row.priceNumerator.toString()) : undefined,
      priceDenominator: row.priceDenominator ? BigInt(row.priceDenominator.toString()) : undefined,
      totalBudget: row.totalBudget ? BigInt(row.totalBudget.toString()) : undefined,
      amountPerInterval: row.amountPerInterval ? BigInt(row.amountPerInterval.toString()) : undefined,
      intervalSlots: row.intervalSlots ?? undefined,
      remainingBudget: row.remainingBudget ? BigInt(row.remainingBudget.toString()) : undefined,
      executedIntervals: row.executedIntervals ?? 0,
      deadline: Number(row.deadline),
      status: row.status as OrderStatus,
      escrowTxHash: row.escrowTxHash ?? undefined,
      escrowOutputIndex: row.escrowOutputIdx ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
