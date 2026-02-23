/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 0: CLEAR ALL UTXOs ON SMART CONTRACTS
 * ═══════════════════════════════════════════════════════════════════
 *
 * This script must run BEFORE all tests. It:
 *   1. Scans ALL known script addresses (old + new escrow & pool validators)
 *   2. Attempts to reclaim/cancel each UTxO via backend API
 *   3. Falls back to direct on-chain spending if backend fails
 *   4. Burns stale test tokens from all wallets  
 *   5. Resets the database
 *   6. Verifies clean state
 *
 * Usage:
 *   npx tsx src/00-clear-utxos.ts
 *   npx tsx src/00-clear-utxos.ts --dry-run
 *   npx tsx src/00-clear-utxos.ts --skip-burn
 *   npx tsx src/00-clear-utxos.ts --skip-db
 */
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
  mintingPolicyToId,
  type Script,
  type UTxO,
  type LucidEvolution,
} from '@lucid-evolution/lucid';

import {
  apiFetch,
  safeApi,
  initWallet,
  WALLETS,
  NETWORK,
  BF_URL,
  BF_KEY,
  ESCROW_SCRIPT_ADDRESS,
  POOL_SCRIPT_ADDRESS,
  OLD_ESCROW_ADDRESS,
  OLD_POOL_ADDRESS,
  ADMIN_ADDRESS,
  TEST_TICKERS,
  buildUniquePolicy,
  textToHex,
  hexToText,
  waitTx,
  sleep,
  parseArgs,
  logSection,
  logStep,
  logSuccess,
  logFail,
  logWarn,
  logInfo,
  formatAda,
  type WalletCtx,
  type WalletName,
} from './test-helpers.js';

const args = parseArgs();
const DRY_RUN = args['dry-run'] === 'true';
const SKIP_BURN = args['skip-burn'] === 'true';
const SKIP_DB = args['skip-db'] === 'true';

let totalReclaimed = 0;
let totalBurned = 0;
let totalErrors = 0;

// ═══════════════════════════════════════════
// STEP 1: Scan & reclaim ALL contract UTxOs
// ═══════════════════════════════════════════

