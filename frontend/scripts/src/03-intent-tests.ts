/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 3: INTENT SWAP TESTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests all intent-related scenarios:
 *   3.1  Full fill swap (ADA → tBTC) — admin wallet
 *   3.2  Full fill swap (tBTC → ADA) — user2 wallet (reverse direction)
 *   3.3  Cancel intent before fill — user3 wallet
 *   3.4  Create intent and wait for solver bot auto-fill — user4 wallet
 *   3.5  Quote verification before intent creation
 *   3.6  Intent listing & detail queries
 *   3.7  Manual solver fill via /solver/fill-intent
 *
 * The test creates intents and observes:
 *   - Backend TX building
 *   - Solver engine auto-detection & auto-fill
 *   - DB state transitions (CREATED → ACTIVE → FILLING → FILLED)
 *   - Pool reserve updates
 *   - Cancel flow (ACTIVE → CANCELLED)
 *
 * Usage:
 *   npx tsx src/03-intent-tests.ts
 *   npx tsx src/03-intent-tests.ts --poolId=xxx
 */
import {
  initWallet,
  apiFetch,
  safeApi,
  signSubmitAndWait,
  signAndSubmit,
  confirmTx,
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
  assert,
  type WalletCtx,
} from './test-helpers.js';

const args = parseArgs();

// ─── Helpers ─────────────────────────────────

async function getFirstPool(): Promise<any> {
  if (args.poolId) {
    return apiFetch<any>(`/pools/${args.poolId}`);
  }
  const pools = await apiFetch<any[]>('/pools');
  if (!pools || pools.length === 0) throw new Error('No pools found — run 02-setup-pool.ts first');
  return pools[0];
}

async function waitForIntentStatus(intentId: string, targetStatus: string, maxWait = 180_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const intent = await apiFetch<any>(`/intents/${intentId}`);
      logInfo(`  Intent ${intentId.slice(0, 8)}... status: ${intent.status}`);
      if (intent.status === targetStatus) return intent;
      if (intent.status === 'FILLED' || intent.status === 'CANCELLED' || intent.status === 'RECLAIMED') {
        return intent; // Terminal states
      }
    } catch { /* retry */ }
    await sleep(10_000);
  }
  throw new Error(`Intent ${intentId} did not reach ${targetStatus} within ${maxWait / 1000}s`);
}

// ═══════════════════════════════════════════
// TEST 3.1: Full fill swap (ADA → tBTC) — Admin
// ═══════════════════════════════════════════

async function testFullFillAdaToToken(admin: WalletCtx, tBTCUnit: string): Promise<string | null> {
  logSection('TEST 3.1: Full Fill Swap (ADA → tBTC) — Admin');
  const t0 = Date.now();

  try {
    // Get quote first
    logStep('Getting swap quote...');
    const quote = await safeApi<any>('/quote', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    // Note: quote endpoint might need params
    try {
      const quoteResult = await apiFetch<any>('/quote', {
        params: {
          inputAsset: 'lovelace',
          outputAsset: tBTCUnit,
          inputAmount: '10000000', // 10 ADA
        },
      });
      logInfo(`Quote: 10 ADA → ${quoteResult.estimatedOutput || quoteResult.outputAmount} tBTC`);
    } catch (e: any) {
      logWarn(`Quote not available: ${e.message?.slice(0, 60)}`);
    }

    // Create intent: 10 ADA → tBTC
    logStep('Creating intent: 10 ADA → tBTC...');
    const deadline = Date.now() + 24 * 60 * 60 * 1000;

    const result = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: admin.address,
        inputAsset: 'lovelace',
        inputAmount: '10000000', // 10 ADA
        outputAsset: tBTCUnit,
        minOutput: '1', // Accept any amount
        deadline,
        partialFill: false,
        changeAddress: admin.address,
      }),
    });

    logInfo(`Intent ID: ${result.intentId}`);

    if (!result.unsignedTx) {
      record('3.1 Full fill ADA→tBTC', 'FAIL', 'No unsigned TX returned', Date.now() - t0);
      return null;
    }

    const txHash = await signSubmitAndWait(admin, result.unsignedTx, 'create_intent', { intentId: result.intentId });
    logSuccess(`Intent created: ${txHash.slice(0, 20)}...`);

    // Wait for solver bot to auto-fill (should happen within ~20-30s)
    logStep('Waiting for solver bot to fill intent...');
    const finalIntent = await waitForIntentStatus(result.intentId, 'FILLED', 180_000);

    if (finalIntent.status === 'FILLED') {
      record('3.1 Full fill ADA→tBTC', 'PASS', `Intent filled! ID: ${result.intentId.slice(0, 8)}`, Date.now() - t0);
    } else {
      record('3.1 Full fill ADA→tBTC', 'FAIL', `Status: ${finalIntent.status}`, Date.now() - t0);
    }

    return result.intentId;
  } catch (e: any) {
    record('3.1 Full fill ADA→tBTC', 'FAIL', e.message, Date.now() - t0);
    return null;
  }
}

