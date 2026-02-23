/**
 * CLI: Query all analytics endpoints
 * Usage: npx tsx src/analytics.ts [--asset=<assetId>]
 *
 * Tests:
 *   GET /analytics/overview — Protocol-wide stats
 *   GET /analytics/tokens/:assetId — Token-specific analytics
 *   GET /analytics/prices — All token prices
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();

  // ── Protocol Overview ──
  console.log('── Analytics Overview ──');
  try {
    const overview = await apiFetch<any>('/analytics/overview');
    log('Overview', {
      tvl: overview.tvl,
      volume24h: overview.volume24h,
      volume7d: overview.volume7d,
      fees24h: overview.fees24h,
      totalPools: overview.totalPools,
      totalIntents: overview.totalIntents,
      intentsFilled: overview.intentsFilled,
      fillRate: `${overview.fillRate?.toFixed(1)}%`,
      uniqueTraders: overview.uniqueTraders,
    });
  } catch (err: any) {
    console.error('  Overview: ❌', err.message);
  }

  // ── Token Prices ──
  console.log('\n── Token Prices ──');
  try {
    const pricesResp = await apiFetch<any>('/analytics/prices');
    const prices = pricesResp.prices ?? [];
    console.log(`  ${prices.length} tokens with prices`);
    for (const p of prices) {
      console.log(`  ${p.ticker}: ${p.priceAda} ADA ($${p.priceUsd?.toFixed(4)})`);
    }
  } catch (err: any) {
    console.error('  Prices: ❌', err.message);
  }

  // ── Token Analytics (optional) ──
  const assetId = args.asset;
  if (assetId) {
    console.log(`\n── Token Analytics: ${assetId} ──`);
    try {
      const token = await apiFetch<any>(`/analytics/tokens/${assetId}`);
      log('Token', {
        assetId: token.assetId,
        ticker: token.ticker,
        price: token.price,
        priceChange24h: token.priceChange24h,
        volume24h: token.volume24h,
        poolCount: token.poolCount,
        pools: token.pools?.length ?? 0,
      });
    } catch (err: any) {
      console.error('  Token: ❌', err.message);
    }
  } else {
    console.log('\n  (Pass --asset=<policyId> to query token-specific analytics)');
  }
}

main().catch(console.error);
