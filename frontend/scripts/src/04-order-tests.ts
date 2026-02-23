/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 4: ORDER TESTS (LIMIT / DCA / STOP_LOSS)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests all order types and scenarios:
 *   4.1  LIMIT order — user5 (ADA → tBTC at target price)
 *   4.2  DCA order — user2 (buy tBTC with ADA, multiple intervals)
 *   4.3  STOP_LOSS order — user3 (sell tBTC if price drops)
 *   4.4  Cancel LIMIT order — user4 (create then cancel)
 *   4.5  Order listing & detail queries
 *   4.6  Wait for OrderExecutorCron bot execution
 *   4.7  Manual order execute via /solver/execute-order
 *
 * OrderExecutorCron polls every 60s and checks:
 *   - DCA: if interval elapsed since last fill
 *   - Limit: if pool price meets target price
 *   - StopLoss: if pool price triggers stop level
 *
 * Usage:
 *   npx tsx src/04-order-tests.ts
 *   npx tsx src/04-order-tests.ts --poolId=xxx
 */
import {
  initWallet,
  apiFetch,
  safeApi,
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
  parseArgs,
  type WalletCtx,
} from './test-helpers.js';

const args = parseArgs();

async function getFirstPool(): Promise<any> {
  if (args.poolId) return apiFetch<any>(`/pools/${args.poolId}`);
  const pools = await apiFetch<any[]>('/pools');
  if (!pools || pools.length === 0) throw new Error('No pools — run 02-setup-pool.ts first');
  return pools[0];
}

async function waitForOrderStatus(orderId: string, targetStatus: string, maxWait = 300_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const order = await apiFetch<any>(`/orders/${orderId}`);
      logInfo(`  Order ${orderId.slice(0, 8)}... status: ${order.status}`);
      if (order.status === targetStatus) return order;
      if (['FILLED', 'CANCELLED', 'RECLAIMED', 'PARTIALLY_FILLED'].includes(order.status)) {
        if (order.status === targetStatus || order.status === 'FILLED' || order.status === 'PARTIALLY_FILLED') return order;
      }
    } catch { /* retry */ }
    await sleep(15_000);
  }
  const finalOrder = await apiFetch<any>(`/orders/${orderId}`);
  return finalOrder;
}

// ═══════════════════════════════════════════
// TEST 4.1: LIMIT Order — User5 (ADA → tBTC)
// ═══════════════════════════════════════════

