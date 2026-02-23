/**
 * ═══════════════════════════════════════════════════════════════════
 * FULL SYSTEM CLEANUP — SolverNet DEX
 * ═══════════════════════════════════════════════════════════════════
 *
 * Complete cleanup before E2E testing:
 *   1. Query UTxOs at ALL known script addresses (old + new validators)
 *   2. Attempt to reclaim/cancel all escrow/order/pool UTxOs via backend API
 *   3. Burn all test tokens owned by all wallets
 *   4. Reset database (delete all records)
 *   5. Verify clean state
 *
 * This script addresses the fact that smart contracts were recompiled
 * (new validator hashes → new script addresses), so UTxOs may exist
 * at BOTH old and new addresses.
 *
 * Usage:
 *   npx tsx src/full-cleanup.ts
 *   npx tsx src/full-cleanup.ts --dry-run
 *   npx tsx src/full-cleanup.ts --skip-burn
 *
 * Requires: T_WALLET_SEED, BLOCKFROST_URL, BLOCKFROST_PROJECT_ID, API_BASE
 */
import 'dotenv/config';
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
  type Script,
  type LucidEvolution,
  type UTxO,
} from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

// ─── Config ──────────────────────────────────
const args = parseArgs();
const DRY_RUN = args['dry-run'] === 'true';
const SKIP_BURN = args['skip-burn'] === 'true';

const NETWORK = (process.env.NETWORK || process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod';
const BF_URL = requireEnv('BLOCKFROST_URL');
const BF_KEY = requireEnv('BLOCKFROST_PROJECT_ID');

// All known script addresses (old validators + new validators after recompilation)
const SCRIPT_ADDRESSES = {
  // New addresses (from recompiled plutus.json — current)
  escrow_new: process.env.ESCROW_SCRIPT_ADDRESS || '',
  pool_new: process.env.POOL_SCRIPT_ADDRESS || '',
  // Old addresses (before audit fix recompilation)
  escrow_old: 'addr_test1wr679s5yp7jg2yem96ljkzyuwcw795mw2nm3lz3yd4jy5ysvw6ut9',
  pool_old: 'addr_test1wrurs8zeaqm7atrsdldaltervfp59ztrzemxf9rskyumdxgrq8j58',
};

// All wallet seeds for multi-wallet cleanup
const ALL_SEEDS = [
  { name: 'Admin/Solver', envKey: 'T_WALLET_SEED' },
  { name: 'User2', envKey: 'T_WALLET_SEED2' },
  { name: 'User3 (MNEMONIC0)', envKey: 'MNEMONIC0' },
  { name: 'User4 (MNEMONIC1)', envKey: 'MNEMONIC1' },
  { name: 'User5 (MNEMONIC2)', envKey: 'MNEMONIC2' },
  { name: 'User6 (MNEMONIC3)', envKey: 'MNEMONIC3' },
  { name: 'User7 (MNEMONIC4)', envKey: 'MNEMONIC4' },
].filter(w => process.env[w.envKey]);

// Helpers
function textToHex(t: string): string { return Buffer.from(t, 'utf-8').toString('hex'); }
function hexToText(h: string): string { try { return Buffer.from(h, 'hex').toString('utf-8'); } catch { return h; } }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function buildUniquePolicy(paymentKeyHash: string, slot: number): { script: Script; policyId: string } {
  const slotHex = slot.toString(16).padStart(8, '0');
  const cbor = `8201828200581c${paymentKeyHash}82041a${slotHex}`;
  const script: Script = { type: 'Native', script: cbor };
  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

async function waitTx(lucid: LucidEvolution, txHash: string, maxWait = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const ok = await lucid.awaitTx(txHash, 5000);
      if (ok) return true;
    } catch { /* not yet */ }
    await sleep(3000);
  }
  return false;
}

let totalReclaimed = 0;
let totalBurned = 0;
let totalErrors = 0;

// ═══════════════════════════════════════════
// STEP 1: Scan & reclaim contract UTxOs
// ═══════════════════════════════════════════

