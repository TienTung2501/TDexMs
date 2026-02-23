/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 2: DEPLOY FACTORY + SETTINGS + CREATE POOL
 * ═══════════════════════════════════════════════════════════════════
 *
 * Deploys the factory UTxO, settings UTxO, and creates one test pool
 * (ADA/tBTC) for all subsequent tests.
 *
 * Flow:
 *   1. Deploy settings UTxO via backend API
 *   2. Deploy factory UTxO via backend API  
 *   3. Create ADA/tBTC pool with initial liquidity
 *   4. Verify pool state
 *
 * Usage:
 *   npx tsx src/02-setup-pool.ts
 */
import {
  initWallet,
  apiFetch,
  signSubmitAndWait,
  waitTx,
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
  type WalletCtx,
} from './test-helpers.js';

// ═══════════════════════════════════════════
// STEP 1: Deploy Settings
// ═══════════════════════════════════════════

async function deploySettings(admin: WalletCtx): Promise<boolean> {
  logSection('STEP 1: Deploy Settings UTxO');
  const t0 = Date.now();

  try {
    // Check if settings already exist
    const current = await apiFetch<any>('/admin/settings/current').catch(() => null);
    if (current && current.settings) {
      logInfo(`Settings already exist: version=${current.settings.version}, fee=${current.settings.protocolFeeBps}bps`);
      record('Deploy settings', 'PASS', 'Already deployed', Date.now() - t0);
      return true;
    }
  } catch { /* not deployed yet */ }

  logStep('Building settings deployment TX...');

  try {
    const result = await apiFetch<any>('/admin/settings/build-deploy', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: admin.address,
        protocol_fee_bps: 5,
        min_pool_liquidity: '2000000',
        min_intent_size: '1000000',
        solver_bond: '5000000',
        fee_collector_address: admin.address,
      }),
    });

    if (result.unsignedTx) {
      const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'deploy_settings');
      record('Deploy settings', 'PASS', `TX: ${txHash.slice(0, 20)}...`, Date.now() - t0);
      return true;
    } else {
      record('Deploy settings', 'PASS', 'No TX needed', Date.now() - t0);
      return true;
    }
  } catch (e: any) {
    record('Deploy settings', 'FAIL', e.message, Date.now() - t0);
    logWarn('Settings deployment failed — pool creation may still work without it');
    return false;
  }
}

// ═══════════════════════════════════════════
// STEP 2: Deploy Factory
// ═══════════════════════════════════════════

async function deployFactory(admin: WalletCtx): Promise<boolean> {
  logSection('STEP 2: Deploy Factory UTxO');
  const t0 = Date.now();

  logStep('Building factory deployment TX via backend...');

  try {
    const result = await apiFetch<any>('/admin/factory/build-deploy', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: admin.address,
      }),
    });

    if (result.unsignedTx) {
      const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'deploy_factory');
      record('Deploy factory', 'PASS', `TX: ${txHash.slice(0, 20)}...`, Date.now() - t0);
      return true;
    } else if (result.message?.includes('already')) {
      record('Deploy factory', 'PASS', 'Already deployed', Date.now() - t0);
      return true;
    } else {
      record('Deploy factory', 'PASS', 'Completed', Date.now() - t0);
      return true;
    }
  } catch (e: any) {
    // Factory might already exist — check pools endpoint
    logWarn(`Factory deploy error: ${e.message?.slice(0, 100)}`);
    record('Deploy factory', 'SKIP', `May already exist: ${e.message?.slice(0, 60)}`, Date.now() - t0);
    return true; // Continue anyway
  }
}

// ═══════════════════════════════════════════
// STEP 3: Create ADA/tBTC Pool
// ═══════════════════════════════════════════