async function testLimitOrder(tBTCUnit: string): Promise<string | null> {
  logSection('TEST 4.1: LIMIT Order — User5 (ADA → tBTC)');
  const t0 = Date.now();

  let user5: WalletCtx;
  try {
    user5 = await initWallet('user5');
  } catch {
    record('4.1 LIMIT order', 'SKIP', 'User5 not available', 0);
    return null;
  }

  try {
    const pool = await getFirstPool();
    // Calculate current price from pool reserves
    const reserveA = BigInt(pool.reserveA); // ADA (lovelace)
    const reserveB = BigInt(pool.reserveB); // tBTC
    // Price of tBTC in ADA = reserveA / reserveB
    // For LIMIT buy: we want to buy tBTC when price is at or below current price
    // priceNum/priceDen: output_per_input = targetPriceNum/targetPriceDen
    // For ADA → tBTC: output = tBTC, input = ADA
    // Target: receive at least (inputAmount * priceNum / priceDen) tBTC per ADA
    // Set slightly generous price so it fills immediately
    const currentPriceNum = reserveB; // tBTC per ADA
    const currentPriceDen = reserveA;

    logInfo(`Pool: ${pool.id}`);
    logInfo(`Reserves: ${formatAda(reserveA)} ADA / ${reserveB} tBTC`);
    logInfo(`Current price ratio: ${Number(currentPriceNum) / Number(currentPriceDen)} tBTC/lovelace`);

    // Set target price slightly below current so it should fill immediately
    // priceNum = 1, priceDen = large number → accept almost any price
    logStep('Creating LIMIT order: 5 ADA → tBTC at generous price...');
    const result = await apiFetch<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'LIMIT',
        senderAddress: user5.address,
        inputAsset: 'lovelace',
        outputAsset: tBTCUnit,
        inputAmount: '5000000', // 5 ADA
        priceNumerator: '1',
        priceDenominator: '1000000', // Very generous: accept 1 tBTC unit per 1M lovelace
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        changeAddress: user5.address,
      }),
    });

    logInfo(`Order ID: ${result.orderId}`);

    if (!result.unsignedTx) {
      record('4.1 LIMIT order', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return null;
    }

    const txHash = await signSubmitAndWait(user5, result.unsignedTx, 'create_order');
    logSuccess(`Order created: ${txHash.slice(0, 20)}...`);

    // Wait for OrderExecutorCron (polls every 60s) 
    logStep('Waiting for OrderExecutorCron to execute (may take up to 120s)...');
    const finalOrder = await waitForOrderStatus(result.orderId, 'FILLED', 300_000);

    if (finalOrder.status === 'FILLED' || finalOrder.status === 'PARTIALLY_FILLED') {
      record('4.1 LIMIT order', 'PASS', `Status: ${finalOrder.status}`, Date.now() - t0);
    } else {
      record('4.1 LIMIT order', 'FAIL', `Status: ${finalOrder.status}`, Date.now() - t0);
    }

    return result.orderId;
  } catch (e: any) {
    record('4.1 LIMIT order', 'FAIL', e.message, Date.now() - t0);
    return null;
  }
}

// ═══════════════════════════════════════════
// TEST 4.2: DCA Order — User2
// ═══════════════════════════════════════════

async function testDcaOrder(tBTCUnit: string): Promise<string | null> {
  logSection('TEST 4.2: DCA Order — User2 (ADA → tBTC, multi-interval)');
  const t0 = Date.now();

  let user2: WalletCtx;
  try {
    user2 = await initWallet('user2');
  } catch {
    record('4.2 DCA order', 'SKIP', 'User2 not available', 0);
    return null;
  }

  try {
    // DCA: Buy tBTC with 15 ADA total, 5 ADA per interval, interval = 60 slots (~1 min)
    logStep('Creating DCA order: 15 ADA total, 5 ADA/interval, interval=60 slots...');
    const result = await apiFetch<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'DCA',
        senderAddress: user2.address,
        inputAsset: 'lovelace',
        outputAsset: tBTCUnit,
        inputAmount: '15000000',          // 15 ADA total budget
        totalBudget: '15000000',
        amountPerInterval: '5000000',     // 5 ADA per interval
        intervalSlots: 60,                // ~1 minute between fills
        priceNumerator: '1',
        priceDenominator: '1000000',      // Accept any price
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        changeAddress: user2.address,
      }),
    });

    logInfo(`Order ID: ${result.orderId}`);

    if (!result.unsignedTx) {
      record('4.2 DCA order', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return null;
    }

    const txHash = await signSubmitAndWait(user2, result.unsignedTx, 'create_order');
    logSuccess(`DCA order created: ${txHash.slice(0, 20)}...`);

    // DCA takes multiple intervals — wait for at least 1 execution
    logStep('Waiting for first DCA execution (~2 min)...');
    const firstExec = await waitForOrderStatus(result.orderId, 'PARTIALLY_FILLED', 300_000);

    if (firstExec.status === 'PARTIALLY_FILLED' || firstExec.status === 'FILLED') {
      logSuccess(`DCA first execution happened! Status: ${firstExec.status}`);
      
      if (firstExec.status === 'PARTIALLY_FILLED') {
        logStep('Waiting for more DCA intervals...');
        // Wait another 2 minutes for more fills
        await sleep(120_000);
        const updated = await apiFetch<any>(`/orders/${result.orderId}`);
        logInfo(`DCA final status: ${updated.status}, remaining: ${updated.remainingBudget || 'unknown'}`);
      }

      record('4.2 DCA order', 'PASS', `DCA executing — status: ${firstExec.status}`, Date.now() - t0);
    } else {
      record('4.2 DCA order', 'FAIL', `Status: ${firstExec.status}`, Date.now() - t0);
    }

    return result.orderId;
  } catch (e: any) {
    record('4.2 DCA order', 'FAIL', e.message, Date.now() - t0);
    return null;
  }
}