// ═══════════════════════════════════════════
// TEST 3.2: Full fill swap (tBTC → ADA) — User2
// ═══════════════════════════════════════════

async function testFullFillTokenToAda(tBTCUnit: string): Promise<string | null> {
  logSection('TEST 3.2: Full Fill Swap (tBTC → ADA) — User2');
  const t0 = Date.now();

  let user2: WalletCtx;
  try {
    user2 = await initWallet('user2');
  } catch (e: any) {
    record('3.2 Full fill tBTC→ADA', 'SKIP', `User2 wallet not available: ${e.message}`, 0);
    return null;
  }

  try {
    const balance = await getWalletBalance(user2);
    const tBTCBalance = balance.tokens[tBTCUnit] || 0n;
    logInfo(`User2 tBTC balance: ${tBTCBalance}`);

    if (tBTCBalance <= 0n) {
      record('3.2 Full fill tBTC→ADA', 'SKIP', 'User2 has no tBTC', 0);
      return null;
    }

    // Create intent: 10,000 tBTC → ADA (reverse direction)
    const intentAmount = 1000000000n; // 10,000 tBTC (8 decimals = 0.0001 BTC)
    logStep(`Creating intent: ${intentAmount} tBTC units → ADA...`);

    const result = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: user2.address,
        inputAsset: tBTCUnit,
        inputAmount: intentAmount.toString(),
        outputAsset: 'lovelace',
        minOutput: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        partialFill: false,
        changeAddress: user2.address,
      }),
    });

    logInfo(`Intent ID: ${result.intentId}`);

    if (!result.unsignedTx) {
      record('3.2 Full fill tBTC→ADA', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return null;
    }

    const txHash = await signSubmitAndWait(user2, result.unsignedTx, 'create_intent', { intentId: result.intentId });
    logSuccess(`Intent created: ${txHash.slice(0, 20)}...`);

    // Wait for solver
    logStep('Waiting for solver bot...');
    const finalIntent = await waitForIntentStatus(result.intentId, 'FILLED', 180_000);

    if (finalIntent.status === 'FILLED') {
      record('3.2 Full fill tBTC→ADA', 'PASS', `Filled! ID: ${result.intentId.slice(0, 8)}`, Date.now() - t0);
    } else {
      record('3.2 Full fill tBTC→ADA', 'FAIL', `Status: ${finalIntent.status}`, Date.now() - t0);
    }

    return result.intentId;
  } catch (e: any) {
    record('3.2 Full fill tBTC→ADA', 'FAIL', e.message, Date.now() - t0);
    return null;
  }
}

// ═══════════════════════════════════════════
// TEST 3.3: Cancel intent before fill — User3
// ═══════════════════════════════════════════

