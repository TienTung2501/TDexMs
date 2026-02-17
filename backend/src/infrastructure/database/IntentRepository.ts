/**
 * Intent Repository — Prisma implementation
 */
import type { PrismaClient, Intent as PrismaIntent } from '@prisma/client';
import type { IntentStatus } from '@solvernet/shared';
import { Intent, type IntentProps } from '../../domain/entities/Intent.js';
import type {
  IIntentRepository,
  IntentFilters,
  IntentPage,
} from '../../domain/ports/IIntentRepository.js';

export class IntentRepository implements IIntentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(intent: Intent): Promise<void> {
    const props = intent.toProps();
    await this.prisma.intent.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        status: props.status as never,
        creator: props.creator,
        inputPolicyId: props.inputPolicyId,
        inputAssetName: props.inputAssetName,
        inputAmount: props.inputAmount.toString(),
        outputPolicyId: props.outputPolicyId,
        outputAssetName: props.outputAssetName,
        minOutput: props.minOutput.toString(),
        actualOutput: props.actualOutput?.toString() ?? null,
        deadline: BigInt(props.deadline),
        partialFill: props.partialFill,
        maxPartialFills: props.maxPartialFills,
        fillCount: props.fillCount,
        remainingInput: props.remainingInput.toString(),
        escrowTxHash: props.escrowTxHash ?? null,
        escrowOutputIdx: props.escrowOutputIndex ?? null,
        settlementTxHash: props.settlementTxHash ?? null,
        solverAddress: props.solverAddress ?? null,
        settledAt: props.settledAt ?? null,
      },
      update: {
        status: props.status as never,
        fillCount: props.fillCount,
        remainingInput: props.remainingInput.toString(),
        actualOutput: props.actualOutput?.toString() ?? null,
        escrowTxHash: props.escrowTxHash ?? null,
        escrowOutputIdx: props.escrowOutputIndex ?? null,
        settlementTxHash: props.settlementTxHash ?? null,
        solverAddress: props.solverAddress ?? null,
        settledAt: props.settledAt ?? null,
      },
    });
  }

  async findById(id: string): Promise<Intent | null> {
    const row = await this.prisma.intent.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByUtxoRef(txHash: string, outputIndex: number): Promise<Intent | null> {
    const row = await this.prisma.intent.findFirst({
      where: { escrowTxHash: txHash, escrowOutputIdx: outputIndex },
    });
    return row ? this.toDomain(row) : null;
  }

  async findMany(filters: IntentFilters): Promise<IntentPage> {
    const limit = filters.limit ?? 20;

    const where: Record<string, unknown> = {};
    if (filters.address) where.creator = filters.address;
    if (filters.status) where.status = filters.status;

    const [rows, total] = await Promise.all([
      this.prisma.intent.findMany({
        where,
        take: limit + 1,
        cursor: filters.cursor ? { id: filters.cursor } : undefined,
        skip: filters.cursor ? 1 : 0,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.intent.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => this.toDomain(r));
    const cursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, cursor, hasMore, total };
  }

  async findActiveIntents(): Promise<Intent[]> {
    const rows = await this.prisma.intent.findMany({
      where: { status: { in: ['ACTIVE', 'FILLING'] } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async countByStatus(status: IntentStatus): Promise<number> {
    return this.prisma.intent.count({ where: { status: status as never } });
  }

  async updateStatus(id: string, status: IntentStatus): Promise<void> {
    await this.prisma.intent.update({
      where: { id },
      data: { status: status as never },
    });
  }

  async markExpired(currentTimeMs: number): Promise<number> {
    const result = await this.prisma.intent.updateMany({
      where: {
        status: { in: ['ACTIVE', 'FILLING'] },
        deadline: { lte: BigInt(currentTimeMs) },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  private toDomain(row: PrismaIntent): Intent {
    return new Intent({
      id: row.id,
      status: row.status as IntentStatus,
      creator: row.creator,
      inputPolicyId: row.inputPolicyId,
      inputAssetName: row.inputAssetName,
      inputAmount: BigInt(row.inputAmount.toString()),
      outputPolicyId: row.outputPolicyId,
      outputAssetName: row.outputAssetName,
      minOutput: BigInt(row.minOutput.toString()),
      actualOutput: row.actualOutput ? BigInt(row.actualOutput.toString()) : undefined,
      deadline: Number(row.deadline),
      partialFill: row.partialFill,
      maxPartialFills: row.maxPartialFills,
      fillCount: row.fillCount,
      remainingInput: BigInt(row.remainingInput.toString()),
      escrowTxHash: row.escrowTxHash ?? undefined,
      escrowOutputIndex: row.escrowOutputIdx ?? undefined,
      settlementTxHash: row.settlementTxHash ?? undefined,
      solverAddress: row.solverAddress ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settledAt: row.settledAt ?? undefined,
    });
  }
}