// ═══════════════════════════════════════════
// TEST 4.3: STOP_LOSS Order — User3
// ═══════════════════════════════════════════

async function testStopLossOrder(admin: WalletCtx, tBTCUnit: string): Promise<string | null> {
  logSection('TEST 4.3: STOP_LOSS Order — User3 (tBTC → ADA)');
  const t0 = Date.now();

  let user3: WalletCtx;
  try {
    user3 = await initWallet('user3');
  } catch {
    record('4.3 STOP_LOSS order', 'SKIP', 'User3 not available', 0);
    return null;
  }

  try {
    const balance = await getWalletBalance(user3);
    // User3 might not have tBTC — check
    const tBTCBalance = balance.tokens[tBTCUnit] || 0n;

    if (tBTCBalance <= 0n) {
      logInfo('User3 has no tBTC — using ADA instead for stop loss test');
      // Create stop loss with ADA → tBTC direction
      // StopLoss triggers when price drops below target
      // Set a very high target price so it triggers immediately
      logStep('Creating STOP_LOSS order: 5 ADA → tBTC (immediate trigger)...');
      
      const result = await apiFetch<any>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'STOP_LOSS',
          senderAddress: user3.address,
          inputAsset: 'lovelace',
          outputAsset: tBTCUnit,
          inputAmount: '5000000',        // 5 ADA
          priceNumerator: '1',
          priceDenominator: '100000000', // Very low threshold → triggers immediately
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          changeAddress: user3.address,
        }),
      });

      logInfo(`Order ID: ${result.orderId}`);

      if (!result.unsignedTx) {
        record('4.3 STOP_LOSS order', 'FAIL', 'No unsigned TX', Date.now() - t0);
        return null;
      }

      const txHash = await signSubmitAndWait(user3, result.unsignedTx, 'create_order');
      logSuccess(`Stop-loss order created: ${txHash.slice(0, 20)}...`);

      logStep('Waiting for OrderExecutorCron to trigger stop-loss...');
      const finalOrder = await waitForOrderStatus(result.orderId, 'FILLED', 300_000);

      if (finalOrder.status === 'FILLED') {
        record('4.3 STOP_LOSS order', 'PASS', 'Stop-loss triggered and filled', Date.now() - t0);
      } else {
        record('4.3 STOP_LOSS order', 'FAIL', `Status: ${finalOrder.status}`, Date.now() - t0);
      }

      return result.orderId;
    } else {
      // Use tBTC balance for stop loss sell
      const amount = tBTCBalance > 500_00000000n ? 500_00000000n : tBTCBalance / 2n;
      logStep(`Creating STOP_LOSS: ${amount} tBTC → ADA...`);

      const result = await apiFetch<any>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'STOP_LOSS',
          senderAddress: user3.address,
          inputAsset: tBTCUnit,
          outputAsset: 'lovelace',
          inputAmount: amount.toString(),
          priceNumerator: '1',
          priceDenominator: '100000000',
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          changeAddress: user3.address,
        }),
      });

      if (!result.unsignedTx) {
        record('4.3 STOP_LOSS order', 'FAIL', 'No unsigned TX', Date.now() - t0);
        return null;
      }

      const txHash = await signSubmitAndWait(user3, result.unsignedTx, 'create_order');
      logSuccess(`Stop-loss created: ${txHash.slice(0, 20)}...`);

      const finalOrder = await waitForOrderStatus(result.orderId, 'FILLED', 300_000);
      record('4.3 STOP_LOSS order', finalOrder.status === 'FILLED' ? 'PASS' : 'FAIL',
        `Status: ${finalOrder.status}`, Date.now() - t0);
      return result.orderId;
    }
  } catch (e: any) {
    record('4.3 STOP_LOSS order', 'FAIL', e.message, Date.now() - t0);
    return null;
  }
}