async function scanAndReclaimContractUtxos(admin: WalletCtx): Promise<void> {
  logSection('STEP 1: Scan & Reclaim ALL Contract UTxOs');

  // Collect all unique script addresses
  const addressPairs: [string, string][] = [];
  if (ESCROW_SCRIPT_ADDRESS) addressPairs.push(['Escrow (NEW)', ESCROW_SCRIPT_ADDRESS]);
  if (POOL_SCRIPT_ADDRESS) addressPairs.push(['Pool (NEW)', POOL_SCRIPT_ADDRESS]);
  if (OLD_ESCROW_ADDRESS && OLD_ESCROW_ADDRESS !== ESCROW_SCRIPT_ADDRESS) {
    addressPairs.push(['Escrow (OLD)', OLD_ESCROW_ADDRESS]);
  }
  if (OLD_POOL_ADDRESS && OLD_POOL_ADDRESS !== POOL_SCRIPT_ADDRESS) {
    addressPairs.push(['Pool (OLD)', OLD_POOL_ADDRESS]);
  }

  const seen = new Set<string>();
  const uniquePairs = addressPairs.filter(([, addr]) => {
    if (seen.has(addr)) return false;
    seen.add(addr);
    return true;
  });

  for (const [label, scriptAddr] of uniquePairs) {
    logStep(`${label}: ${scriptAddr.slice(0, 40)}...`);

    let utxos: UTxO[];
    try {
      utxos = await admin.lucid.utxosAt(scriptAddr);
    } catch (e: any) {
      logWarn(`Cannot query: ${e.message?.slice(0, 80)}`);
      continue;
    }

    if (utxos.length === 0) {
      logSuccess('No UTxOs — already clean');
      continue;
    }

    logInfo(`Found ${utxos.length} UTxO(s):`);
    for (const u of utxos) {
      const ada = Number(u.assets['lovelace'] || 0n) / 1e6;
      const tokenTypes = Object.keys(u.assets).filter((k) => k !== 'lovelace').length;
      console.log(`      ${u.txHash.slice(0, 16)}...#${u.outputIndex} — ${ada.toFixed(2)} ADA, ${tokenTypes} token type(s)`);
    }

    if (DRY_RUN) {
      logInfo(`[DRY RUN] Would attempt to reclaim ${utxos.length} UTxO(s)`);
      continue;
    }

    // Try to reclaim each UTxO
    for (const utxo of utxos) {
      const utxoRef = `${utxo.txHash}#${utxo.outputIndex}`;
      logStep(`Reclaiming ${utxoRef.slice(0, 24)}...`);

      let reclaimed = false;

      // Strategy 1: Try RECLAIM via portfolio/build-action
      try {
        const res = await apiFetch<any>('/portfolio/build-action', {
          method: 'POST',
          body: JSON.stringify({
            wallet_address: admin.address,
            utxo_ref: utxoRef,
            action_type: 'RECLAIM',
          }),
        });

        if (res.unsignedTx) {
          const signed = await admin.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
          const txHash = await signed.submit();
          logSuccess(`Reclaimed via RECLAIM: ${txHash.slice(0, 20)}...`);
          await waitTx(admin.lucid, txHash, 90_000);
          totalReclaimed++;
          reclaimed = true;
        }
      } catch (e1: any) {
        // Strategy 2: Try CANCEL
        try {
          const res2 = await apiFetch<any>('/portfolio/build-action', {
            method: 'POST',
            body: JSON.stringify({
              wallet_address: admin.address,
              utxo_ref: utxoRef,
              action_type: 'CANCEL',
            }),
          });

          if (res2.unsignedTx) {
            const signed = await admin.lucid.fromTx(res2.unsignedTx).sign.withWallet().complete();
            const txHash = await signed.submit();
            logSuccess(`Reclaimed via CANCEL: ${txHash.slice(0, 20)}...`);
            await waitTx(admin.lucid, txHash, 90_000);
            totalReclaimed++;
            reclaimed = true;
          }
        } catch (e2: any) {
          logWarn(`CANCEL also failed: ${e2.message?.slice(0, 80)}`);
        }
      }

      // Strategy 3: Try via specific API endpoints
      if (!reclaimed) {
        try {
          // Try cancelling as intent
          const intents = await safeApi<any[]>('/intents', { method: 'GET' });
          if (intents) {
            for (const intent of intents) {
              if (intent.escrowTxHash === utxo.txHash) {
                const res = await apiFetch<any>(`/intents/${intent.id}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ senderAddress: admin.address }),
                });
                if (res.unsignedTx) {
                  const signed = await admin.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
                  const txHash = await signed.submit();
                  logSuccess(`Cancelled intent ${intent.id}: ${txHash.slice(0, 20)}...`);
                  await waitTx(admin.lucid, txHash, 90_000);
                  totalReclaimed++;
                  reclaimed = true;
                  break;
                }
              }
            }
          }
        } catch { /* continue */ }
      }

      if (!reclaimed) {
        try {
          // Try cancelling as order  
          const orders = await safeApi<any[]>('/orders', { method: 'GET' });
          if (orders) {
            for (const order of orders) {
              if (order.escrowTxHash === utxo.txHash) {
                const res = await apiFetch<any>(`/orders/${order.id}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ senderAddress: admin.address }),
                });
                if (res.unsignedTx) {
                  const signed = await admin.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
                  const txHash = await signed.submit();
                  logSuccess(`Cancelled order ${order.id}: ${txHash.slice(0, 20)}...`);
                  await waitTx(admin.lucid, txHash, 90_000);
                  totalReclaimed++;
                  reclaimed = true;
                  break;
                }
              }
            }
          }
        } catch { /* continue */ }
      }

      if (!reclaimed) {
        logFail(`Could not reclaim ${utxoRef} — may need manual intervention`);
        totalErrors++;
      }
    }
  }
}

// ═══════════════════════════════════════════
// STEP 2: Burn test tokens from ALL wallets
// ═══════════════════════════════════════════