async function scanAndReclaimContractUtxos(lucid: LucidEvolution, adminAddress: string): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  console.log('  STEP 1: Scan & Reclaim Contract UTxOs');
  console.log('─'.repeat(60));

  const addressPairs: [string, string][] = [
    ['Escrow (NEW)', SCRIPT_ADDRESSES.escrow_new],
    ['Pool (NEW)', SCRIPT_ADDRESSES.pool_new],
    ['Escrow (OLD)', SCRIPT_ADDRESSES.escrow_old],
    ['Pool (OLD)', SCRIPT_ADDRESSES.pool_old],
  ].filter(([, addr]) => addr) as [string, string][];

  // Deduplicate in case old = new
  const seen = new Set<string>();
  const uniquePairs: [string, string][] = [];
  for (const [label, addr] of addressPairs) {
    if (!seen.has(addr)) {
      seen.add(addr);
      uniquePairs.push([label, addr]);
    }
  }

  for (const [label, scriptAddr] of uniquePairs) {
    console.log(`\n  📍 ${label}: ${scriptAddr.slice(0, 30)}...`);

    let utxos: UTxO[];
    try {
      utxos = await lucid.utxosAt(scriptAddr);
    } catch (e: any) {
      console.log(`    ⚠️  Cannot query: ${e.message.slice(0, 80)}`);
      continue;
    }

    if (utxos.length === 0) {
      console.log('    ✅ No UTxOs — clean');
      continue;
    }

    console.log(`    Found ${utxos.length} UTxO(s):`);
    for (const u of utxos) {
      const ada = Number(u.assets['lovelace'] || 0n) / 1_000_000;
      const tokens = Object.keys(u.assets).filter(k => k !== 'lovelace').length;
      console.log(`      ${u.txHash.slice(0, 16)}...#${u.outputIndex} — ${ada.toFixed(2)} ADA, ${tokens} token type(s)`);
    }

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would attempt to reclaim ${utxos.length} UTxO(s)`);
      continue;
    }

    // Try reclaiming each UTxO via backend API
    for (const utxo of utxos) {
      const utxoRef = `${utxo.txHash}#${utxo.outputIndex}`;
      console.log(`    Reclaiming ${utxoRef.slice(0, 20)}...`);

      // Strategy 1: Try portfolio/build-action RECLAIM
      try {
        const res = await apiFetch<any>('/portfolio/build-action', {
          method: 'POST',
          body: JSON.stringify({
            wallet_address: adminAddress,
            utxo_ref: utxoRef,
            action_type: 'RECLAIM',
          }),
        });

        if (res.unsignedTx) {
          const signed = await lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
          const txHash = await signed.submit();
          console.log(`      ✅ Reclaimed via RECLAIM: ${txHash.slice(0, 20)}`);
          await waitTx(lucid, txHash, 90_000);
          totalReclaimed++;
          continue;
        }
      } catch (e: any) {
        // Strategy 2: Try CANCEL
        try {
          const res2 = await apiFetch<any>('/portfolio/build-action', {
            method: 'POST',
            body: JSON.stringify({
              wallet_address: adminAddress,
              utxo_ref: utxoRef,
              action_type: 'CANCEL',
            }),
          });

          if (res2.unsignedTx) {
            const signed = await lucid.fromTx(res2.unsignedTx).sign.withWallet().complete();
            const txHash = await signed.submit();
            console.log(`      ✅ Reclaimed via CANCEL: ${txHash.slice(0, 20)}`);
            await waitTx(lucid, txHash, 90_000);
            totalReclaimed++;
            continue;
          }
        } catch (e2: any) {
          console.log(`      ⚠️  Cannot reclaim: ${e2.message.slice(0, 80)}`);
          totalErrors++;
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
// STEP 2: Burn test tokens from all wallets
// ═══════════════════════════════════════════

async function burnTestTokensAllWallets(): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  console.log('  STEP 2: Burn Test Tokens From All Wallets');
  console.log('─'.repeat(60));

  if (SKIP_BURN) {
    console.log('  ⏭️  Skipped via --skip-burn');
    return;
  }

  for (const walletDef of ALL_SEEDS) {
    const seed = process.env[walletDef.envKey]!;
    console.log(`\n  👛 ${walletDef.name}:`);

    try {
      const lucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
      lucid.selectWallet.fromSeed(seed);
      const address = await lucid.wallet().address();
      const keyHash = getAddressDetails(address).paymentCredential!.hash;

      const utxos = await lucid.utxosAt(address);

      // Collect all non-ADA assets
      const assetsMap = new Map<string, bigint>();
      for (const u of utxos) {
        for (const [unit, qty] of Object.entries(u.assets)) {
          if (unit === 'lovelace') continue;
          assetsMap.set(unit, (assetsMap.get(unit) || 0n) + (qty as bigint));
        }
      }

      if (assetsMap.size === 0) {
        console.log('    ✅ No native tokens — clean');
        continue;
      }

      console.log(`    Found ${assetsMap.size} token type(s)`);

      // Try to find minting scripts (brute-force slot 0..200)
      const burnBatches: { unit: string; qty: bigint; script: Script }[] = [];
      for (const [unit, qty] of assetsMap) {
        const policyId = unit.slice(0, 56);

        let found = false;
        for (let slot = 0; slot < 200; slot++) {
          const { script, policyId: derived } = buildUniquePolicy(keyHash, slot);
          if (derived === policyId) {
            burnBatches.push({ unit, qty, script });
            const name = hexToText(unit.slice(56));
            console.log(`    ${name}: ${qty} (slot=${slot})`);
            found = true;
            break;
          }
        }

        if (!found) {
          // Try all OTHER wallet keyhashes in case token was sent from another wallet
          for (const otherDef of ALL_SEEDS) {
            if (otherDef.envKey === walletDef.envKey) continue;
            const otherSeed = process.env[otherDef.envKey]!;
            const otherLucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
            otherLucid.selectWallet.fromSeed(otherSeed);
            const otherAddr = await otherLucid.wallet().address();
            const otherKeyHash = getAddressDetails(otherAddr).paymentCredential!.hash;
            for (let slot = 0; slot < 200; slot++) {
              const { policyId: derived } = buildUniquePolicy(otherKeyHash, slot);
              if (derived === policyId) {
                const name = hexToText(unit.slice(56));
                console.log(`    ${name}: ${qty} — minted by ${otherDef.name}, cannot burn from here`);
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (!found) {
            const name = hexToText(unit.slice(56));
            console.log(`    ${name}: ${qty} — unknown policy, cannot burn`);
          }
        }
      }

      if (burnBatches.length === 0) {
        console.log('    ✅ No burnable tokens found');
        continue;
      }

      if (DRY_RUN) {
        console.log(`    [DRY RUN] Would burn ${burnBatches.length} token type(s)`);
        continue;
      }

      // Burn in batches of 10
      const BATCH = 10;
      for (let i = 0; i < burnBatches.length; i += BATCH) {
        const batch = burnBatches.slice(i, i + BATCH);
        try {
          let tx = lucid.newTx();
          for (const { unit, qty, script } of batch) {
            tx = tx.mintAssets({ [unit]: -qty }).attach.MintingPolicy(script);
          }
          const completed = await tx.complete({ changeAddress: address });
          const signed = await completed.sign.withWallet().complete();
          const txHash = await signed.submit();
          console.log(`    ✅ Burn TX: ${txHash.slice(0, 20)}...`);
          await waitTx(lucid, txHash, 90_000);
          totalBurned += batch.length;
        } catch (e: any) {
          console.log(`    ❌ Burn failed: ${e.message.slice(0, 80)}`);
          totalErrors++;
        }
      }
    } catch (e: any) {
      console.log(`    ❌ Wallet error: ${e.message.slice(0, 80)}`);
      totalErrors++;
    }
  }
}

// ═══════════════════════════════════════════
// STEP 3: Reset Database
// ═══════════════════════════════════════════

async function resetDatabase(): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  console.log('  STEP 3: Reset Database');
  console.log('─'.repeat(60));

  const adminAddress = process.env.ADMIN_ADDRESS || process.env.T_addr1 || '';

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would delete all DB records');
    return;
  }

  try {
    const res = await apiFetch<any>('/admin/reset-db', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: adminAddress,
        confirm: 'RESET_ALL_DATA',
      }),
    });

    if (res.deleted) {
      console.log('  ✅ Database reset complete:');
      for (const [table, count] of Object.entries(res.deleted)) {
        console.log(`     ${table}: ${count} rows deleted`);
      }
    } else {
      console.log('  ✅ Database reset response:', JSON.stringify(res));
    }
  } catch (e: any) {
    console.log(`  ❌ Database reset failed: ${e.message}`);
    totalErrors++;
  }
}

