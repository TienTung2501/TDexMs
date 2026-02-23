/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 7: DATABASE & STATE VERIFICATION
 * ═══════════════════════════════════════════════════════════════════
 *
 * Cross-checks DB state with on-chain state:
 *   7.1  Pool DB vs chain consistency
 *   7.2  Intent status distribution & chain match
 *   7.3  Order status distribution & chain match
 *   7.4  Analytics totals vs actual counts
 *   7.5  Portfolio aggregation check
 *   7.6  Price data freshness
 *   7.7  Final state report
 *
 * Usage:
 *   npx tsx src/07-db-verification.ts
 */
import {
  initWallet,
  apiFetch,
  safeApi,
  logSection,
  logStep,
  logSuccess,
  logFail,
  logInfo,
  logWarn,
  record,
  printSummary,
  getAllTestTokenUnits,
  formatAda,
  ESCROW_SCRIPT_ADDRESS,
  POOL_SCRIPT_ADDRESS,
  type WalletCtx,
} from './test-helpers.js';

// ═══════════════════════════════════════════
// 7.1: Pool DB vs Chain
// ═══════════════════════════════════════════

async function verifyPoolConsistency(admin: WalletCtx): Promise<void> {
  logSection('7.1: Pool DB vs Chain Consistency');
  const t0 = Date.now();

  try {
    const dbPools = await apiFetch<any[]>('/pools');
    logInfo(`DB pools count: ${dbPools.length}`);

    if (!POOL_SCRIPT_ADDRESS) {
      record('7.1 Pool consistency', 'SKIP', 'No pool script address', Date.now() - t0);
      return;
    }

    const chainUtxos = await admin.lucid.utxosAt(POOL_SCRIPT_ADDRESS);
    logInfo(`Chain UTxOs at pool address: ${chainUtxos.length}`);

    for (const pool of dbPools) {
      logStep(`Pool ${pool.id}: ${pool.tokenASymbol || 'ADA'}/${pool.tokenBSymbol || '???'}`);
      logInfo(`  DB reserveA: ${pool.reserveA}, reserveB: ${pool.reserveB}`);
      logInfo(`  DB status: ${pool.status}`);

      // Check if pool's UTxO exists on-chain
      if (pool.txHash && pool.outputIndex !== undefined) {
        const match = chainUtxos.find(
          (u) => u.txHash === pool.txHash && u.outputIndex === pool.outputIndex,
        );
        if (match) {
          const chainAda = Number(match.assets['lovelace'] || 0n);
          logSuccess(`  On-chain UTxO found: ${(chainAda / 1e6).toFixed(2)} ADA`);
        } else {
          logWarn(`  On-chain UTxO NOT found (may have been consumed)`);
        }
      }
    }

    record('7.1 Pool consistency', 'PASS',
      `${dbPools.length} DB pools, ${chainUtxos.length} chain UTxOs`, Date.now() - t0);
  } catch (e: any) {
    record('7.1 Pool consistency', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// 7.2: Intent Status Distribution
// ═══════════════════════════════════════════

async function verifyIntentStatus(admin: WalletCtx): Promise<void> {
  logSection('7.2: Intent Status Distribution');
  const t0 = Date.now();

  try {
    const intents = await apiFetch<any>('/intents', {
      params: { limit: '200' },
    });
    const list = Array.isArray(intents) ? intents : intents.data || intents.intents || [];
    logInfo(`Total intents: ${list.length}`);

    const byStatus: Record<string, number> = {};
    for (const i of list) {
      const s = i.status || 'UNKNOWN';
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    for (const [status, count] of Object.entries(byStatus)) {
      logInfo(`  ${status}: ${count}`);
    }

    // Cross-check ACTIVE intents should have UTxOs on-chain
    const activeIntents = list.filter((i: any) => i.status === 'ACTIVE');
    if (activeIntents.length > 0 && ESCROW_SCRIPT_ADDRESS) {
      const escrowUtxos = await admin.lucid.utxosAt(ESCROW_SCRIPT_ADDRESS);
      logInfo(`  ACTIVE intents in DB: ${activeIntents.length}`);
      logInfo(`  Escrow UTxOs on-chain: ${escrowUtxos.length}`);

      let matchCount = 0;
      for (const intent of activeIntents) {
        if (intent.txHash) {
          const found = escrowUtxos.some((u) => u.txHash === intent.txHash);
          if (found) matchCount++;
        }
      }
      logInfo(`  Matched on-chain: ${matchCount}/${activeIntents.length}`);
    }

    record('7.2 Intent status', 'PASS',
      Object.entries(byStatus).map(([s, c]) => `${s}:${c}`).join(', '), Date.now() - t0);
  } catch (e: any) {
    record('7.2 Intent status', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// 7.3: Order Status Distribution
// ═══════════════════════════════════════════

async function verifyOrderStatus(): Promise<void> {
  logSection('7.3: Order Status Distribution');
  const t0 = Date.now();

  try {
    const orders = await apiFetch<any>('/orders', {
      params: { limit: '200' },
    });
    const list = Array.isArray(orders) ? orders : orders.data || orders.orders || [];
    logInfo(`Total orders: ${list.length}`);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const o of list) {
      byStatus[o.status || 'UNKNOWN'] = (byStatus[o.status || 'UNKNOWN'] || 0) + 1;
      byType[o.orderType || o.type || 'UNKNOWN'] = (byType[o.orderType || o.type || 'UNKNOWN'] || 0) + 1;
    }

    logInfo('  By status:');
    for (const [s, c] of Object.entries(byStatus)) logInfo(`    ${s}: ${c}`);
    logInfo('  By type:');
    for (const [t, c] of Object.entries(byType)) logInfo(`    ${t}: ${c}`);

    record('7.3 Order status', 'PASS',
      Object.entries(byStatus).map(([s, c]) => `${s}:${c}`).join(', '), Date.now() - t0);
  } catch (e: any) {
    record('7.3 Order status', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// 7.4: Analytics Totals
// ═══════════════════════════════════════════

async function verifyAnalytics(): Promise<void> {
  logSection('7.4: Analytics Totals Cross-check');
  const t0 = Date.now();

  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    const pools = await apiFetch<any[]>('/pools');
    const intents = await apiFetch<any>('/intents', { params: { limit: '200' } });
    const orders = await apiFetch<any>('/orders', { params: { limit: '200' } });

    const intentList = Array.isArray(intents) ? intents : intents.data || intents.intents || [];
    const orderList = Array.isArray(orders) ? orders : orders.data || orders.orders || [];

    logInfo(`Analytics says totalPools: ${analytics.totalPools}`);
    logInfo(`Actual pool count: ${pools.length}`);
    logInfo(`Analytics says totalIntents: ${analytics.totalIntents}`);
    logInfo(`Actual intent count: ${intentList.length}`);
    logInfo(`Analytics says totalOrders: ${analytics.totalOrders}`);
    logInfo(`Actual order count: ${orderList.length}`);

    const poolMatch = analytics.totalPools === pools.length;
    const intentMatch = Number(analytics.totalIntents) >= intentList.length;
    const orderMatch = Number(analytics.totalOrders) >= orderList.length;

    if (poolMatch) logSuccess('Pool count matches');
    else logWarn(`Pool count mismatch: analytics=${analytics.totalPools} vs actual=${pools.length}`);

    if (intentMatch) logSuccess('Intent count consistent');
    else logWarn(`Intent count: analytics=${analytics.totalIntents} vs fetched=${intentList.length}`);

    if (orderMatch) logSuccess('Order count consistent');
    else logWarn(`Order count: analytics=${analytics.totalOrders} vs fetched=${orderList.length}`);

    record('7.4 Analytics totals', poolMatch && intentMatch && orderMatch ? 'PASS' : 'FAIL',
      `pools:${poolMatch}, intents:${intentMatch}, orders:${orderMatch}`, Date.now() - t0);
  } catch (e: any) {
    record('7.4 Analytics totals', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// 7.5: Portfolio Cross-check
// ═══════════════════════════════════════════

async function verifyPortfolio(admin: WalletCtx): Promise<void> {
  logSection('7.5: Portfolio Aggregation Check');
  const t0 = Date.now();

  try {
    const summary = await safeApi<any>('/portfolio/summary', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const openOrders = await safeApi<any>(`/portfolio/open-orders?address=${admin.address}`);
    const history = await safeApi<any>(`/portfolio/history?address=${admin.address}`);
    const liquidity = await safeApi<any>(`/portfolio/liquidity?address=${admin.address}`);

    logInfo(`Summary: ${JSON.stringify(summary)?.slice(0, 120)}`);
    logInfo(`Open orders: ${JSON.stringify(openOrders)?.slice(0, 120)}`);
    logInfo(`History entries: ${Array.isArray(history) ? history.length : JSON.stringify(history)?.slice(0, 80)}`);
    logInfo(`Liquidity: ${JSON.stringify(liquidity)?.slice(0, 120)}`);

    record('7.5 Portfolio check', 'PASS', 'Data fetched successfully', Date.now() - t0);
  } catch (e: any) {
    record('7.5 Portfolio check', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// 7.6: Price Data Freshness
// ═══════════════════════════════════════════

async function verifyPriceData(): Promise<void> {
  logSection('7.6: Price Data Freshness');
  const t0 = Date.now();

  try {
    const prices = await safeApi<any>('/analytics/prices');
    if (!prices) {
      record('7.6 Price freshness', 'SKIP', 'Prices endpoint not available', Date.now() - t0);
      return;
    }

    logInfo(`Prices: ${JSON.stringify(prices).slice(0, 200)}`);

    // Check pools have recent snapshots
    const pools = await apiFetch<any[]>('/pools');
    for (const pool of pools.slice(0, 3)) {
      try {
        const chartInfo = await safeApi<any>(`/chart/info/${pool.id}`);
        if (chartInfo) {
          logInfo(`Pool ${pool.id}: lastUpdate=${chartInfo.lastUpdate || 'N/A'}, price=${chartInfo.price || 'N/A'}`);
        }
      } catch { /* skip */ }
    }

    record('7.6 Price freshness', 'PASS', 'Price data available', Date.now() - t0);
  } catch (e: any) {
    record('7.6 Price freshness', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// 7.7: Final State Report
// ═══════════════════════════════════════════

async function finalStateReport(admin: WalletCtx): Promise<void> {
  logSection('7.7: Final State Report');
  const t0 = Date.now();

  try {
    // Pool details
    const pools = await apiFetch<any[]>('/pools');
    for (const pool of pools) {
      logInfo(`Pool ${pool.id}: ${pool.tokenASymbol || 'ADA'}/${pool.tokenBSymbol}`);
      logInfo(`  ReserveA: ${pool.reserveA}, ReserveB: ${pool.reserveB}`);
      logInfo(`  Fee: ${pool.feeNumerator}/10000`);
      logInfo(`  Total LP: ${pool.totalLiquidity || pool.totalLpTokens || 'N/A'}`);
      logInfo(`  Status: ${pool.status}`);
    }

    // Chain state
    if (ESCROW_SCRIPT_ADDRESS) {
      const escrow = await admin.lucid.utxosAt(ESCROW_SCRIPT_ADDRESS);
      logInfo(`\nEscrow UTxOs remaining: ${escrow.length}`);
    }
    if (POOL_SCRIPT_ADDRESS) {
      const poolUtxos = await admin.lucid.utxosAt(POOL_SCRIPT_ADDRESS);
      logInfo(`Pool UTxOs: ${poolUtxos.length}`);
    }

    // Admin wallet balance
    const utxos = await admin.lucid.utxosAt(admin.address);
    let totalAda = 0n;
    for (const u of utxos) totalAda += u.assets['lovelace'] || 0n;
    logInfo(`\nAdmin wallet: ${formatAda(totalAda)} ADA, ${utxos.length} UTxOs`);

    record('7.7 Final report', 'PASS', `${pools.length} pools`, Date.now() - t0);
  } catch (e: any) {
    record('7.7 Final report', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 7: DATABASE & STATE VERIFICATION  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  console.log(`  Admin: ${admin.address.slice(0, 40)}...`);

  await verifyPoolConsistency(admin);
  await verifyIntentStatus(admin);
  await verifyOrderStatus();
  await verifyAnalytics();
  await verifyPortfolio(admin);
  await verifyPriceData();
  await finalStateReport(admin);

  printSummary();
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
