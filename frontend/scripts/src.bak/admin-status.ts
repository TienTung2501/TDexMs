/**
 * CLI Admin: View protocol analytics and status overview
 * Usage: npx tsx src/admin-status.ts [--wallet=addr_test1...]
 *
 * Displays health, analytics, pools, intents, orders,
 * admin auth, dashboard metrics, pending fees, and current settings.
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const wallet = args.wallet || process.env.WALLET_ADDRESS || '';

  console.log('📊 Protocol Status Dashboard\n');

  // ── Health ──
  try {
    const health = await apiFetch<any>('/health');
    console.log(`  Health:      ${health.status === 'healthy' ? '✅ healthy' : '⚠️ ' + health.status}`);
    console.log(`  Uptime:      ${health.uptime ?? 'N/A'}s`);
    console.log(`  Database:    ${health.services?.database ?? 'N/A'}`);
    console.log(`  Blockfrost:  ${health.services?.blockfrost ?? 'N/A'}`);
    console.log(`  Cache:       ${health.services?.cache ?? 'N/A'}`);
  } catch (err: any) {
    console.log(`  Health:    ❌ Unreachable (${err.message})`);
    return;
  }

  console.log('');

  // ── Analytics Overview ──
  try {
    const a = await apiFetch<any>('/analytics/overview');
    log('Analytics Overview', {
      totalPools: a.totalPools,
      tvlAda: a.tvl,
      volume24h: a.volume24h,
      volume7d: a.volume7d,
      fees24h: a.fees24h,
      totalIntents: a.totalIntents,
      intentsFilled: a.intentsFilled,
      fillRate: `${a.fillRate?.toFixed(1)}%`,
      uniqueTraders: a.uniqueTraders ?? 0,
    });
  } catch (err: any) {
    console.log(`  Analytics: ❌ ${err.message}`);
  }

  // ── Pools (using correct { data, pagination } shape) ──
  try {
    const pools = await apiFetch<any>('/pools');
    const poolList = pools.data ?? [];
    console.log(`\n📦 Pools (${poolList.length} / total ${pools.pagination?.total ?? '?'}):`);
    for (const pool of poolList.slice(0, 10)) {
      const pairA = pool.assetA?.assetName || (pool.assetA?.policyId === '' ? 'ADA' : '?');
      const pairB = pool.assetB?.assetName || '?';
      const tvl = pool.tvlAda ? `₳${Number(pool.tvlAda).toLocaleString()}` : 'N/A';
      console.log(`  ${pool.poolId?.slice(0, 16)}... | ${pairA}/${pairB} | TVL: ${tvl} | Vol: ${pool.volume24h}`);
    }
    if (poolList.length > 10) console.log(`  ... and ${poolList.length - 10} more`);
  } catch (err: any) {
    console.log(`  Pools: ❌ ${err.message}`);
  }

  // ── Active Intents (uses { data, pagination } shape) ──
  try {
    const intents = await apiFetch<any>('/intents', { params: { status: 'ACTIVE' } });
    console.log(`\n🔄 Active Intents: ${intents.data?.length ?? 0} (total ${intents.pagination?.total ?? '?'})`);
  } catch (err: any) {
    console.log(`  Intents: ❌ ${err.message}`);
  }

  // ── Active Orders (uses { items, total } shape) ──
  try {
    const orders = await apiFetch<any>('/orders', { params: { status: 'ACTIVE' } });
    console.log(`  Active Orders: ${orders.items?.length ?? 0} (total ${orders.total ?? '?'})`);
  } catch (err: any) {
    console.log(`  Orders: ❌ ${err.message}`);
  }

  // ── Admin Auth Check ──
  if (wallet) {
    console.log('');
    try {
      const auth = await apiFetch<any>('/admin/auth/check', {
        params: { wallet_address: wallet },
      });
      console.log(`  Admin Auth:  is_admin=${auth.is_admin} | factory=${auth.roles?.is_factory_admin} | settings=${auth.roles?.is_settings_admin}`);
    } catch (err: any) {
      console.log(`  Admin Auth: ❌ ${err.message}`);
    }
  }

  // ── Dashboard Metrics ──
  try {
    const m = await apiFetch<any>('/admin/dashboard/metrics');
    log('Dashboard Metrics', {
      total_tvl_usd: m.total_tvl_usd,
      volume_24h_usd: m.volume_24h_usd,
      active_pools: m.active_pools,
      total_pending_fees_usd: m.total_pending_fees_usd,
      chart_entries: m.charts?.fee_growth_30d?.length ?? 0,
    });
  } catch (err: any) {
    console.log(`  Dashboard: ❌ ${err.message}`);
  }

  // ── Revenue: Pending Fees ──
  try {
    const fees = await apiFetch<any[]>('/admin/revenue/pending');
    console.log(`\n💰 Pending Fee Revenue (${fees.length} pools):`);
    for (const entry of fees.slice(0, 5)) {
      console.log(`  ${entry.pool_id?.slice(0, 16)}... | ${entry.pair} | fees: $${entry.pending_fees?.total_usd_value?.toFixed(2)}`);
    }
  } catch (err: any) {
    console.log(`  Revenue: ❌ ${err.message}`);
  }

  // ── Current Settings ──
  try {
    const settings = await apiFetch<any>('/admin/settings/current');
    log('Current Settings', {
      max_fee_bps: settings.global_settings?.max_protocol_fee_bps,
      min_pool_liquidity: settings.global_settings?.min_pool_liquidity,
      current_version: settings.global_settings?.current_version,
      admin_vkh: (settings.factory_settings?.admin_vkh || '').slice(0, 20) + '...',
    });
  } catch (err: any) {
    console.log(`  Settings: ❌ ${err.message}`);
  }

  console.log('\n✅ Status check complete.');
}

main().catch((err) => {
  console.error('\n❌ Status check failed:', err.message || err);
  process.exit(1);
});