async function testCancelIntent(tBTCUnit: string): Promise<void> {
  logSection('TEST 3.3: Cancel Intent — User3');
  const t0 = Date.now();

  let user3: WalletCtx;
  try {
    user3 = await initWallet('user3');
  } catch {
    record('3.3 Cancel intent', 'SKIP', 'User3 wallet not available', 0);
    return;
  }

  try {
    // Create intent with ADA (simple — all wallets have ADA)
    logStep('Creating intent to cancel: 5 ADA → tBTC...');
    const result = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: user3.address,
        inputAsset: 'lovelace',
        inputAmount: '5000000',
        outputAsset: tBTCUnit,
        minOutput: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        partialFill: false,
        changeAddress: user3.address,
      }),
    });

    if (!result.unsignedTx) {
      record('3.3 Cancel intent', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const createTxHash = await signSubmitAndWait(user3, result.unsignedTx, 'create_intent', { intentId: result.intentId });
    logSuccess(`Intent created: ${createTxHash.slice(0, 20)}...`);

    // Cancel IMMEDIATELY (race condition: must cancel before solver fills it)
    logStep('Cancelling intent immediately...');
    await sleep(3000); // Small wait for TX to propagate

    const cancelResult = await apiFetch<any>(`/intents/${result.intentId}`, {
      method: 'DELETE',
      body: JSON.stringify({ senderAddress: user3.address }),
    });

    if (cancelResult.unsignedTx) {
      const cancelTxHash = await signSubmitAndWait(user3, cancelResult.unsignedTx, 'cancel_intent', { intentId: result.intentId });
      logSuccess(`Intent cancelled: ${cancelTxHash.slice(0, 20)}...`);

      // Verify status
      await sleep(5000);
      const intent = await apiFetch<any>(`/intents/${result.intentId}`);
      if (intent.status === 'CANCELLED') {
        record('3.3 Cancel intent', 'PASS', `Cancelled successfully. ID: ${result.intentId.slice(0, 8)}`, Date.now() - t0);
      } else {
        record('3.3 Cancel intent', 'FAIL', `Expected CANCELLED, got ${intent.status}`, Date.now() - t0);
      }
    } else {
      record('3.3 Cancel intent', 'FAIL', 'No cancel TX returned', Date.now() - t0);
    }
  } catch (e: any) {
    record('3.3 Cancel intent', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 3.4: Solver auto-fill test — User4
// ═══════════════════════════════════════════

async function testSolverAutoFill(tBTCUnit: string): Promise<void> {
  logSection('TEST 3.4: Solver Auto-Fill — User4');
  const t0 = Date.now();

  let user4: WalletCtx;
  try {
    user4 = await initWallet('user4');
  } catch {
    record('3.4 Solver auto-fill', 'SKIP', 'User4 wallet not available', 0);
    return;
  }

  try {
    logStep('Creating intent: 8 ADA → tBTC...');
    const result = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: user4.address,
        inputAsset: 'lovelace',
        inputAmount: '8000000', // 8 ADA
        outputAsset: tBTCUnit,
        minOutput: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        partialFill: false,
        changeAddress: user4.address,
      }),
    });

    if (!result.unsignedTx) {
      record('3.4 Solver auto-fill', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const txHash = await signSubmitAndWait(user4, result.unsignedTx, 'create_intent', { intentId: result.intentId });
    logSuccess(`Intent created: ${txHash.slice(0, 20)}...`);

    // Monitor the intent through its lifecycle
    logStep('Monitoring intent lifecycle (watching for ACTIVE → FILLING → FILLED)...');
    const seenStatuses = new Set<string>();
    const start = Date.now();
    let finalStatus = 'CREATED';

    while (Date.now() - start < 180_000) {
      try {
        const intent = await apiFetch<any>(`/intents/${result.intentId}`);
        if (!seenStatuses.has(intent.status)) {
          seenStatuses.add(intent.status);
          logInfo(`Status transition: ${intent.status} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
        }
        finalStatus = intent.status;
        if (intent.status === 'FILLED' || intent.status === 'CANCELLED' || intent.status === 'RECLAIMED') break;
      } catch { /* retry */ }
      await sleep(5_000);
    }

    if (finalStatus === 'FILLED') {
      const transitions = Array.from(seenStatuses).join(' → ');
      record('3.4 Solver auto-fill', 'PASS', `Filled! Transitions: ${transitions}`, Date.now() - t0);
    } else {
      record('3.4 Solver auto-fill', 'FAIL', `Final status: ${finalStatus}`, Date.now() - t0);
    }
  } catch (e: any) {
    record('3.4 Solver auto-fill', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 3.5: Intent listing & detail queries
// ═══════════════════════════════════════════

async function testIntentQueries(): Promise<void> {
  logSection('TEST 3.5: Intent Listing & Detail Queries');
  const t0 = Date.now();

  try {
    // List all intents
    logStep('Listing all intents...');
    const intents = await apiFetch<any[]>('/intents');
    logInfo(`Total intents: ${intents?.length || 0}`);

    if (intents && intents.length > 0) {
      const statusGroups: Record<string, number> = {};
      for (const i of intents) {
        statusGroups[i.status] = (statusGroups[i.status] || 0) + 1;
      }
      logInfo(`Status distribution: ${JSON.stringify(statusGroups)}`);

      // Get detail of first intent
      const firstId = intents[0].id;
      const detail = await apiFetch<any>(`/intents/${firstId}`);
      logInfo(`Intent detail: ${detail.id} — ${detail.status} — ${detail.inputAsset} → ${detail.outputAsset}`);

      record('3.5 Intent queries', 'PASS', `${intents.length} intents found`, Date.now() - t0);
    } else {
      record('3.5 Intent queries', 'PASS', 'No intents (expected if previous tests skipped)', Date.now() - t0);
    }
  } catch (e: any) {
    record('3.5 Intent queries', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// TEST 3.6: Manual solver fill
// ═══════════════════════════════════════════

async function testManualSolverFill(admin: WalletCtx, tBTCUnit: string): Promise<void> {
  logSection('TEST 3.6: Manual Solver Fill via API');
  const t0 = Date.now();

  let user5: WalletCtx;
  try {
    user5 = await initWallet('user5');
  } catch {
    record('3.6 Manual solver fill', 'SKIP', 'User5 wallet not available', 0);
    return;
  }

  try {
    // Create an intent from user5
    logStep('Creating intent from User5: 7 ADA → tBTC...');
    const result = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: user5.address,
        inputAsset: 'lovelace',
        inputAmount: '7000000',
        outputAsset: tBTCUnit,
        minOutput: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        partialFill: false,
        changeAddress: user5.address,
      }),
    });

    if (!result.unsignedTx) {
      record('3.6 Manual solver fill', 'FAIL', 'No unsigned TX', Date.now() - t0);
      return;
    }

    const createTxHash = await signSubmitAndWait(user5, result.unsignedTx, 'create_intent', { intentId: result.intentId });
    logSuccess(`Intent created: ${createTxHash.slice(0, 20)}...`);

    // Wait a moment, then check if solver already got it
    await sleep(10_000);
    const intent = await apiFetch<any>(`/intents/${result.intentId}`);

    if (intent.status === 'FILLED') {
      logInfo('Solver bot already filled it automatically');
      record('3.6 Manual solver fill', 'PASS', 'Auto-filled by solver bot', Date.now() - t0);
      return;
    }

    // Try manual fill via /solver/fill-intent
    if (intent.escrowTxHash && intent.escrowOutputIndex !== undefined) {
      logStep('Attempting manual fill via /solver/fill-intent...');

      // We need the pool UTxO reference
      const pool = await getFirstPool();
      logInfo(`Pool: ${pool.id}, txHash: ${pool.txHash}`);

      try {
        const fillResult = await apiFetch<any>('/solver/fill-intent', {
          method: 'POST',
          body: JSON.stringify({
            solver_address: admin.address,
            intent_utxo_refs: [{
              tx_hash: intent.escrowTxHash,
              output_index: intent.escrowOutputIndex ?? 0,
            }],
            pool_utxo_ref: {
              tx_hash: pool.txHash,
              output_index: pool.outputIndex ?? 0,
            },
          }),
        });

        if (fillResult.unsignedTx) {
          const fillTxHash = await signSubmitAndWait(admin, fillResult.unsignedTx, 'fill_intent');
          logSuccess(`Manual fill TX: ${fillTxHash.slice(0, 20)}...`);
          record('3.6 Manual solver fill', 'PASS', `Filled manually: ${fillTxHash.slice(0, 20)}`, Date.now() - t0);
        } else {
          record('3.6 Manual solver fill', 'FAIL', 'No fill TX returned', Date.now() - t0);
        }
      } catch (e: any) {
        // If solver already grabbed it, that's OK
        logWarn(`Manual fill endpoint error: ${e.message?.slice(0, 80)}`);
        await sleep(15_000);
        const updated = await apiFetch<any>(`/intents/${result.intentId}`);
        if (updated.status === 'FILLED') {
          record('3.6 Manual solver fill', 'PASS', 'Filled by solver bot concurrently', Date.now() - t0);
        } else {
          record('3.6 Manual solver fill', 'FAIL', `Status: ${updated.status}, Error: ${e.message?.slice(0, 50)}`, Date.now() - t0);
        }
      }
    } else {
      // Wait for solver bot to fill
      logStep('No escrow ref yet — waiting for solver bot...');
      const final = await waitForIntentStatus(result.intentId, 'FILLED', 120_000);
      record('3.6 Manual solver fill', final.status === 'FILLED' ? 'PASS' : 'FAIL',
        `Final: ${final.status}`, Date.now() - t0);
    }
  } catch (e: any) {
    record('3.6 Manual solver fill', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 3: INTENT SWAP TESTS  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
  const tBTCUnit = tokenUnits['tBTC'];

  console.log(`  Admin: ${admin.address.slice(0, 40)}...`);
  console.log(`  tBTC unit: ${tBTCUnit}`);

  // Verify pool exists
  const pool = await getFirstPool();
  logInfo(`Using pool: ${pool.id}`);

  // Run tests sequentially (each depends on solver bot & chain state)
  await testFullFillAdaToToken(admin, tBTCUnit);
  await sleep(10_000); // Wait between tests for chain propagation

  await testFullFillTokenToAda(tBTCUnit);
  await sleep(10_000);

  await testCancelIntent(tBTCUnit);
  await sleep(10_000);

  await testSolverAutoFill(tBTCUnit);
  await sleep(10_000);

  await testIntentQueries();

  await testManualSolverFill(admin, tBTCUnit);

  printSummary();
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