async function createPool(admin: WalletCtx): Promise<string | null> {
  logSection('STEP 3: Create ADA/tBTC Pool');
  const t0 = Date.now();

  // Check if pool already exists
  try {
    const pools = await apiFetch<any[]>('/pools');
    if (pools && pools.length > 0) {
      logInfo(`${pools.length} pool(s) already exist`);
      for (const p of pools) {
        logInfo(`  Pool ${p.id}: ${p.assetA}/${p.assetB} — Reserves: ${p.reserveA}/${p.reserveB}`);
      }
      record('Create pool', 'PASS', `Already exists: ${pools[0].id}`, Date.now() - t0);
      return pools[0].id;
    }
  } catch { /* no pools yet */ }

  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
  const tBTCUnit = tokenUnits['tBTC'];

  logStep(`Creating ADA/tBTC pool...`);
  logInfo(`tBTC unit: ${tBTCUnit}`);
  logInfo(`Initial: 100 ADA + 100,000 tBTC (8 decimals = 0.001 BTC)`);

  try {
    const result = await apiFetch<any>('/pools/create', {
      method: 'POST',
      body: JSON.stringify({
        assetA: 'lovelace',
        assetB: tBTCUnit,
        initialAmountA: '100000000',    // 100 ADA
        initialAmountB: '10000000000',  // 100,000 tBTC (8 decimals)
        feeNumerator: 30,               // 0.3%
        creatorAddress: admin.address,
        changeAddress: admin.address,
      }),
    });

    logInfo(`Pool ID: ${result.poolId}`);

    if (result.unsignedTx) {
      const txHash = await signSubmitAndWait(
        admin, result.unsignedTx, 'create_pool',
        { poolId: result.poolId },
      );
      record('Create pool', 'PASS', `Pool ${result.poolId}, TX: ${txHash.slice(0, 20)}`, Date.now() - t0);
      return result.poolId;
    } else {
      record('Create pool', 'PASS', `Pool ${result.poolId} (no TX)`, Date.now() - t0);
      return result.poolId;
    }
  } catch (e: any) {
    record('Create pool', 'FAIL', e.message, Date.now() - t0);
    return null;
  }
}

// ═══════════════════════════════════════════
// STEP 4: Verify Pool State
// ═══════════════════════════════════════════

async function verifyPool(poolId: string): Promise<void> {
  logSection('STEP 4: Verify Pool State');
  const t0 = Date.now();

  try {
    const pool = await apiFetch<any>(`/pools/${poolId}`);
    logInfo(`Pool ID: ${pool.id}`);
    logInfo(`Asset A: ${pool.assetA}`);
    logInfo(`Asset B: ${pool.assetB}`);
    logInfo(`Reserve A: ${pool.reserveA}`);
    logInfo(`Reserve B: ${pool.reserveB}`);
    logInfo(`Total LP: ${pool.totalLpTokens}`);
    logInfo(`Fee: ${pool.feeNumerator}/10000 = ${(pool.feeNumerator / 100).toFixed(1)}%`);
    logInfo(`Status: ${pool.status}`);

    if (Number(pool.reserveA) > 0 && Number(pool.reserveB) > 0) {
      record('Verify pool', 'PASS', `Reserves: ${pool.reserveA}/${pool.reserveB}`, Date.now() - t0);
    } else {
      record('Verify pool', 'FAIL', 'Pool has zero reserves', Date.now() - t0);
    }
  } catch (e: any) {
    record('Verify pool', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 2: SETUP — FACTORY + SETTINGS + POOL  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  console.log(`  Admin: ${admin.address}`);

  const balance = await getWalletBalance(admin);
  logInfo(`Admin balance: ${formatAda(balance.ada)} ADA`);

  await deploySettings(admin);
  await sleep(5000);

  await deployFactory(admin);
  await sleep(5000);

  const poolId = await createPool(admin);
  if (poolId) {
    await sleep(10000); // Wait for chain sync
    await verifyPool(poolId);
  }

  printSummary();

  // Export pool ID for next phases
  if (poolId) {
    console.log(`\n  POOL_ID=${poolId}`);
    console.log('  Export this for subsequent test phases.\n');
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
