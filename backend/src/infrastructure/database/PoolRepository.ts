/**
 * Pool Repository — Prisma implementation
 */
import type { PrismaClient, Pool as PrismaPool } from '@prisma/client';
import { Pool, type PoolProps } from '../../domain/entities/Pool.js';
import type {
  IPoolRepository,
  PoolFilters,
  PoolPage,
} from '../../domain/ports/IPoolRepository.js';

export class PoolRepository implements IPoolRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(pool: Pool): Promise<void> {
    const props = pool.toProps();
    await this.prisma.pool.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        poolNftPolicyId: props.poolNftPolicyId,
        poolNftAssetName: props.poolNftAssetName,
        assetAPolicyId: props.assetAPolicyId,
        assetAAssetName: props.assetAAssetName,
        assetADecimals: props.assetADecimals,
        assetATicker: props.assetATicker,
        assetBPolicyId: props.assetBPolicyId,
        assetBAssetName: props.assetBAssetName,
        assetBDecimals: props.assetBDecimals,
        assetBTicker: props.assetBTicker,
        reserveA: props.reserveA.toString(),
        reserveB: props.reserveB.toString(),
        totalLpTokens: props.totalLpTokens.toString(),
        feeNumerator: props.feeNumerator,
        protocolFeeAccA: props.protocolFeeAccA.toString(),
        protocolFeeAccB: props.protocolFeeAccB.toString(),
        tvlAda: props.tvlAda.toString(),
        volume24h: props.volume24h.toString(),
        fees24h: props.fees24h.toString(),
        txHash: props.txHash,
        outputIndex: props.outputIndex,
        state: props.state as never,
        lpPolicyId: props.lpPolicyId ?? null,
      },
      update: {
        reserveA: props.reserveA.toString(),
        reserveB: props.reserveB.toString(),
        totalLpTokens: props.totalLpTokens.toString(),
        protocolFeeAccA: props.protocolFeeAccA.toString(),
        protocolFeeAccB: props.protocolFeeAccB.toString(),
        tvlAda: props.tvlAda.toString(),
        volume24h: props.volume24h.toString(),
        fees24h: props.fees24h.toString(),
        txHash: props.txHash,
        outputIndex: props.outputIndex,
        state: props.state as never,
        lpPolicyId: props.lpPolicyId ?? null,
      },
    });
  }

  async findById(id: string): Promise<Pool | null> {
    const row = await this.prisma.pool.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByNft(policyId: string, assetName: string): Promise<Pool | null> {
    const row = await this.prisma.pool.findUnique({
      where: {
        poolNftPolicyId_poolNftAssetName: {
          poolNftPolicyId: policyId,
          poolNftAssetName: assetName,
        },
      },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByPair(assetAId: string, assetBId: string): Promise<Pool | null> {
    const [aParts, bParts] = [this.parseAssetId(assetAId), this.parseAssetId(assetBId)];

    // Check both orderings
    const row = await this.prisma.pool.findFirst({
      where: {
        OR: [
          {
            assetAPolicyId: aParts.policyId,
            assetAAssetName: aParts.assetName,
            assetBPolicyId: bParts.policyId,
            assetBAssetName: bParts.assetName,
          },
          {
            assetAPolicyId: bParts.policyId,
            assetAAssetName: bParts.assetName,
            assetBPolicyId: aParts.policyId,
            assetBAssetName: aParts.assetName,
          },
        ],
      },
    });
    return row ? this.toDomain(row) : null;
  }

  async findMany(filters: PoolFilters): Promise<PoolPage> {
    const limit = filters.limit ?? 20;
    const sortBy = filters.sortBy ?? 'tvlAda';
    const order = filters.order ?? 'desc';

    const where: Record<string, unknown> = {};
    if (filters.state) where.state = filters.state;
    if (filters.search) {
      where.OR = [
        { assetATicker: { contains: filters.search, mode: 'insensitive' } },
        { assetBTicker: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const orderByMap: Record<string, string> = {
      tvl: 'tvlAda',
      volume24h: 'volume24h',
      apy: 'fees24h', // approximate sort by fees (APY needs computation)
      createdAt: 'createdAt',
    };

    const [rows, total] = await Promise.all([
      this.prisma.pool.findMany({
        where,
        take: limit + 1,
        cursor: filters.cursor ? { id: filters.cursor } : undefined,
        skip: filters.cursor ? 1 : 0,
        orderBy: { [orderByMap[sortBy] ?? 'tvlAda']: order },
      }),
      this.prisma.pool.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => this.toDomain(r));
    const cursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, cursor, hasMore, total };
  }

  async findAllActive(): Promise<Pool[]> {
    const rows = await this.prisma.pool.findMany({
      where: { state: 'ACTIVE' },
      orderBy: { tvlAda: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async updateReserves(
    id: string,
    reserveA: bigint,
    reserveB: bigint,
    totalLpTokens: bigint,
    txHash: string,
    outputIndex: number,
  ): Promise<void> {
    await this.prisma.pool.update({
      where: { id },
      data: {
        reserveA: reserveA.toString(),
        reserveB: reserveB.toString(),
        totalLpTokens: totalLpTokens.toString(),
        txHash,
        outputIndex,
      },
    });
  }

  async updateStats(id: string, volume24h: bigint, fees24h: bigint, tvlAda: bigint): Promise<void> {
    await this.prisma.pool.update({
      where: { id },
      data: {
        volume24h: volume24h.toString(),
        fees24h: fees24h.toString(),
        tvlAda: tvlAda.toString(),
      },
    });
  }

  async updateState(id: string, state: string): Promise<void> {
    await this.prisma.pool.update({
      where: { id },
      data: { state: state as never },
    });
  }

  async insertHistory(params: {
    poolId: string;
    reserveA: bigint;
    reserveB: bigint;
    tvlAda: bigint;
    volume: bigint;
    fees: bigint;
    price: number;
  }): Promise<void> {
    await this.prisma.poolHistory.create({
      data: {
        poolId: params.poolId,
        reserveA: params.reserveA.toString(),
        reserveB: params.reserveB.toString(),
        tvlAda: params.tvlAda.toString(),
        volume: params.volume.toString(),
        fees: params.fees.toString(),
        price: params.price,
      },
    });
  }

  private toDomain(row: PrismaPool): Pool {
    return new Pool({
      id: row.id,
      poolNftPolicyId: row.poolNftPolicyId,
      poolNftAssetName: row.poolNftAssetName,
      assetAPolicyId: row.assetAPolicyId,
      assetAAssetName: row.assetAAssetName,
      assetADecimals: row.assetADecimals,
      assetATicker: row.assetATicker ?? undefined,
      assetBPolicyId: row.assetBPolicyId,
      assetBAssetName: row.assetBAssetName,
      assetBDecimals: row.assetBDecimals,
      assetBTicker: row.assetBTicker ?? undefined,
      reserveA: BigInt(row.reserveA.toString()),
      reserveB: BigInt(row.reserveB.toString()),
      totalLpTokens: BigInt(row.totalLpTokens.toString()),
      feeNumerator: row.feeNumerator,
      protocolFeeAccA: BigInt(row.protocolFeeAccA.toString()),
      protocolFeeAccB: BigInt(row.protocolFeeAccB.toString()),
      tvlAda: BigInt(row.tvlAda.toString()),
      volume24h: BigInt(row.volume24h.toString()),
      fees24h: BigInt(row.fees24h.toString()),
      txHash: row.txHash,
      outputIndex: row.outputIndex,
      lpPolicyId: (row as unknown as { lpPolicyId?: string | null }).lpPolicyId ?? undefined,
      state: row.state as PoolProps['state'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private parseAssetId(id: string): { policyId: string; assetName: string } {
    if (id === 'lovelace') return { policyId: '', assetName: '' };
    const parts = id.split('.');
    return { policyId: parts[0] ?? '', assetName: parts[1] ?? '' };
  }
}
