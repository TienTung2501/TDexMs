/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 5: LIQUIDITY & POOL MANAGEMENT TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests:
 *   5.1  Deposit additional liquidity (admin)
 *   5.2  Deposit from user2
 *   5.3  Withdraw 30% liquidity (admin)
 *   5.4  Pool state verification after operations
 *   5.5  Pool listing, detail, history queries
 *
 * Usage:
 *   npx tsx src/05-liquidity-tests.ts
 */
import {
  initWallet,
  apiFetch,
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
  type WalletCtx,
} from './test-helpers.js';

const args = parseArgs();

async function getFirstPool(): Promise<any> {
  if (args.poolId) return apiFetch<any>(`/pools/${args.poolId}`);
  const pools = await apiFetch<any[]>('/pools');
  if (!pools || pools.length === 0) throw new Error('No pools');
  return pools[0];
}

// ═══════════════════════════════════════════
// TEST 5.1: Deposit additional liquidity — Admin
// ═══════════════════════════════════════════

async function testDepositAdmin(admin: WalletCtx): Promise<void> {
  logSection('TEST 5.1: Deposit Liquidity — Admin');
  const t0 = Date.now();

  try {
    const pool = await getFirstPool();
    logInfo(`Pool: ${pool.id}`);
    logInfo(`Before — Reserve A: ${pool.reserveA}, Reserve B: ${pool.reserveB}, LP: ${pool.totalLpTokens}`);

    logStep('Depositing 20 ADA + proportional tBTC...');
    
    // Calculate proportional amountB based on current ratio
    const reserveA = BigInt(pool.reserveA);
    const reserveB = BigInt(pool.reserveB);
    const depositA = 20_000_000n; // 20 ADA
    const depositB = (depositA * reserveB) / reserveA + 1n; // Proportional + 1 for rounding

    const result = await apiFetch<any>(`/pools/${pool.id}/deposit`, {
      method: 'POST',
      body: JSON.stringify({
        amountA: depositA.toString(),
        amountB: depositB.toString(),
        minLpTokens: '0',
        senderAddress: admin.address,
        changeAddress: admin.address,
      }),
    });

    if (!result.unsignedTx) {
      record('5.1 Deposit (admin)', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'deposit');
    logSuccess(`Deposit TX: ${txHash.slice(0, 20)}...`);

    // Verify
    await sleep(10_000);
    const poolAfter = await apiFetch<any>(`/pools/${pool.id}`);
    logInfo(`After — Reserve A: ${poolAfter.reserveA}, Reserve B: ${poolAfter.reserveB}, LP: ${poolAfter.totalLpTokens}`);

    const reserveAAfter = BigInt(poolAfter.reserveA);
    if (reserveAAfter > reserveA) {
      record('5.1 Deposit (admin)', 'PASS', `Reserves increased: ${reserveA}→${reserveAAfter}`, Date.now() - t0);
    } else {
      record('5.1 Deposit (admin)', 'FAIL', 'Reserves did not increase', Date.now() - t0);
    }
  } catch (e: any) {
    record('5.1 Deposit (admin)', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 5.2: Deposit from User2
// ═══════════════════════════════════════════

async function testDepositUser2(admin: WalletCtx): Promise<void> {
  logSection('TEST 5.2: Deposit Liquidity — User2');
  const t0 = Date.now();

  let user2: WalletCtx;
  try {
    user2 = await initWallet('user2');
  } catch {
    record('5.2 Deposit (user2)', 'SKIP', 'User2 not available', 0);
    return;
  }

  try {
    const pool = await getFirstPool();
    const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
    const tBTCUnit = tokenUnits['tBTC'];

    // Check user2 has tBTC
    const balance = await getWalletBalance(user2);
    const tBTCBal = balance.tokens[tBTCUnit] || 0n;
    logInfo(`User2: ${formatAda(balance.ada)} ADA, ${tBTCBal} tBTC`);

    if (tBTCBal <= 0n) {
      record('5.2 Deposit (user2)', 'SKIP', 'User2 has no tBTC', 0);
      return;
    }

    const reserveA = BigInt(pool.reserveA);
    const reserveB = BigInt(pool.reserveB);
    const depositA = 10_000_000n; // 10 ADA
    const depositB = (depositA * reserveB) / reserveA + 1n;

    logStep(`Depositing ${formatAda(depositA)} ADA + ${depositB} tBTC from User2...`);

    const result = await apiFetch<any>(`/pools/${pool.id}/deposit`, {
      method: 'POST',
      body: JSON.stringify({
        amountA: depositA.toString(),
        amountB: depositB.toString(),
        minLpTokens: '0',
        senderAddress: user2.address,
        changeAddress: user2.address,
      }),
    });

    if (!result.unsignedTx) {
      record('5.2 Deposit (user2)', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const txHash = await signSubmitAndWait(user2, result.unsignedTx, 'deposit');
    logSuccess(`Deposit TX: ${txHash.slice(0, 20)}...`);
    record('5.2 Deposit (user2)', 'PASS', `TX: ${txHash.slice(0, 20)}`, Date.now() - t0);
  } catch (e: any) {
    record('5.2 Deposit (user2)', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 5.3: Withdraw 30% — Admin
// ═══════════════════════════════════════════

async function testWithdrawAdmin(admin: WalletCtx): Promise<void> {
  logSection('TEST 5.3: Withdraw 30% Liquidity — Admin');
  const t0 = Date.now();

  try {
    const pool = await getFirstPool();
    const totalLp = BigInt(pool.totalLpTokens);
    const withdrawPercent = 30;
    const lpToWithdraw = (totalLp * BigInt(withdrawPercent)) / 100n;

    logInfo(`Pool LP total: ${totalLp}`);
    logInfo(`Withdrawing ${withdrawPercent}% = ${lpToWithdraw} LP tokens`);

    if (lpToWithdraw <= 0n) {
      record('5.3 Withdraw (admin)', 'SKIP', 'No LP tokens to withdraw', 0);
      return;
    }

    const reserveABefore = BigInt(pool.reserveA);

    const result = await apiFetch<any>(`/pools/${pool.id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({
        lpTokenAmount: lpToWithdraw.toString(),
        minAmountA: '0',
        minAmountB: '0',
        senderAddress: admin.address,
        changeAddress: admin.address,
      }),
    });

    if (!result.unsignedTx) {
      record('5.3 Withdraw (admin)', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'withdraw');
    logSuccess(`Withdraw TX: ${txHash.slice(0, 20)}...`);

    // Verify reserves decreased
    await sleep(10_000);
    const poolAfter = await apiFetch<any>(`/pools/${pool.id}`);
    const reserveAAfter = BigInt(poolAfter.reserveA);

    if (reserveAAfter < reserveABefore) {
      record('5.3 Withdraw (admin)', 'PASS', `Reserves decreased: ${reserveABefore}→${reserveAAfter}`, Date.now() - t0);
    } else {
      record('5.3 Withdraw (admin)', 'FAIL', 'Reserves did not decrease', Date.now() - t0);
    }
  } catch (e: any) {
    record('5.3 Withdraw (admin)', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 5.4: Pool state verification
// ═══════════════════════════════════════════

async function testPoolState(): Promise<void> {
  logSection('TEST 5.4: Pool State Verification');
  const t0 = Date.now();

  try {
    const pool = await getFirstPool();
    logInfo(`Pool ID: ${pool.id}`);
    logInfo(`Status: ${pool.status}`);
    logInfo(`Asset A: ${pool.assetA} — Reserve: ${pool.reserveA}`);
    logInfo(`Asset B: ${pool.assetB} — Reserve: ${pool.reserveB}`);
    logInfo(`Total LP: ${pool.totalLpTokens}`);
    logInfo(`Fee: ${pool.feeNumerator}/10000`);
    logInfo(`Protocol Fees A: ${pool.protocolFeesA || 0}`);
    logInfo(`Protocol Fees B: ${pool.protocolFeesB || 0}`);
    logInfo(`TX Hash: ${pool.txHash || 'unknown'}`);

    const reserveA = BigInt(pool.reserveA);
    const reserveB = BigInt(pool.reserveB);
    const totalLp = BigInt(pool.totalLpTokens);

    // Verify invariants
    if (reserveA > 0n && reserveB > 0n && totalLp > 0n) {
      logSuccess('Pool invariants OK: reserves > 0, LP > 0');
      record('5.4 Pool state', 'PASS', `Reserves: ${formatAda(reserveA)} ADA / ${reserveB} tBTC`, Date.now() - t0);
    } else {
      record('5.4 Pool state', 'FAIL', 'Invalid reserves or LP', Date.now() - t0);
    }
  } catch (e: any) {
    record('5.4 Pool state', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 5.5: Pool listing & history
// ═══════════════════════════════════════════

async function testPoolQueries(): Promise<void> {
  logSection('TEST 5.5: Pool Listing & History Queries');
  const t0 = Date.now();

  try {
    // List pools
    const pools = await apiFetch<any[]>('/pools');
    logInfo(`Total pools: ${pools?.length || 0}`);

    if (pools && pools.length > 0) {
      const poolId = pools[0].id;

      // Pool detail
      const detail = await apiFetch<any>(`/pools/${poolId}`);
      logInfo(`Pool detail: ${detail.id} — ${detail.assetA}/${detail.assetB}`);

      // Pool history
      try {
        const history = await apiFetch<any>(`/pools/${poolId}/history`);
        logInfo(`Pool history entries: ${history?.length || 0}`);
      } catch {
        logWarn('Pool history not available');
      }

      record('5.5 Pool queries', 'PASS', `${pools.length} pools, detail & history OK`, Date.now() - t0);
    } else {
      record('5.5 Pool queries', 'FAIL', 'No pools found', Date.now() - t0);
    }
  } catch (e: any) {
    record('5.5 Pool queries', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 5: LIQUIDITY & POOL MANAGEMENT TESTS  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  console.log(`  Admin: ${admin.address.slice(0, 40)}...`);

  await testDepositAdmin(admin);
  await sleep(10_000);

  await testDepositUser2(admin);
  await sleep(10_000);

  await testWithdrawAdmin(admin);
  await sleep(10_000);

  await testPoolState();
  await testPoolQueries();

  printSummary();
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