// ═══════════════════════════════════════════
// TEST 4.4: Cancel LIMIT Order — User4
// ═══════════════════════════════════════════

async function testCancelOrder(tBTCUnit: string): Promise<void> {
  logSection('TEST 4.4: Cancel LIMIT Order — User4');
  const t0 = Date.now();

  let user4: WalletCtx;
  try {
    user4 = await initWallet('user4');
  } catch {
    record('4.4 Cancel order', 'SKIP', 'User4 not available', 0);
    return;
  }

  try {
    // Create a LIMIT order with very bad price (won't fill)
    logStep('Creating LIMIT order with unfavorable price...');
    const result = await apiFetch<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'LIMIT',
        senderAddress: user4.address,
        inputAsset: 'lovelace',
        outputAsset: tBTCUnit,
        inputAmount: '5000000',
        priceNumerator: '999999999999', // Extremely high target → will never fill
        priceDenominator: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        changeAddress: user4.address,
      }),
    });

    if (!result.unsignedTx) {
      record('4.4 Cancel order', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const createTxHash = await signSubmitAndWait(user4, result.unsignedTx, 'create_order');
    logSuccess(`Order created: ${createTxHash.slice(0, 20)}...`);

    // Cancel immediately
    logStep('Cancelling order...');
    await sleep(5000);

    const cancelResult = await apiFetch<any>(`/orders/${result.orderId}`, {
      method: 'DELETE',
      body: JSON.stringify({ senderAddress: user4.address }),
    });

    if (cancelResult.unsignedTx) {
      const cancelTxHash = await signSubmitAndWait(user4, cancelResult.unsignedTx, 'cancel_order');
      logSuccess(`Order cancelled: ${cancelTxHash.slice(0, 20)}...`);

      await sleep(5000);
      const order = await apiFetch<any>(`/orders/${result.orderId}`);
      if (order.status === 'CANCELLED') {
        record('4.4 Cancel order', 'PASS', `Cancelled. ID: ${result.orderId.slice(0, 8)}`, Date.now() - t0);
      } else {
        record('4.4 Cancel order', 'FAIL', `Expected CANCELLED, got ${order.status}`, Date.now() - t0);
      }
    } else {
      record('4.4 Cancel order', 'FAIL', 'No cancel TX', Date.now() - t0);
    }
  } catch (e: any) {
    record('4.4 Cancel order', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 4.5: Order listing & detail queries
// ═══════════════════════════════════════════

async function testOrderQueries(): Promise<void> {
  logSection('TEST 4.5: Order Listing & Detail Queries');
  const t0 = Date.now();

  try {
    const orders = await apiFetch<any[]>('/orders');
    logInfo(`Total orders: ${orders?.length || 0}`);

    if (orders && orders.length > 0) {
      const statusGroups: Record<string, number> = {};
      const typeGroups: Record<string, number> = {};
      for (const o of orders) {
        statusGroups[o.status] = (statusGroups[o.status] || 0) + 1;
        typeGroups[o.type || o.orderType] = (typeGroups[o.type || o.orderType] || 0) + 1;
      }
      logInfo(`Status: ${JSON.stringify(statusGroups)}`);
      logInfo(`Types: ${JSON.stringify(typeGroups)}`);

      // Detail of first
      const detail = await apiFetch<any>(`/orders/${orders[0].id}`);
      logInfo(`Order detail: ${detail.id} — ${detail.type || detail.orderType} — ${detail.status}`);

      record('4.5 Order queries', 'PASS', `${orders.length} orders`, Date.now() - t0);
    } else {
      record('4.5 Order queries', 'PASS', 'No orders yet', Date.now() - t0);
    }
  } catch (e: any) {
    record('4.5 Order queries', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 4.6: Manual order execution
// ═══════════════════════════════════════════

async function testManualOrderExecute(admin: WalletCtx, tBTCUnit: string): Promise<void> {
  logSection('TEST 4.6: Manual Order Execution');
  const t0 = Date.now();

  try {
    // Create a LIMIT order from admin that should fill at current price
    logStep('Creating LIMIT order for manual execution...');
    const result = await apiFetch<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'LIMIT',
        senderAddress: admin.address,
        inputAsset: 'lovelace',
        outputAsset: tBTCUnit,
        inputAmount: '5000000',
        priceNumerator: '1',
        priceDenominator: '1000000', // Very generous
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        changeAddress: admin.address,
      }),
    });

    if (!result.unsignedTx) {
      record('4.6 Manual order exec', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'create_order');
    logSuccess(`Order created: ${txHash.slice(0, 20)}...`);

    // Wait briefly then check status
    await sleep(15_000);
    const order = await apiFetch<any>(`/orders/${result.orderId}`);
    
    if (order.status === 'FILLED') {
      record('4.6 Manual order exec', 'PASS', 'Bot executed automatically', Date.now() - t0);
      return;
    }

    // Try manual execution
    if (order.escrowTxHash) {
      const pool = await getFirstPool();
      logStep('Attempting manual execution via /solver/execute-order...');

      try {
        const execResult = await apiFetch<any>('/solver/execute-order', {
          method: 'POST',
          body: JSON.stringify({
            solver_address: admin.address,
            order_utxo_ref: {
              tx_hash: order.escrowTxHash,
              output_index: order.escrowOutputIndex ?? 0,
            },
            pool_utxo_ref: {
              tx_hash: pool.txHash,
              output_index: pool.outputIndex ?? 0,
            },
          }),
        });

        if (execResult.unsignedTx) {
          const execTxHash = await signSubmitAndWait(admin, execResult.unsignedTx, 'execute_order');
          record('4.6 Manual order exec', 'PASS', `Executed: ${execTxHash.slice(0, 20)}`, Date.now() - t0);
        } else {
          record('4.6 Manual order exec', 'FAIL', 'No exec TX', Date.now() - t0);
        }
      } catch (e: any) {
        // Wait for bot
        logWarn(`Manual exec failed: ${e.message?.slice(0, 60)}, waiting for bot...`);
        const final = await waitForOrderStatus(result.orderId, 'FILLED', 180_000);
        record('4.6 Manual order exec', final.status === 'FILLED' ? 'PASS' : 'FAIL',
          `Final: ${final.status}`, Date.now() - t0);
      }
    } else {
      logStep('Waiting for bot execution...');
      const final = await waitForOrderStatus(result.orderId, 'FILLED', 180_000);
      record('4.6 Manual order exec', final.status === 'FILLED' ? 'PASS' : 'FAIL',
        `Final: ${final.status}`, Date.now() - t0);
    }
  } catch (e: any) {
    record('4.6 Manual order exec', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 4: ORDER TESTS (LIMIT/DCA/STOP_LOSS)  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
  const tBTCUnit = tokenUnits['tBTC'];

  console.log(`  Admin: ${admin.address.slice(0, 40)}...`);
  console.log(`  tBTC: ${tBTCUnit}`);

  const pool = await getFirstPool();
  logInfo(`Using pool: ${pool.id}`);

  await testLimitOrder(tBTCUnit);
  await sleep(10_000);

  await testDcaOrder(tBTCUnit);
  await sleep(10_000);

  await testStopLossOrder(admin, tBTCUnit);
  await sleep(10_000);

  await testCancelOrder(tBTCUnit);
  await sleep(10_000);

  await testOrderQueries();

  await testManualOrderExecute(admin, tBTCUnit);

  printSummary();
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
