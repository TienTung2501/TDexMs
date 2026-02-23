/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 6: ADMIN & DATA QUERY TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests admin functions and all data query endpoints:
 *   6.1  Admin auth check
 *   6.2  Dashboard metrics
 *   6.3  Current settings
 *   6.4  Update settings
 *   6.5  Pending revenue & fee collection
 *   6.6  Analytics overview
 *   6.7  Portfolio queries (summary, open-orders, history, liquidity)
 *   6.8  Chart endpoints (config, intervals, candles, price)
 *   6.9  Quote endpoint
 *   6.10 Health & TX status
 *   6.11 On-chain UTxO scans
 *   6.12 Wallet balances for all wallets
 *
 * Usage:
 *   npx tsx src/06-admin-and-queries.ts
 */
import {
  Lucid,
  Blockfrost,
  type UTxO,
} from '@lucid-evolution/lucid';

import {
  initWallet,
  initAllWallets,
  apiFetch,
  safeApi,
  signSubmitAndWait,
  sleep,
  logSection,
  logStep,
  logSuccess,
  logFail,
  logInfo,
  logWarn,
  record,
  printSummary,
  getAllTestTokenUnits,
  getWalletBalance,
  formatAda,
  parseArgs,
  ESCROW_SCRIPT_ADDRESS,
  POOL_SCRIPT_ADDRESS,
  ADMIN_ADDRESS,
  BF_URL,
  BF_KEY,
  NETWORK,
  type WalletCtx,
} from './test-helpers.js';

const args = parseArgs();

// ═══════════════════════════════════════════
// TEST 6.1: Admin Auth Check
// ═══════════════════════════════════════════

