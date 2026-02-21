/**
 * CLI: Query chart/candle data for a pool
 * Usage:
 *   npx tsx src/chart.ts --poolId=<poolId> [--interval=4h] [--limit=20]
 *   npx tsx src/chart.ts --config     # Show TradingView config
 *   npx tsx src/chart.ts --intervals  # Show available intervals
 *
 * Tests endpoints:
 *   GET /chart/config
 *   GET /chart/symbols
 *   GET /chart/candles
 *   GET /chart/price/:poolId
 *   GET /chart/info/:poolId
 *   GET /chart/intervals
 *   GET /chart/history  (TradingView UDF format)
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();

  console.log('\n📊 SolverNet — Chart Data CLI');
  console.log('═'.repeat(50));

  // Config
  if (args.config === 'true') {
    console.log('\n── Chart Config (TradingView UDF) ──');
    const config = await apiFetch<any>('/chart/config');
    log('Config', config);
  }

  // Intervals
  if (args.intervals === 'true') {
    console.log('\n── Available Intervals ──');
    try {
      const intervals = await apiFetch<any>('/chart/intervals');
      log('Intervals', intervals);
    } catch (err: any) {
      console.error('  ❌', err.message);
    }
  }

  const poolId = args.poolId || args.pool;

  if (!poolId) {
    // Try to fetch first pool
    console.log('\nNo --poolId provided. Fetching first pool from list...');
    try {
      const pools = await apiFetch<any>('/pools?limit=1');
      const items = pools.data ?? pools.items ?? [];
      if (items.length > 0) {
        const pid = items[0].poolId;
        console.log(`Using pool: ${pid}`);
        return await showPoolChart(pid, args);
      }
    } catch { /* fall through */ }

    // Show config/intervals only
    if (args.config !== 'true' && args.intervals !== 'true') {
      console.log('\n── Chart Config ──');
      const config = await apiFetch<any>('/chart/config');
      log('Config', config);
      console.log('\nNo pools available for chart data. Create a pool first.');
    }
    return;
  }

  await showPoolChart(poolId, args);
}

async function showPoolChart(poolId: string, args: Record<string, string>) {
  const interval = args.interval || '4h';
  const limit = args.limit || '20';

  // Symbol info
  console.log('\n── Symbol Info ──');
  try {
    const symbol = await apiFetch<any>('/chart/symbols', {
      params: { symbol: poolId },
    });
    log('Symbol', { name: symbol.name, exchange: symbol.exchange, type: symbol.type });
  } catch (err: any) {
    console.error('  ❌', err.message);
  }

  // Latest price
  console.log('\n── Latest Price ──');
  try {
    const price = await apiFetch<any>(`/chart/price/${poolId}`);
    log('Price', price);
  } catch (err: any) {
    console.error('  ❌', err.message);
  }

  // Pool chart info (24h)
  console.log('\n── 24h Chart Info ──');
  try {
    const info = await apiFetch<any>(`/chart/info/${poolId}`);
    log('Info', info);
  } catch (err: any) {
    console.error('  ❌', err.message);
  }

  // Candles
  console.log(`\n── Candles (${interval}, limit=${limit}) ──`);
  try {
    const candles = await apiFetch<any>('/chart/candles', {
      params: { poolId, interval, limit },
    });
    console.log(`  ${candles.candles?.length ?? 0} candles returned`);
    for (const c of (candles.candles ?? []).slice(0, 5)) {
      console.log(`  ${new Date(c.timestamp * 1000).toISOString().slice(0, 16)} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`);
    }
    if ((candles.candles?.length ?? 0) > 5) {
      console.log(`  ... and ${candles.candles.length - 5} more`);
    }
  } catch (err: any) {
    console.error('  ❌', err.message);
  }

  // TradingView UDF history
  console.log('\n── TradingView UDF History ──');
  try {
    const now = Math.floor(Date.now() / 1000);
    const history = await apiFetch<any>('/chart/history', {
      params: {
        symbol: poolId,
        resolution: '240', // 4h in TradingView format
        from: String(now - 7 * 86400),
        to: String(now),
      },
    });
    const barCount = history.t?.length ?? 0;
    console.log(`  ${barCount} bars, status: ${history.s}`);
  } catch (err: any) {
    console.error('  ❌', err.message);
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