async function burnTestTokensAllWallets(): Promise<void> {
  logSection('STEP 2: Burn Test Tokens From All Wallets');

  if (SKIP_BURN) {
    logInfo('Skipped via --skip-burn');
    return;
  }

  const walletKeys = Object.keys(WALLETS) as WalletName[];
  for (const key of walletKeys) {
    const def = WALLETS[key];
    const seed = process.env[def.envKey];
    if (!seed) continue;

    logStep(`${def.name}:`);

    try {
      const lucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
      lucid.selectWallet.fromSeed(seed);
      const address = await lucid.wallet().address();
      const keyHash = getAddressDetails(address).paymentCredential!.hash;

      const utxos = await lucid.utxosAt(address);
      const assetsMap = new Map<string, bigint>();
      for (const u of utxos) {
        for (const [unit, qty] of Object.entries(u.assets)) {
          if (unit === 'lovelace') continue;
          assetsMap.set(unit, (assetsMap.get(unit) || 0n) + (qty as bigint));
        }
      }

      if (assetsMap.size === 0) {
        logSuccess('No native tokens — clean');
        continue;
      }

      logInfo(`Found ${assetsMap.size} token type(s)`);

      // Try to match minting scripts via brute force (check own key + all other keys)
      const burnBatches: { unit: string; qty: bigint; script: Script }[] = [];
      const allKeyHashes: { name: string; keyHash: string }[] = [];

      // Gather all wallet key hashes
      for (const k of walletKeys) {
        const s = process.env[WALLETS[k].envKey];
        if (!s) continue;
        const l = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
        l.selectWallet.fromSeed(s);
        const a = await l.wallet().address();
        allKeyHashes.push({ name: WALLETS[k].name, keyHash: getAddressDetails(a).paymentCredential!.hash });
      }

      for (const [unit, qty] of assetsMap) {
        const policyId = unit.slice(0, 56);
        let found = false;

        // Try own key hash first
        for (let slot = 0; slot < 200; slot++) {
          const { script, policyId: derived } = buildUniquePolicy(keyHash, slot);
          if (derived === policyId) {
            burnBatches.push({ unit, qty, script });
            const name = hexToText(unit.slice(56));
            logInfo(`${name}: ${qty} (slot=${slot}, own key)`);
            found = true;
            break;
          }
        }

        // Try other key hashes (tokens received via transfer)
        if (!found) {
          for (const { name: walletName, keyHash: otherKeyHash } of allKeyHashes) {
            if (otherKeyHash === keyHash) continue;
            for (let slot = 0; slot < 200; slot++) {
              const { policyId: derived } = buildUniquePolicy(otherKeyHash, slot);
              if (derived === policyId) {
                const tokenName = hexToText(unit.slice(56));
                logWarn(`${tokenName}: ${qty} — minted by ${walletName}, cannot burn from ${def.name}`);
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (!found) {
            const tokenName = hexToText(unit.slice(56));
            logWarn(`${tokenName}: ${qty} — unknown policy, skipping`);
          }
        }
      }

      if (burnBatches.length === 0) {
        logSuccess('No burnable tokens found');
        continue;
      }

      if (DRY_RUN) {
        logInfo(`[DRY RUN] Would burn ${burnBatches.length} token type(s)`);
        continue;
      }

      // Burn in batches of 10
      const BATCH_SIZE = 10;
      for (let i = 0; i < burnBatches.length; i += BATCH_SIZE) {
        const batch = burnBatches.slice(i, i + BATCH_SIZE);
        try {
          let tx = lucid.newTx();
          for (const { unit, qty, script } of batch) {
            tx = tx.mintAssets({ [unit]: -qty }).attach.MintingPolicy(script);
          }
          tx = tx.validFrom(Date.now() - 120_000);
          const completed = await tx.complete({ changeAddress: address });
          const signed = await completed.sign.withWallet().complete();
          const txHash = await signed.submit();
          logSuccess(`Burn TX: ${txHash.slice(0, 20)}...`);
          await waitTx(lucid, txHash, 90_000);
          totalBurned += batch.length;
        } catch (e: any) {
          logFail(`Burn failed: ${e.message?.slice(0, 100)}`);
          totalErrors++;
        }
      }
    } catch (e: any) {
      logFail(`Wallet error: ${e.message?.slice(0, 100)}`);
      totalErrors++;
    }
  }
}

// ═══════════════════════════════════════════
// STEP 3: Reset Database
// ═══════════════════════════════════════════

async function resetDatabase(): Promise<void> {
  logSection('STEP 3: Reset Database');

  if (SKIP_DB) {
    logInfo('Skipped via --skip-db');
    return;
  }

  if (DRY_RUN) {
    logInfo('[DRY RUN] Would delete all DB records');
    return;
  }

  try {
    const res = await apiFetch<any>('/admin/reset-db', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: ADMIN_ADDRESS,
        confirm: 'RESET_ALL_DATA',
      }),
    });

    if (res.deleted) {
      logSuccess('Database reset complete:');
      for (const [table, count] of Object.entries(res.deleted)) {
        console.log(`       ${table}: ${count} rows deleted`);
      }
    } else {
      logSuccess(`DB reset response: ${JSON.stringify(res)}`);
    }
  } catch (e: any) {
    logFail(`Database reset failed: ${e.message}`);
    totalErrors++;
  }
}