// ═══════════════════════════════════════════
// STEP 4: Verify Clean State
// ═══════════════════════════════════════════

async function verifyCleanState(lucid: LucidEvolution, address: string): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  console.log('  STEP 4: Verify Clean State');
  console.log('─'.repeat(60));

  // Check wallet
  const utxos = await lucid.utxosAt(address);
  const ada = utxos.reduce((s, u) => s + (u.assets['lovelace'] || 0n), 0n);
  const tokens = new Set<string>();
  for (const u of utxos) {
    for (const unit of Object.keys(u.assets)) {
      if (unit !== 'lovelace') tokens.add(unit);
    }
  }
  console.log(`  Wallet: ${(Number(ada) / 1e6).toFixed(2)} ADA, ${tokens.size} token types, ${utxos.length} UTxOs`);

  // Check script addresses
  for (const [label, addr] of [
    ['Escrow (new)', SCRIPT_ADDRESSES.escrow_new],
    ['Pool (new)', SCRIPT_ADDRESSES.pool_new],
  ] as const) {
    if (!addr) continue;
    try {
      const su = await lucid.utxosAt(addr);
      const status = su.length === 0 ? '✅ Clean' : `⚠️  ${su.length} UTxO(s) remain`;
      console.log(`  ${label}: ${status}`);
    } catch (e: any) {
      console.log(`  ${label}: ⚠️  Cannot query`);
    }
  }

  // Check backend DB
  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    console.log(`  DB: pools=${analytics.totalPools}, intents=${analytics.totalIntents}, filled=${analytics.intentsFilled}`);
    if (analytics.totalPools === 0 && analytics.totalIntents === 0) {
      console.log('  ✅ Database is clean');
    } else {
      console.log('  ⚠️  Database still has data');
    }
  } catch (e: any) {
    console.log(`  ⚠️  Cannot verify DB: ${e.message.slice(0, 50)}`);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  const t0 = Date.now();

  console.log('\n' + '█'.repeat(60));
  console.log('  ██  FULL SYSTEM CLEANUP — SolverNet DEX  ██');
  console.log('█'.repeat(60));
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🔥 LIVE'}`);
  console.log(`  Network: ${NETWORK}`);
  console.log(`  Backend: ${process.env.API_BASE || 'http://localhost:3001'}`);
  console.log(`  Wallets: ${ALL_SEEDS.length}`);
  console.log(`  Script addrs: old escrow/pool + new escrow/pool`);

  // Check backend reachable
  try {
    await apiFetch<any>('/health');
    console.log('  Backend: ✅ Reachable');
  } catch {
    console.error('\n  ❌ Backend not reachable! Start it first: cd backend && pnpm dev');
    process.exit(1);
  }

  // Init admin wallet
  const adminSeed = requireEnv('T_WALLET_SEED');
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
  lucid.selectWallet.fromSeed(adminSeed);
  const address = await lucid.wallet().address();
  console.log(`  Admin: ${address.slice(0, 40)}...`);

  // Execute steps
  await scanAndReclaimContractUtxos(lucid, address);
  await burnTestTokensAllWallets();
  await resetDatabase();
  await verifyCleanState(lucid, address);

  // Summary
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '█'.repeat(60));
  console.log(`  ✅ Cleanup complete in ${elapsed}s`);
  console.log(`     Reclaimed: ${totalReclaimed} UTxO(s)`);
  console.log(`     Burned: ${totalBurned} token type(s)`);
  console.log(`     Errors: ${totalErrors}`);
  console.log('█'.repeat(60) + '\n');

  if (totalErrors > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
