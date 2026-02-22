/**
 * System Reset — SolverNet DEX
 *
 * Performs a full system reset:
 * 1. Scan wallet for ALL native tokens and burn them (NOT ADA!)
 * 2. Scan escrow/pool script addresses and reclaim/spend all UTxOs
 * 3. Reset database (delete all intents, orders, pools, swaps, etc.)
 * 4. Verify clean state
 *
 * Usage:
 *   npx tsx src/system-reset.ts                    # Full reset
 *   npx tsx src/system-reset.ts --skip-chain       # DB only (no chain ops)
 *   npx tsx src/system-reset.ts --skip-db          # Chain only (no DB reset)
 *   npx tsx src/system-reset.ts --dry-run          # Show what would happen
 *
 * Environment:
 *   T_WALLET_SEED, BLOCKFROST_URL, BLOCKFROST_PROJECT_ID
 *   API_BASE (backend URL, default: http://localhost:3001)
 *   ESCROW_ADDRESS, POOL_ADDRESS (optional)
 */
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
  type Script,
  type UTxO,
} from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

// ─── Config ──────────────────────────────────
const args = parseArgs();
const skipChain = args['skip-chain'] === 'true';
const skipDb = args['skip-db'] === 'true';
const dryRun = args['dry-run'] === 'true';

function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

function hexToText(hex: string): string {
  try {
    return Buffer.from(hex, 'hex').toString('utf-8');
  } catch {
    return hex;
  }
}

// Known test tickers (must match mint-test-tokens.ts)
const TEST_TICKERS = ['tBTC', 'tUSDT', 'tPOLYGON', 'tNEAR', 'tSOL'];

/**
 * Rebuild the unique minting policy used by mint-test-tokens.ts
 * Each token uses slot = index as the unique differentiator.
 */
