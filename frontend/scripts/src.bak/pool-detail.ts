/**
 * CLI: Get pool detail + history
 * Usage: npx tsx src/pool-detail.ts --id=<poolId> [--days=30]
 *
 * Tests:
 *   GET /pools/:poolId — Pool detail
 *   GET /pools/:poolId/history — Pool TVL/volume/price history
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const poolId = args.id;

  if (!poolId) {
    // Try to get first pool from list
    console.log('No --id provided, fetching first pool from list...');
    const pools = await apiFetch<any>('/pools?limit=1');
    const first = pools.data?.[0];
    if (!first) {
      console.error('No pools found. Create a pool first.');
      process.exit(1);
    }
    console.log(`Using pool: ${first.poolId}`);
    return run(first.poolId, args.days || '30');
  }

  return run(poolId, args.days || '30');
}

async function run(poolId: string, days: string) {
  // ── Pool Detail ──
  console.log('── Pool Detail ──');
  try {
    const pool = await apiFetch<any>(`/pools/${poolId}`);
    log('Pool', {
      poolId: pool.poolId,
      assetA: `${pool.assetA?.policyId?.slice(0, 12)}..${pool.assetA?.assetName}`,
      assetB: `${pool.assetB?.policyId?.slice(0, 12)}..${pool.assetB?.assetName}`,
      reserveA: pool.reserveA,
      reserveB: pool.reserveB,
      totalLpTokens: pool.totalLpTokens,
      fee: `${pool.feeNumerator}/${pool.feeDenominator}`,
      state: pool.state,
      tvlAda: pool.tvlAda,
      volume24h: pool.volume24h,
      fees24h: pool.fees24h,
      apy: `${pool.apy?.toFixed(2)}%`,
      createdAt: pool.createdAt,
    });
  } catch (err: any) {
    console.error('  Detail: ❌', err.message);
  }

  // ── Pool History ──
  console.log(`\n── Pool History (${days}d) ──`);
  try {
    const hist = await apiFetch<any>(`/pools/${poolId}/history`, {
      params: { period: `${days}d`, interval: '1d' },
    });
    const points = hist.history ?? [];
    console.log(`  ${points.length} data points`);
    // Show first 3 and last 3
    const show = [...points.slice(0, 3), ...(points.length > 6 ? [{ timestamp: '...' }] : []), ...points.slice(-3)];
    for (const p of show) {
      if (p.timestamp === '...') {
        console.log('  ...');
        continue;
      }
      console.log(`  ${p.timestamp?.slice(0, 10)} | TVL: ${p.tvlAda} | Vol: ${p.volume} | Fee: ${p.feeRevenue} | Price: ${p.price?.toFixed(4)}`);
    }
  } catch (err: any) {
    console.error('  History: ❌', err.message);
  }
}

main().catch(console.error);