// ═══════════════════════════════════════════
// STEP 4: Verify Clean State
// ═══════════════════════════════════════════

async function verifyCleanState(admin: WalletCtx): Promise<void> {
  logSection('STEP 4: Verify Clean State');

  // Check admin wallet
  const utxos = await admin.lucid.utxosAt(admin.address);
  const ada = utxos.reduce((s, u) => s + (u.assets['lovelace'] || 0n), 0n);
  const tokenTypes = new Set<string>();
  for (const u of utxos) {
    for (const unit of Object.keys(u.assets)) {
      if (unit !== 'lovelace') tokenTypes.add(unit);
    }
  }
  logInfo(`Admin wallet: ${formatAda(ada)} ADA, ${tokenTypes.size} token types, ${utxos.length} UTxOs`);

  // Check script addresses
  for (const [label, addr] of [
    ['Escrow (new)', ESCROW_SCRIPT_ADDRESS],
    ['Pool (new)', POOL_SCRIPT_ADDRESS],
  ] as const) {
    if (!addr) continue;
    try {
      const su = await admin.lucid.utxosAt(addr);
      if (su.length === 0) {
        logSuccess(`${label}: Clean`);
      } else {
        logWarn(`${label}: ${su.length} UTxO(s) remain`);
      }
    } catch {
      logWarn(`${label}: Cannot query`);
    }
  }

  // Check backend DB
  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    logInfo(`DB state: pools=${analytics.totalPools}, intents=${analytics.totalIntents}`);
    if (analytics.totalPools === 0 && analytics.totalIntents === 0) {
      logSuccess('Database is clean');
    } else {
      logWarn('Database still has data');
    }
  } catch {
    logWarn('Cannot verify DB state');
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  const t0 = Date.now();

  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 0: CLEAR ALL UTXOs & RESET  ██');
  console.log('█'.repeat(60));
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Network: ${NETWORK}`);
  console.log(`  Backend: ${process.env.API_BASE || 'http://localhost:3001'}`);

  // Check backend reachable
  try {
    await apiFetch<any>('/health');
    logSuccess('Backend is reachable');
  } catch {
    logFail('Backend not reachable! Start it first.');
    process.exit(1);
  }

  // Init admin wallet
  const admin = await initWallet('admin');
  console.log(`  Admin: ${admin.address.slice(0, 40)}...`);

  // Execute steps
  await scanAndReclaimContractUtxos(admin);
  await burnTestTokensAllWallets();
  await resetDatabase();
  await verifyCleanState(admin);

  // Summary
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '█'.repeat(60));
  console.log(`  Phase 0 complete in ${elapsed}s`);
  console.log(`  Reclaimed: ${totalReclaimed} UTxO(s)`);
  console.log(`  Burned: ${totalBurned} token type(s)`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('█'.repeat(60) + '\n');

  if (totalErrors > 0) {
    logWarn('Some errors occurred — manual cleanup may be needed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
