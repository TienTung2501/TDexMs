/**
 * CLI Admin: View protocol analytics and status overview
 * Usage: npx tsx src/admin-status.ts
 *
 * Displays:
 * - Protocol analytics (TVL, volume, fees, pools)
 * - Active intents count
 * - Pending orders count
 * - Health status
 */
import { apiFetch, log } from './shared.js';

async function main() {
  console.log('📊 Protocol Status Dashboard\n');

  // Health check
  try {
    const health = await apiFetch<any>('/health');
    console.log(`  Health:    ${health.status === 'ok' ? '✅ OK' : '⚠️ ' + health.status}`);
    console.log(`  Uptime:    ${health.uptime ?? 'N/A'}s`);
    console.log(`  DB:        ${health.database ?? 'N/A'}`);
    console.log(`  Chain:     ${health.chain ?? 'N/A'}`);
  } catch (err: any) {
    console.log(`  Health:    ❌ Unreachable (${err.message})`);
  }

  console.log('');

  // Analytics
  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    log('Analytics', {
      totalPools: analytics.totalPools,
      tvlAda: analytics.tvl,
      volume24h: analytics.volume24h,
      fees24h: analytics.fees24h,
      activeIntents: analytics.activeIntents ?? 'N/A',
      totalTxCount: analytics.totalTxCount ?? 'N/A',
    });
  } catch (err: any) {
    console.log(`  Analytics: ❌ ${err.message}`);
  }

  // Pools summary
  try {
    const pools = await apiFetch<any>('/pools');
    const poolList = pools.pools || pools;
    console.log(`\n📦 Pools (${Array.isArray(poolList) ? poolList.length : '?'}):`);
    if (Array.isArray(poolList)) {
      for (const pool of poolList.slice(0, 10)) {
        const pair = `${pool.assetA || '?'}/${pool.assetB || '?'}`;
        const tvl = pool.tvlAda ? `₳${Number(pool.tvlAda).toLocaleString()}` : 'N/A';
        console.log(`  ${pool.id?.slice(0, 12)}... | ${pair} | TVL: ${tvl}`);
      }
      if (poolList.length > 10) {
        console.log(`  ... and ${poolList.length - 10} more`);
      }
    }
  } catch (err: any) {
    console.log(`  Pools: ❌ ${err.message}`);
  }

  // Active intents
  try {
    const intents = await apiFetch<any>('/intents', { params: { status: 'PENDING' } });
    const items = intents.intents || intents;
    console.log(`\n🔄 Pending Intents: ${Array.isArray(items) ? items.length : 'N/A'}`);
  } catch (err: any) {
    console.log(`  Intents: ❌ ${err.message}`);
  }

  // Pending orders
  try {
    const orders = await apiFetch<any>('/orders', { params: { status: 'ACTIVE' } });
    const items = orders.orders || orders;
    console.log(`  Active Orders:    ${Array.isArray(items) ? items.length : 'N/A'}`);
  } catch (err: any) {
    console.log(`  Orders: ❌ ${err.message}`);
  }

  console.log('\n✅ Status check complete.');
}

main().catch((err) => {
  console.error('\n❌ Status check failed:', err.message || err);
  process.exit(1);
});