function buildUniquePolicy(paymentKeyHash: string, slot: number): { script: Script; policyId: string } {
  const slotHex = slot.toString(16).padStart(8, '0');
  const cbor = `8201828200581c${paymentKeyHash}82041a${slotHex}`;
  const script: Script = { type: 'Native', script: cbor };
  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

// ─── Phase 1: Burn ALL native tokens ─────────

async function burnAllTokens(lucid: any, address: string, paymentKeyHash: string): Promise<string[]> {
  console.log('\n🔥 Phase 1: Burn All Native Tokens');
  console.log('─'.repeat(50));

  const utxos: UTxO[] = await lucid.utxosAt(address);
  const txHashes: string[] = [];

  // Collect ALL non-ADA assets across all UTxOs
  const assetsToCheck = new Map<string, bigint>(); // unit → total qty
  for (const utxo of utxos) {
    for (const [unit, qty] of Object.entries(utxo.assets)) {
      if (unit === 'lovelace') continue;
      const current = assetsToCheck.get(unit) || 0n;
      assetsToCheck.set(unit, current + (qty as bigint));
    }
  }

  if (assetsToCheck.size === 0) {
    console.log('  ✅ No native tokens found — wallet is clean');
    return [];
  }

  console.log(`  Found ${assetsToCheck.size} distinct native token type(s)`);

  // Try to burn each token by finding its minting script
  // Strategy 1: Known test tokens (slot = index)
  // Strategy 2: Brute-force slot search (0..200)
  const burnBatches: Array<{ unit: string; qty: bigint; script: Script }> = [];

  for (const [unit, qty] of assetsToCheck) {
    const policyId = unit.slice(0, 56);
    const assetNameHex = unit.slice(56);
    const assetNameText = hexToText(assetNameHex);

    console.log(`  Checking: ${assetNameText || assetNameHex} (policy: ${policyId.slice(0, 16)}...) qty: ${qty}`);

    // Try to find matching script via brute force
    let found = false;
    for (let slot = 0; slot < 200; slot++) {
      const { script, policyId: derivedPolicy } = buildUniquePolicy(paymentKeyHash, slot);
      if (derivedPolicy === policyId) {
        burnBatches.push({ unit, qty, script });
        console.log(`    → Found script (slot=${slot}), will burn ${qty}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`    ⚠️  Cannot find minting script — may not be owned by this wallet. Skipping.`);
    }
  }

  if (burnBatches.length === 0) {
    console.log('  ✅ No burnable tokens found');
    return [];
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would burn ${burnBatches.length} token batch(es)`);
    return [];
  }

  // Burn in batches of max 10 (Cardano TX size limit)
  const BATCH_SIZE = 10;
  for (let i = 0; i < burnBatches.length; i += BATCH_SIZE) {
    const batch = burnBatches.slice(i, i + BATCH_SIZE);
    console.log(`  Building burn TX (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(burnBatches.length / BATCH_SIZE)})...`);

    try {
      let tx = lucid.newTx();
      for (const { unit, qty, script } of batch) {
        tx = tx.mintAssets({ [unit]: -qty }).attach.MintingPolicy(script);
      }

      const completed = await tx.complete({ changeAddress: address });
      const signed = await completed.sign.withWallet().complete();
      const txHash = await signed.submit();

      console.log(`  ✅ Burn TX: ${txHash}`);
      txHashes.push(txHash);

      // Wait for confirmation
      console.log('  Waiting for confirmation...');
      await waitForTx(lucid, txHash);
    } catch (err) {
      console.log(`  ❌ Burn batch failed: ${(err as Error).message}`);
    }
  }

  return txHashes;
}

// ─── Phase 2: Spend Escrow/Pool UTxOs ────────

async function reclaimContractUtxos(lucid: any, address: string): Promise<string[]> {
  console.log('\n🏦 Phase 2: Reclaim Contract UTxOs');
  console.log('─'.repeat(50));

  const txHashes: string[] = [];
  const escrowAddr = process.env.ESCROW_ADDRESS || process.env.ESCROW_SCRIPT_ADDRESS;
  const poolAddr = process.env.POOL_ADDRESS || process.env.POOL_SCRIPT_ADDRESS;

  for (const [label, scriptAddr] of [['Escrow', escrowAddr], ['Pool', poolAddr]] as const) {
    if (!scriptAddr) {
      console.log(`  ⚠️  ${label} address not set — skipping`);
      continue;
    }

    console.log(`  Querying ${label} UTxOs at: ${scriptAddr}`);
    try {
      const utxos: UTxO[] = await lucid.utxosAt(scriptAddr);
      console.log(`  Found ${utxos.length} ${label} UTxO(s)`);

      if (utxos.length === 0) continue;
      if (dryRun) {
        console.log(`  [DRY RUN] Would attempt to spend ${utxos.length} ${label} UTxOs`);
        continue;
      }

      // Note: Spending from script addresses requires the correct redeemer + validator.
      // This is a best-effort attempt. In practice, you may need to use the
      // backend's cancel/reclaim endpoints which know the validator scripts.
      console.log(`  Attempting reclaim via backend API...`);
      for (const utxo of utxos) {
        try {
          const utxoRef = `${utxo.txHash}#${utxo.outputIndex}`;
          console.log(`    Reclaiming ${utxoRef}...`);

          // Try backend portfolio action first
          const res = await apiFetch<any>('/portfolio/build-action', {
            method: 'POST',
            body: JSON.stringify({
              wallet_address: address,
              utxo_ref: utxoRef,
              action_type: 'RECLAIM',
            }),
          });

          if (res.unsignedTx) {
            const signed = await lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
            const txHash = await signed.submit();
            console.log(`    ✅ Reclaimed: ${txHash}`);
            txHashes.push(txHash);
            await waitForTx(lucid, txHash);
          }
        } catch (err) {
          console.log(`    ⚠️  Reclaim failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.log(`  ⚠️  Failed to query ${label}: ${(err as Error).message}`);
    }
  }

  return txHashes;
}

// ─── Phase 3: Database Reset ─────────────────

async function resetDatabase(): Promise<void> {
  console.log('\n🗄️  Phase 3: Database Reset');
  console.log('─'.repeat(50));

  if (dryRun) {
    console.log('  [DRY RUN] Would delete all DB records');
    return;
  }

  // Use the admin wallet address for authentication
  const adminAddress = process.env.ADMIN_ADDRESS || process.env.T_WALLET_ADDRESS || '';

  try {
    const res = await apiFetch<any>('/admin/reset-db', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: adminAddress,
        confirm: 'RESET_ALL_DATA',
      }),
    });
    console.log('  ✅ Database reset complete:');
    if (res.deleted) {
      for (const [table, count] of Object.entries(res.deleted)) {
        console.log(`     ${table}: ${count} rows deleted`);
      }
    }
  } catch (err: any) {
    console.log(`  ❌ Database reset failed: ${err.message}`);
    console.log('     Falling back to individual table deletes...');

    // Fallback: try deleting via repos (unlikely to work without endpoint)
    const tables = ['Swap', 'ProtocolStats', 'PoolHistory', 'PriceTick', 'Candle', 'Order', 'Intent', 'Pool'];
    for (const table of tables) {
      console.log(`     ⚠️  ${table} — no endpoint available, skipping`);
    }
  }

  // Verify by checking analytics
  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    console.log(`  Post-reset state: pools=${analytics.totalPools}, intents=${analytics.totalIntents}, filled=${analytics.intentsFilled}`);
  } catch {
    console.log('  Could not verify analytics');
  }
}

// ─── Phase 4: Verify Clean State ─────────────

async function verifyCleanState(lucid: any, address: string): Promise<void> {
  console.log('\n✔️  Phase 4: Verify Clean State');
  console.log('─'.repeat(50));

  // Check wallet
  const utxos: UTxO[] = await lucid.utxosAt(address);
  const lovelace = utxos.reduce((sum, u) => sum + (u.assets['lovelace'] || 0n), 0n);
  const nonAdaAssets = new Map<string, bigint>();
  for (const u of utxos) {
    for (const [unit, qty] of Object.entries(u.assets)) {
      if (unit === 'lovelace') continue;
      nonAdaAssets.set(unit, (nonAdaAssets.get(unit) || 0n) + (qty as bigint));
    }
  }

  console.log(`  Wallet ADA: ${(Number(lovelace) / 1_000_000).toFixed(6)}`);
  console.log(`  UTxOs: ${utxos.length}`);
  console.log(`  Non-ADA tokens: ${nonAdaAssets.size}`);

  if (nonAdaAssets.size > 0) {
    console.log('  ⚠️  Remaining tokens:');
    for (const [unit, qty] of nonAdaAssets) {
      const assetName = hexToText(unit.slice(56));
      console.log(`    ${assetName}: ${qty}`);
    }
  }

  // Check backend
  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    console.log(`  Backend — Pools: ${analytics.totalPools}, Intents: ${analytics.totalIntents}`);
  } catch {
    console.log('  Backend not reachable');
  }

  console.log('\n✅ System reset complete!');
}

// ─── Helper: Wait for TX confirmation ────────

async function waitForTx(lucid: any, txHash: string, maxWait = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      // Try to get the TX confirmation via Blockfrost
      const ok = await lucid.awaitTx(txHash, 5_000);
      if (ok) return;
    } catch {
      // Not confirmed yet
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log(`  ⚠️  TX ${txHash.slice(0, 16)}... not confirmed after ${maxWait / 1000}s — continuing`);
}

// ─── Main ────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  SolverNet DEX — System Reset');
  console.log('═'.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip chain: ${skipChain}, Skip DB: ${skipDb}`);

  let lucid: any;
  let address: string = '';
  let paymentKeyHash: string = '';

  if (!skipChain) {
    const seed = requireEnv('T_WALLET_SEED');
    const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod';
    lucid = await Lucid(
      new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
      network,
    );
    lucid.selectWallet.fromSeed(seed);
    address = await lucid.wallet().address();
    paymentKeyHash = getAddressDetails(address).paymentCredential!.hash;

    console.log(`Wallet: ${address.slice(0, 30)}...`);
    console.log('═'.repeat(60));

    // Phase 1: Burn tokens
    await burnAllTokens(lucid, address, paymentKeyHash);

    // Phase 2: Reclaim contract UTxOs
    await reclaimContractUtxos(lucid, address);
  }

  if (!skipDb) {
    // Phase 3: Database reset
    await resetDatabase();
  }

  if (!skipChain && lucid) {
    // Phase 4: Verify
    await verifyCleanState(lucid, address);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  Reset Complete');
  console.log('═'.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