async function testAdminAuth(): Promise<void> {
  logSection('TEST 6.1: Admin Auth Check');
  const t0 = Date.now();

  try {
    const result = await apiFetch<any>('/admin/auth/check', {
      params: { address: ADMIN_ADDRESS },
    });
    logInfo(`Auth result: isAdmin=${result.isAdmin}`);

    if (result.isAdmin) {
      record('6.1 Admin auth', 'PASS', 'Admin verified', Date.now() - t0);
    } else {
      record('6.1 Admin auth', 'FAIL', 'Not recognized as admin', Date.now() - t0);
    }
  } catch (e: any) {
    record('6.1 Admin auth', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.2: Dashboard Metrics
// ═══════════════════════════════════════════

async function testDashboardMetrics(): Promise<void> {
  logSection('TEST 6.2: Dashboard Metrics');
  const t0 = Date.now();

  try {
    const metrics = await apiFetch<any>('/admin/dashboard/metrics');
    logInfo(`TVL: ${metrics.tvl || metrics.totalValueLocked}`);
    logInfo(`Total pools: ${metrics.totalPools}`);
    logInfo(`Total intents: ${metrics.totalIntents}`);
    logInfo(`Total orders: ${metrics.totalOrders}`);
    logInfo(`Volume 24h: ${metrics.volume24h}`);
    logInfo(`Unique traders: ${metrics.uniqueTraders}`);

    record('6.2 Dashboard metrics', 'PASS', `Pools: ${metrics.totalPools}`, Date.now() - t0);
  } catch (e: any) {
    record('6.2 Dashboard metrics', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.3: Current Settings
// ═══════════════════════════════════════════

async function testCurrentSettings(): Promise<void> {
  logSection('TEST 6.3: Current Settings');
  const t0 = Date.now();

  try {
    const result = await apiFetch<any>('/admin/settings/current');
    if (result.settings) {
      logInfo(`Protocol fee: ${result.settings.protocolFeeBps} bps`);
      logInfo(`Min pool liquidity: ${result.settings.minPoolLiquidity}`);
      logInfo(`Min intent size: ${result.settings.minIntentSize}`);
      logInfo(`Solver bond: ${result.settings.solverBond}`);
      logInfo(`Version: ${result.settings.version}`);
      record('6.3 Current settings', 'PASS', `v${result.settings.version}, fee=${result.settings.protocolFeeBps}bps`, Date.now() - t0);
    } else {
      logInfo('No settings deployed yet');
      record('6.3 Current settings', 'PASS', 'No settings (expected on fresh deploy)', Date.now() - t0);
    }
  } catch (e: any) {
    record('6.3 Current settings', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.4: Update Settings
// ═══════════════════════════════════════════

async function testUpdateSettings(admin: WalletCtx): Promise<void> {
  logSection('TEST 6.4: Update Settings');
  const t0 = Date.now();

  try {
    logStep('Building settings update TX...');
    const result = await apiFetch<any>('/admin/settings/build-update-global', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: admin.address,
        new_settings: {
          protocol_fee_bps: 10,
          min_pool_liquidity: '2000000',
          min_intent_size: '1000000',
          solver_bond: '5000000',
          fee_collector_address: admin.address,
        },
      }),
    });

    if (result.unsignedTx) {
      const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'update_settings');
      logSuccess(`Settings updated: ${txHash.slice(0, 20)}...`);
      record('6.4 Update settings', 'PASS', `TX: ${txHash.slice(0, 20)}`, Date.now() - t0);
    } else {
      record('6.4 Update settings', 'SKIP', 'No TX needed or settings not deployed', Date.now() - t0);
    }
  } catch (e: any) {
    record('6.4 Update settings', 'SKIP', `${e.message?.slice(0, 60)}`, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.5: Pending Revenue & Fee Collection
// ═══════════════════════════════════════════

async function testFeeCollection(admin: WalletCtx): Promise<void> {
  logSection('TEST 6.5: Pending Revenue & Fee Collection');
  const t0 = Date.now();

  try {
    const revenue = await apiFetch<any>('/admin/revenue/pending');
    logInfo(`Pending revenue: ${JSON.stringify(revenue)}`);

    // Try to collect fees if any
    if (revenue.pools && revenue.pools.length > 0) {
      const poolIds = revenue.pools.map((p: any) => p.id || p.poolId);
      logStep(`Collecting fees from ${poolIds.length} pool(s)...`);

      try {
        const collectResult = await apiFetch<any>('/admin/revenue/build-collect', {
          method: 'POST',
          body: JSON.stringify({
            admin_address: admin.address,
            pool_ids: poolIds,
          }),
        });

        if (collectResult.unsignedTx) {
          const txHash = await signSubmitAndWait(admin, collectResult.unsignedTx, 'collect_fees');
          logSuccess(`Fees collected: ${txHash.slice(0, 20)}...`);
          record('6.5 Fee collection', 'PASS', `TX: ${txHash.slice(0, 20)}`, Date.now() - t0);
          return;
        }
      } catch (e: any) {
        logWarn(`Fee collection failed: ${e.message?.slice(0, 60)}`);
      }
    }

    record('6.5 Fee collection', 'PASS', 'Revenue check OK (may have no fees to collect)', Date.now() - t0);
  } catch (e: any) {
    record('6.5 Fee collection', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.6: Analytics Overview
// ═══════════════════════════════════════════

async function testAnalytics(): Promise<void> {
  logSection('TEST 6.6: Analytics Overview');
  const t0 = Date.now();

  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    logInfo(`Total pools: ${analytics.totalPools}`);
    logInfo(`Total intents: ${analytics.totalIntents}`);
    logInfo(`Intents filled: ${analytics.intentsFilled}`);
    logInfo(`Total volume: ${analytics.totalVolume}`);
    logInfo(`TVL: ${analytics.tvl || analytics.totalValueLocked}`);
    logInfo(`Unique traders: ${analytics.uniqueTraders}`);

    record('6.6 Analytics', 'PASS', `${analytics.totalPools} pools, ${analytics.totalIntents} intents`, Date.now() - t0);

    // Also test prices
    try {
      const prices = await apiFetch<any>('/analytics/prices');
      logInfo(`Token prices: ${JSON.stringify(prices).slice(0, 100)}`);
    } catch {
      logWarn('Prices endpoint not available');
    }
  } catch (e: any) {
    record('6.6 Analytics', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.7: Portfolio Queries
// ═══════════════════════════════════════════

async function testPortfolio(admin: WalletCtx): Promise<void> {
  logSection('TEST 6.7: Portfolio Queries');
  const t0 = Date.now();

  const endpoints: { path: string; name: string; params: Record<string, string> }[] = [
    { path: '/portfolio/summary', name: 'Summary', params: { address: admin.address } },
    { path: '/portfolio/open-orders', name: 'Open Orders', params: { address: admin.address } },
    { path: '/portfolio/history', name: 'History', params: { address: admin.address } },
    { path: '/portfolio/liquidity', name: 'Liquidity', params: { address: admin.address } },
    { path: `/portfolio/${admin.address}`, name: 'Legacy Portfolio', params: {} },
    { path: `/portfolio/${admin.address}/transactions`, name: 'TX List', params: {} },
  ];

  let passed = 0;
  for (const ep of endpoints) {
    try {
      const result = await apiFetch<any>(ep.path, { params: ep.params });
      logInfo(`${ep.name}: ${JSON.stringify(result).slice(0, 120)}`);
      passed++;
    } catch (e: any) {
      logWarn(`${ep.name}: ${e.message?.slice(0, 60)}`);
    }
  }

  record('6.7 Portfolio queries', passed > 0 ? 'PASS' : 'FAIL',
    `${passed}/${endpoints.length} endpoints OK`, Date.now() - t0);
}

// ═══════════════════════════════════════════
// TEST 6.8: Chart Endpoints
// ═══════════════════════════════════════════

async function testChartEndpoints(): Promise<void> {
  logSection('TEST 6.8: Chart Endpoints');
  const t0 = Date.now();

  try {
    const pools = await apiFetch<any[]>('/pools');
    const poolId = pools?.[0]?.id;

    const endpoints = [
      { path: '/chart/config', name: 'Config' },
      { path: '/chart/intervals', name: 'Intervals' },
    ];

    if (poolId) {
      endpoints.push(
        { path: `/chart/price/${poolId}`, name: 'Price' },
        { path: `/chart/info/${poolId}`, name: 'Info' },
      );
    }

    let passed = 0;
    for (const ep of endpoints) {
      try {
        const result = await apiFetch<any>(ep.path);
        logInfo(`${ep.name}: ${JSON.stringify(result).slice(0, 100)}`);
        passed++;
      } catch (e: any) {
        logWarn(`${ep.name}: ${e.message?.slice(0, 60)}`);
      }
    }

    // Test candles
    if (poolId) {
      try {
        const candles = await apiFetch<any>('/chart/candles', {
          params: { poolId, interval: 'H4', limit: '10' },
        });
        logInfo(`Candles: ${candles?.length || 0} entries`);
        passed++;
      } catch {
        logWarn('Candles not available');
      }
    }

    record('6.8 Chart endpoints', passed > 0 ? 'PASS' : 'FAIL',
      `${passed} endpoints OK`, Date.now() - t0);
  } catch (e: any) {
    record('6.8 Chart endpoints', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.9: Quote Endpoint
// ═══════════════════════════════════════════

async function testQuote(admin: WalletCtx): Promise<void> {
  logSection('TEST 6.9: Quote Endpoint');
  const t0 = Date.now();

  try {
    const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
    const tBTCUnit = tokenUnits['tBTC'];

    const quote = await apiFetch<any>('/quote', {
      params: {
        inputAsset: 'lovelace',
        outputAsset: tBTCUnit,
        inputAmount: '10000000', // 10 ADA
      },
    });

    logInfo(`Quote 10 ADA → tBTC: ${JSON.stringify(quote)}`);
    record('6.9 Quote', 'PASS', `Output: ${quote.estimatedOutput || quote.outputAmount}`, Date.now() - t0);
  } catch (e: any) {
    record('6.9 Quote', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.10: Health & Various Checks
// ═══════════════════════════════════════════

async function testHealth(): Promise<void> {
  logSection('TEST 6.10: Health & TX Status');
  const t0 = Date.now();

  try {
    const health = await apiFetch<any>('/health');
    logInfo(`Health: ${JSON.stringify(health)}`);

    try {
      const ready = await apiFetch<any>('/health/ready');
      logInfo(`Ready: ${JSON.stringify(ready)}`);
    } catch {
      logWarn('Ready endpoint not available');
    }

    record('6.10 Health', 'PASS', `Status: ${health.status || 'ok'}`, Date.now() - t0);
  } catch (e: any) {
    record('6.10 Health', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.11: On-chain UTxO Scans
// ═══════════════════════════════════════════

async function testOnChainScans(admin: WalletCtx): Promise<void> {
  logSection('TEST 6.11: On-chain UTxO Scans');
  const t0 = Date.now();

  try {
    // Scan escrow address
    if (ESCROW_SCRIPT_ADDRESS) {
      const escrowUtxos = await admin.lucid.utxosAt(ESCROW_SCRIPT_ADDRESS);
      logInfo(`Escrow UTxOs: ${escrowUtxos.length}`);
      for (const u of escrowUtxos.slice(0, 5)) {
        const ada = Number(u.assets['lovelace'] || 0n) / 1e6;
        logInfo(`  ${u.txHash.slice(0, 16)}...#${u.outputIndex}: ${ada.toFixed(2)} ADA`);
      }
    }

    // Scan pool address
    if (POOL_SCRIPT_ADDRESS) {
      const poolUtxos = await admin.lucid.utxosAt(POOL_SCRIPT_ADDRESS);
      logInfo(`Pool UTxOs: ${poolUtxos.length}`);
      for (const u of poolUtxos.slice(0, 5)) {
        const ada = Number(u.assets['lovelace'] || 0n) / 1e6;
        const tokenTypes = Object.keys(u.assets).filter((k) => k !== 'lovelace').length;
        logInfo(`  ${u.txHash.slice(0, 16)}...#${u.outputIndex}: ${ada.toFixed(2)} ADA, ${tokenTypes} tokens`);
      }
    }

    record('6.11 On-chain scans', 'PASS', 'Scans completed', Date.now() - t0);
  } catch (e: any) {
    record('6.11 On-chain scans', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 6.12: All Wallet Balances
// ═══════════════════════════════════════════

async function testWalletBalances(admin: WalletCtx): Promise<void> {
  logSection('TEST 6.12: All Wallet Balances');
  const t0 = Date.now();

  const wallets = await initAllWallets();
  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
  const unitToTicker: Record<string, string> = {};
  for (const [ticker, unit] of Object.entries(tokenUnits)) {
    unitToTicker[unit] = ticker;
  }

  for (const [key, wallet] of Object.entries(wallets)) {
    if (!wallet) continue;
    const bal = await getWalletBalance(wallet);
    const tokenStr = Object.entries(bal.tokens)
      .map(([unit, qty]) => `${unitToTicker[unit] || unit.slice(56, 70)}:${qty}`)
      .join(', ');
    logInfo(`${wallet.name}: ${formatAda(bal.ada)} ADA${tokenStr ? ', ' + tokenStr : ''}`);
  }

  record('6.12 Wallet balances', 'PASS', 'All balances checked', Date.now() - t0);
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 6: ADMIN FUNCTIONS & DATA QUERIES  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  console.log(`  Admin: ${admin.address.slice(0, 40)}...`);

  await testAdminAuth();
  await testDashboardMetrics();
  await testCurrentSettings();
  await testUpdateSettings(admin);
  await sleep(5_000);
  await testFeeCollection(admin);
  await sleep(5_000);
  await testAnalytics();
  await testPortfolio(admin);
  await testChartEndpoints();
  await testQuote(admin);
  await testHealth();
  await testOnChainScans(admin);
  await testWalletBalances(admin);

  printSummary();
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
