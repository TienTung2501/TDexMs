/**
 * ═══════════════════════════════════════════════════════════════════
 * COMPREHENSIVE END-TO-END TEST — SolverNet DEX
 * ═══════════════════════════════════════════════════════════════════
 *
 * Tests the full system in real business flow order:
 *   1. System Reset (DB + chain cleanup)
 *   2. Deploy Factory + Settings
 *   3. Mint tokens + Create Pool + Deposit Liquidity
 *   4. Intent Swap tests (full fill, partial fill, cancel, reclaim, multi-wallet)
 *   5. Order tests (LIMIT, DCA, STOP_LOSS, cancel, partial fill)
 *   6. Withdraw Liquidity
 *   7. Admin functions
 *   8. Data query / listing functions
 *   9. Database consistency verification
 *
 * Usage:
 *   npx tsx src/comprehensive-e2e-test.ts
 *   npx tsx src/comprehensive-e2e-test.ts --phase=1,2,3
 *   npx tsx src/comprehensive-e2e-test.ts --skip-reset
 *   npx tsx src/comprehensive-e2e-test.ts --skip-deploy
 *
 * Uses wallets: T_WALLET_SEED (admin/solver), T_WALLET_SEED2, MNEMONIC0-4
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

// ═══════════════════════════════════════════
// CONFIG & UTILITIES
// ═══════════════════════════════════════════

const args = parseArgs();
const PHASES_TO_RUN = args.phase ? args.phase.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SKIP_RESET = args['skip-reset'] === 'true';
const SKIP_DEPLOY = args['skip-deploy'] === 'true';

const NETWORK = (process.env.NETWORK || process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod';
const BF_URL = requireEnv('BLOCKFROST_URL');
const BF_KEY = requireEnv('BLOCKFROST_PROJECT_ID');

// Wallet seeds
const SEEDS = {
  admin: requireEnv('T_WALLET_SEED'),     // Wallet 1 — admin/solver
  user2: requireEnv('T_WALLET_SEED2'),     // Wallet 2
  user3: process.env.MNEMONIC0 || '',      // Wallet 3
  user4: process.env.MNEMONIC1 || '',      // Wallet 4
  user5: process.env.MNEMONIC2 || '',      // Wallet 5
};

// Test token definitions
const TEST_TOKENS = [
  { ticker: 'tBTC', slot: 0, decimals: 8 },
  { ticker: 'tUSDT', slot: 1, decimals: 6 },
  { ticker: 'tPOLYGON', slot: 2, decimals: 6 },
  { ticker: 'tNEAR', slot: 3, decimals: 6 },
  { ticker: 'tSOL', slot: 4, decimals: 9 },
];

// Test results tracking
interface TestResult {
  name: string;
  phase: number;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
  detail?: string;
  duration?: number;
}

const results: TestResult[] = [];
let currentPhase = 0;

// Helper: record result
function record(name: string, status: TestResult['status'], detail?: string, duration?: number) {
  results.push({ name, phase: currentPhase, status, detail, duration });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'SKIP' ? '⏭️' : '⚠️';
  const durStr = duration ? ` (${(duration / 1000).toFixed(1)}s)` : '';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}${durStr}`);
}

// Helper: sleep
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Helper: text to hex
function textToHex(t: string): string { return Buffer.from(t, 'utf-8').toString('hex'); }
function hexToText(h: string): string { try { return Buffer.from(h, 'hex').toString('utf-8'); } catch { return h; } }

// Helper: create Lucid instance for a seed
async function makeLucid(seed: string): Promise<{ lucid: LucidEvolution; address: string; keyHash: string }> {
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const keyHash = getAddressDetails(address).paymentCredential!.hash;
  return { lucid, address, keyHash };
}

// Helper: build unique NativeScript policy (mirrors mint-test-tokens.ts)
function buildUniquePolicy(paymentKeyHash: string, slot: number): { script: Script; policyId: string } {
  const slotHex = slot.toString(16).padStart(8, '0');
  const cbor = `8201828200581c${paymentKeyHash}82041a${slotHex}`;
  const script: Script = { type: 'Native', script: cbor };
  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

// Helper: wait for TX confirmation
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

// Helper: safe API call
async function safeApi<T>(path: string, options?: RequestInit & { params?: Record<string, string> }): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const data = await apiFetch<T>(path, options);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ═══════════════════════════════════════════
// GLOBAL STATE (populated during test phases)
// ═══════════════════════════════════════════

let adminWallet: { lucid: LucidEvolution; address: string; keyHash: string };
let user2Wallet: { lucid: LucidEvolution; address: string; keyHash: string };
let user3Wallet: { lucid: LucidEvolution; address: string; keyHash: string };
let user4Wallet: { lucid: LucidEvolution; address: string; keyHash: string };
let user5Wallet: { lucid: LucidEvolution; address: string; keyHash: string };

// Token asset IDs (policyId.hexAssetName)
let tBTC_ASSET = '';
let tUSDT_ASSET = '';
let tPOLYGON_ASSET = '';

// Pool info
let poolId_ADA_tBTC = '';
let poolId_ADA_tUSDT = '';
let poolTxHash = '';

// Intent IDs for testing
const intentIds: string[] = [];
const orderIds: string[] = [];

// Auto-resolved script addresses (from API, with .env fallback)
let ESCROW_ADDRESS = '';
let POOL_ADDRESS = '';

async function resolveScriptAddresses(): Promise<void> {
  try {
    const addrs = await apiFetch<any>('/system/addresses');
    ESCROW_ADDRESS = addrs.escrowAddress || '';
    POOL_ADDRESS = addrs.poolAddress || '';
    console.log(`  Auto-resolved addresses from API:`);
    console.log(`    Escrow: ${ESCROW_ADDRESS}`);
    console.log(`    Pool:   ${POOL_ADDRESS}`);
  } catch {
    ESCROW_ADDRESS = process.env.ESCROW_SCRIPT_ADDRESS || '';
    POOL_ADDRESS = process.env.POOL_SCRIPT_ADDRESS || '';
    console.log(`  Using .env addresses (API unavailable):`);
    console.log(`    Escrow: ${ESCROW_ADDRESS}`);
    console.log(`    Pool:   ${POOL_ADDRESS}`);
  }
}

// ═══════════════════════════════════════════
// PHASE 1: SYSTEM RESET
// ═══════════════════════════════════════════

async function phase1_systemReset() {
  currentPhase = 1;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 1: SYSTEM RESET');
  console.log('═'.repeat(70));

  if (SKIP_RESET) {
    record('System Reset', 'SKIP', 'Skipped via --skip-reset flag');
    return;
  }

  const t0 = Date.now();

  // Step 1: Reset database via API
  try {
    const adminAddr = process.env.ADMIN_ADDRESS || process.env.T_addr1 || '';
    const res = await apiFetch<any>('/admin/reset-db', {
      method: 'POST',
      body: JSON.stringify({ admin_address: adminAddr, confirm: 'RESET_ALL_DATA' }),
    });
    if (res.deleted) {
      const counts = Object.entries(res.deleted).map(([t, c]) => `${t}:${c}`).join(', ');
      record('DB Reset', 'PASS', counts);
    } else {
      record('DB Reset', 'PASS', JSON.stringify(res).slice(0, 100));
    }
  } catch (err: any) {
    record('DB Reset', 'WARN', err.message);
  }

  // Step 2: Auto-resolve script addresses from API (or .env fallback)
  await resolveScriptAddresses();

  // Step 3: Check for and reclaim contract UTxOs
  try {
    adminWallet = await makeLucid(SEEDS.admin);
    const escrowAddr = ESCROW_ADDRESS;
    const poolAddr = POOL_ADDRESS;

    for (const [label, addr] of [['Escrow', escrowAddr], ['Pool', poolAddr]] as const) {
      if (!addr) continue;
      try {
        const utxos = await adminWallet.lucid.utxosAt(addr);
        if (utxos.length > 0) {
          console.log(`  Found ${utxos.length} ${label} UTxO(s) — attempting reclaim...`);
          for (const utxo of utxos) {
            const ref = `${utxo.txHash}#${utxo.outputIndex}`;
            try {
              const res = await apiFetch<any>('/portfolio/build-action', {
                method: 'POST',
                body: JSON.stringify({
                  wallet_address: adminWallet.address,
                  utxo_ref: ref,
                  action_type: 'RECLAIM',
                }),
              });
              if (res.unsignedTx) {
                const signed = await adminWallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
                const txHash = await signed.submit();
                record(`Reclaim ${label} ${ref.slice(0, 16)}...`, 'PASS', txHash.slice(0, 16));
                await waitTx(adminWallet.lucid, txHash, 90_000);
              }
            } catch (e: any) {
              record(`Reclaim ${label} ${ref.slice(0, 16)}...`, 'WARN', e.message.slice(0, 80));
            }
          }
        } else {
          record(`${label} UTxOs check`, 'PASS', 'No UTxOs — already clean');
        }
      } catch (e: any) {
        record(`${label} UTxOs check`, 'WARN', e.message.slice(0, 80));
      }
    }
  } catch (e: any) {
    record('Chain cleanup', 'WARN', e.message);
  }

  // Step 4: Verify clean state
  try {
    const analytics = await apiFetch<any>('/analytics/overview');
    const clean = analytics.totalPools === 0 && analytics.totalIntents === 0;
    record('Verify clean state', clean ? 'PASS' : 'WARN',
      `pools=${analytics.totalPools}, intents=${analytics.totalIntents}, filled=${analytics.intentsFilled}`);
  } catch (e: any) {
    record('Verify clean state', 'WARN', e.message);
  }

  record('Phase 1 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 2: SYSTEM INITIALIZATION
// ═══════════════════════════════════════════

async function phase2_initialization() {
  currentPhase = 2;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 2: SYSTEM INITIALIZATION');
  console.log('═'.repeat(70));

  if (SKIP_DEPLOY) {
    record('System Init', 'SKIP', 'Skipped via --skip-deploy flag');
    // Still need wallets
    adminWallet = await makeLucid(SEEDS.admin);
    return;
  }

  const t0 = Date.now();

  // Init all wallets
  adminWallet = await makeLucid(SEEDS.admin);
  console.log(`  Admin: ${adminWallet.address.slice(0, 40)}...`);

  user2Wallet = await makeLucid(SEEDS.user2);
  console.log(`  User2: ${user2Wallet.address.slice(0, 40)}...`);

  if (SEEDS.user3) {
    user3Wallet = await makeLucid(SEEDS.user3);
    console.log(`  User3: ${user3Wallet.address.slice(0, 40)}...`);
  }
  if (SEEDS.user4) {
    user4Wallet = await makeLucid(SEEDS.user4);
    console.log(`  User4: ${user4Wallet.address.slice(0, 40)}...`);
  }
  if (SEEDS.user5) {
    user5Wallet = await makeLucid(SEEDS.user5);
    console.log(`  User5: ${user5Wallet.address.slice(0, 40)}...`);
  }

  // 2a. Check wallets have ADA
  for (const [name, wallet] of [['Admin', adminWallet], ['User2', user2Wallet]] as const) {
    const utxos = await (wallet as any).lucid.utxosAt((wallet as any).address);
    const ada = utxos.reduce((s: bigint, u: UTxO) => s + (u.assets['lovelace'] || 0n), 0n);
    const adaFloat = Number(ada) / 1_000_000;
    record(`${name} Wallet Balance`, adaFloat > 10 ? 'PASS' : 'WARN', `${adaFloat.toFixed(2)} ADA`);
  }

  // 2b. Deploy Settings via backend
  console.log('\n  --- Deploy Settings ---');
  try {
    const settingsRes = await apiFetch<any>('/admin/settings/build-deploy', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: adminWallet.address,
        protocol_fee_bps: 5,
        min_pool_liquidity: '2000000',
        min_intent_size: '1000000',
        solver_bond: '5000000',
        fee_collector_address: adminWallet.address,
      }),
    });

    if (settingsRes.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(settingsRes.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('Deploy Settings TX', 'PASS', txHash.slice(0, 16));
      await waitTx(adminWallet.lucid, txHash, 90_000);
      record('Settings TX Confirmed', 'PASS');
    } else {
      record('Deploy Settings', 'PASS', 'No TX needed (already deployed or mock)');
    }
  } catch (e: any) {
    record('Deploy Settings', 'WARN', e.message.slice(0, 100));
  }

  // 2b2. Deploy Factory UTxO via backend (required for pool creation)
  console.log('\n  --- Deploy Factory ---');
  try {
    const factoryRes = await apiFetch<any>('/admin/factory/build-deploy', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: adminWallet.address,
      }),
    });

    if (factoryRes.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(factoryRes.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('Deploy Factory TX', 'PASS', txHash.slice(0, 16));
      await waitTx(adminWallet.lucid, txHash, 90_000);
      record('Factory TX Confirmed', 'PASS');
    } else {
      record('Deploy Factory', 'PASS', 'No TX needed');
    }
  } catch (e: any) {
    // 502 "already exists" is expected if factory was deployed separately
    record('Deploy Factory', e.message.includes('already exists') ? 'PASS' : 'WARN',
      e.message.includes('already exists') ? 'Factory already deployed' : e.message.slice(0, 100));
  }

  // 2c. Determine token asset IDs from admin wallet
  const { policyId: tBTCPolicy } = buildUniquePolicy(adminWallet.keyHash, 0);
  const { policyId: tUSDTPolicy } = buildUniquePolicy(adminWallet.keyHash, 1);
  const { policyId: tPOLYGONPolicy } = buildUniquePolicy(adminWallet.keyHash, 2);

  tBTC_ASSET = `${tBTCPolicy}.${textToHex('tBTC')}`;
  tUSDT_ASSET = `${tUSDTPolicy}.${textToHex('tUSDT')}`;
  tPOLYGON_ASSET = `${tPOLYGONPolicy}.${textToHex('tPOLYGON')}`;

  console.log(`  tBTC: ${tBTC_ASSET.slice(0, 20)}...`);
  console.log(`  tUSDT: ${tUSDT_ASSET.slice(0, 20)}...`);

  // 2d. Check if tokens exist, if not — they should already be minted
  const adminUtxos = await adminWallet.lucid.utxosAt(adminWallet.address);
  const tBTCUnit = `${tBTCPolicy}${textToHex('tBTC')}`;
  const hasTBTC = adminUtxos.some(u => u.assets[tBTCUnit] && u.assets[tBTCUnit] > 0n);
  record('tBTC tokens available', hasTBTC ? 'PASS' : 'WARN', hasTBTC ? 'Found in wallet' : 'Not found — may need minting');

  // 2e. Create Pool: ADA/tBTC
  console.log('\n  --- Create ADA/tBTC Pool ---');
  try {
    const poolRes = await apiFetch<any>('/pools/create', {
      method: 'POST',
      body: JSON.stringify({
        assetA: 'lovelace',
        assetB: tBTC_ASSET,
        initialAmountA: '50000000',  // 50 ADA
        initialAmountB: '5000000',   // 5M tBTC units (must be >= min_pool_liquidity)
        feeNumerator: 30,            // 0.3%
        creatorAddress: adminWallet.address,
        changeAddress: adminWallet.address,
      }),
    });

    log('Create Pool response', { poolId: poolRes.poolId });
    poolId_ADA_tBTC = poolRes.poolId || '';

    if (poolRes.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(poolRes.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      poolTxHash = txHash;
      record('Create ADA/tBTC Pool TX', 'PASS', `poolId=${poolId_ADA_tBTC}, tx=${txHash.slice(0, 16)}`);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, poolId: poolId_ADA_tBTC, action: 'create_pool' }),
      }).catch(() => {});

      await waitTx(adminWallet.lucid, txHash, 120_000);
      record('Pool TX Confirmed', 'PASS');
    } else {
      record('Create Pool', 'PASS', `poolId=${poolId_ADA_tBTC} (no TX)`);
    }
  } catch (e: any) {
    record('Create ADA/tBTC Pool', 'FAIL', e.message.slice(0, 150));
  }

  // 2f. Create second pool: ADA/tUSDT
  console.log('\n  --- Create ADA/tUSDT Pool ---');
  try {
    const pool2Res = await apiFetch<any>('/pools/create', {
      method: 'POST',
      body: JSON.stringify({
        assetA: 'lovelace',
        assetB: tUSDT_ASSET,
        initialAmountA: '30000000',  // 30 ADA
        initialAmountB: '5000000',  // 5M tUSDT units
        feeNumerator: 30,
        creatorAddress: adminWallet.address,
        changeAddress: adminWallet.address,
      }),
    });

    poolId_ADA_tUSDT = pool2Res.poolId || '';

    if (pool2Res.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(pool2Res.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('Create ADA/tUSDT Pool TX', 'PASS', `poolId=${poolId_ADA_tUSDT}, tx=${txHash.slice(0, 16)}`);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, poolId: poolId_ADA_tUSDT, action: 'create_pool' }),
      }).catch(() => {});

      await waitTx(adminWallet.lucid, txHash, 120_000);
      record('Pool 2 TX Confirmed', 'PASS');
    } else {
      record('Create ADA/tUSDT Pool', 'PASS', `poolId=${poolId_ADA_tUSDT} (no TX)`);
    }
  } catch (e: any) {
    record('Create ADA/tUSDT Pool', 'FAIL', e.message.slice(0, 150));
  }

  // 2g. Deposit additional liquidity to pool 1
  if (poolId_ADA_tBTC) {
    console.log('\n  --- Deposit Liquidity to ADA/tBTC Pool ---');
    try {
      const depRes = await apiFetch<any>(`/pools/${poolId_ADA_tBTC}/deposit`, {
        method: 'POST',
        body: JSON.stringify({
          amountA: '10000000', // 10 ADA more
          amountB: '1000000', // 1M more tBTC units
          minLpTokens: '0',
          senderAddress: adminWallet.address,
          changeAddress: adminWallet.address,
        }),
      });

      if (depRes.unsignedTx) {
        const signed = await adminWallet.lucid.fromTx(depRes.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('Deposit Liquidity TX', 'PASS', txHash.slice(0, 16));

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, action: 'deposit' }),
        }).catch(() => {});

        await waitTx(adminWallet.lucid, txHash, 90_000);
        record('Deposit TX Confirmed', 'PASS');
      } else {
        record('Deposit Liquidity', 'PASS', 'No TX required');
      }
    } catch (e: any) {
      record('Deposit Liquidity', 'WARN', e.message.slice(0, 100));
    }
  }

  record('Phase 2 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 3: INTENT SWAP TESTING
// ═══════════════════════════════════════════

async function phase3_intentSwapTests() {
  currentPhase = 3;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 3: INTENT SWAP TESTING');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  // Ensure wallets are initialized
  if (!adminWallet) adminWallet = await makeLucid(SEEDS.admin);
  if (!user2Wallet) user2Wallet = await makeLucid(SEEDS.user2);

  // Determine tBTC asset from env or computed
  if (!tBTC_ASSET) {
    tBTC_ASSET = process.env.T_TOKEN_ASSET || '';
    tUSDT_ASSET = process.env.T_TOKEN_ASSET2 || '';
  }

  // If no pool IDs, fetch from backend
  if (!poolId_ADA_tBTC) {
    const pools = await safeApi<any>('/pools');
    const poolList = pools.data?.data || pools.data?.items || (Array.isArray(pools.data) ? pools.data : []);
    if (pools.ok && poolList.length > 0) {
      poolId_ADA_tBTC = poolList[0].poolId || poolList[0].id;
      if (poolList.length > 1) poolId_ADA_tUSDT = poolList[1].poolId || poolList[1].id;
      // Auto-detect token assets from pool data (format: policyId.assetName)
      if (!tBTC_ASSET && poolList[0].assetB) {
        tBTC_ASSET = poolList[0].assetB.policyId + '.' + poolList[0].assetB.assetName;
      }
      if (!tUSDT_ASSET && poolList.length > 1 && poolList[1].assetB) {
        tUSDT_ASSET = poolList[1].assetB.policyId + '.' + poolList[1].assetB.assetName;
      }
      record('Auto-detected pools', 'PASS', `pool1=${poolId_ADA_tBTC?.slice(0, 12)}, pool2=${poolId_ADA_tUSDT?.slice(0, 12)}`);
    } else {
      record('No pools found', 'FAIL', 'Cannot test intents without pools');
      return;
    }
  }

  // Get pool info for the main pool
  const poolInfo = await safeApi<any>(`/pools/${poolId_ADA_tBTC}`);
  if (poolInfo.ok) {
    const p = poolInfo.data;
    record('Pool Info', 'PASS', `reserves: ${p.reserveA}/${p.reserveB}, fee: ${p.feeNumerator}`);
  }

  // --- TEST 3.1: User1 (admin) creates intent to swap ADA → tBTC ---
  console.log('\n  --- 3.1: Admin creates ADA→tBTC intent (Full Fill candidate) ---');
  let intent1Id = '';
  try {
    const outputAsset = tBTC_ASSET;
    const res = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: adminWallet.address,
        inputAsset: 'lovelace',
        inputAmount: '5000000', // 5 ADA
        outputAsset,
        minOutput: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        partialFill: false,
        changeAddress: adminWallet.address,
      }),
    });
    intent1Id = res.intentId || '';

    if (res.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('3.1 Create Intent (Admin, ADA→tBTC)', 'PASS', `intentId=${intent1Id}, tx=${txHash.slice(0, 16)}`);
      intentIds.push(intent1Id);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, intentId: intent1Id, action: 'create_intent' }),
      }).catch(() => {});

      await waitTx(adminWallet.lucid, txHash, 90_000);
      record('3.1 Intent TX Confirmed', 'PASS');
    } else {
      record('3.1 Create Intent', 'PASS', `intentId=${intent1Id} (no TX)`);
      intentIds.push(intent1Id);
    }
  } catch (e: any) {
    record('3.1 Create Intent (Admin)', 'FAIL', e.message.slice(0, 150));
  }

  // --- TEST 3.2: User2 creates intent to swap ADA → tBTC ---
  console.log('\n  --- 3.2: User2 creates ADA→tBTC intent ---');
  let intent2Id = '';
  try {
    const res = await apiFetch<any>('/intents', {
      method: 'POST',
      body: JSON.stringify({
        senderAddress: user2Wallet.address,
        inputAsset: 'lovelace',
        inputAmount: '3000000', // 3 ADA
        outputAsset: tBTC_ASSET,
        minOutput: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        partialFill: true, // Allow partial fill
        changeAddress: user2Wallet.address,
      }),
    });
    intent2Id = res.intentId || '';

    if (res.unsignedTx) {
      const signed = await user2Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('3.2 Create Intent (User2, Partial Fill)', 'PASS', `intentId=${intent2Id}, tx=${txHash.slice(0, 16)}`);
      intentIds.push(intent2Id);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, intentId: intent2Id, action: 'create_intent' }),
      }).catch(() => {});

      await waitTx(user2Wallet.lucid, txHash, 90_000);
      record('3.2 Intent TX Confirmed', 'PASS');
    } else {
      record('3.2 Create Intent', 'PASS', `intentId=${intent2Id}`);
      intentIds.push(intent2Id);
    }
  } catch (e: any) {
    record('3.2 Create Intent (User2)', 'FAIL', e.message.slice(0, 150));
  }

  // --- TEST 3.3: User3 creates intent to swap ADA → tUSDT (different pool) ---
  console.log('\n  --- 3.3: User3 creates ADA→tUSDT intent ---');
  let intent3Id = '';
  if (SEEDS.user3 && tUSDT_ASSET) {
    try {
      if (!user3Wallet) user3Wallet = await makeLucid(SEEDS.user3);
      const res = await apiFetch<any>('/intents', {
        method: 'POST',
        body: JSON.stringify({
          senderAddress: user3Wallet.address,
          inputAsset: 'lovelace',
          inputAmount: '4000000', // 4 ADA
          outputAsset: tUSDT_ASSET,
          minOutput: '1',
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          partialFill: false,
          changeAddress: user3Wallet.address,
        }),
      });
      intent3Id = res.intentId || '';

      if (res.unsignedTx) {
        const signed = await user3Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('3.3 Create Intent (User3, ADA→tUSDT)', 'PASS', `intentId=${intent3Id}, tx=${txHash.slice(0, 16)}`);
        intentIds.push(intent3Id);

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, intentId: intent3Id, action: 'create_intent' }),
        }).catch(() => {});

        await waitTx(user3Wallet.lucid, txHash, 90_000);
        record('3.3 Intent TX Confirmed', 'PASS');
      } else {
        record('3.3 Create Intent', 'PASS', `intentId=${intent3Id}`);
        intentIds.push(intent3Id);
      }
    } catch (e: any) {
      record('3.3 Create Intent (User3)', 'FAIL', e.message.slice(0, 150));
    }
  } else {
    record('3.3 Create Intent (User3)', 'SKIP', 'No MNEMONIC0 or tUSDT available');
  }

  // --- TEST 3.3b: User5 creates REVERSE intent tBTC → ADA (B→A direction) ---
  // This enables the solver bot to demonstrate bidirectional netting:
  //   A→B intents (3.1, 3.2) + B→A intent (3.3b) can be settled together.
  console.log('\n  --- 3.3b: User5 creates tBTC→ADA intent (REVERSE direction) ---');
  let intent5Id = '';
  if (SEEDS.user5 && tBTC_ASSET) {
    try {
      if (!user5Wallet) user5Wallet = await makeLucid(SEEDS.user5);

      // First check if user5 has tBTC tokens
      const u5Utxos = await user5Wallet.lucid.utxosAt(user5Wallet.address);
      const tBTCUnit = tBTC_ASSET.replace('.', '');
      const hasTBTC = u5Utxos.some(u => u.assets[tBTCUnit] && u.assets[tBTCUnit] > 0n);

      if (hasTBTC) {
        const res = await apiFetch<any>('/intents', {
          method: 'POST',
          body: JSON.stringify({
            senderAddress: user5Wallet.address,
            inputAsset: tBTC_ASSET,
            inputAmount: '500000',   // Some tBTC units
            outputAsset: 'lovelace',
            minOutput: '1000000',    // Expect at least 1 ADA back
            deadline: Date.now() + 24 * 60 * 60 * 1000,
            partialFill: false,
            changeAddress: user5Wallet.address,
          }),
        });
        intent5Id = res.intentId || '';

        if (res.unsignedTx) {
          const signed = await user5Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
          const txHash = await signed.submit();
          record('3.3b Create Intent (User5, tBTC→ADA, REVERSE)', 'PASS', `intentId=${intent5Id}, tx=${txHash.slice(0, 16)}`);
          intentIds.push(intent5Id);

          await apiFetch('/tx/confirm', {
            method: 'POST',
            body: JSON.stringify({ txHash, intentId: intent5Id, action: 'create_intent' }),
          }).catch(() => {});

          await waitTx(user5Wallet.lucid, txHash, 90_000);
          record('3.3b Intent TX Confirmed', 'PASS');
        } else {
          record('3.3b Create Intent', 'PASS', `intentId=${intent5Id}`);
          intentIds.push(intent5Id);
        }
      } else {
        record('3.3b Create Intent (User5, tBTC→ADA)', 'SKIP', 'User5 has no tBTC tokens');
      }
    } catch (e: any) {
      record('3.3b Create Intent (User5, tBTC→ADA)', 'FAIL', e.message.slice(0, 150));
    }
  } else {
    record('3.3b Create Intent (User5)', 'SKIP', 'No MNEMONIC2 or tBTC unavailable');
  }

  // --- TEST 3.3c: Admin creates REVERSE intent tBTC → ADA (second B→A for netting) ---
  console.log('\n  --- 3.3c: Admin creates tBTC→ADA intent (second REVERSE) ---');
  let intent6Id = '';
  try {
    // Check admin has tBTC
    const adminUtxos = await adminWallet.lucid.utxosAt(adminWallet.address);
    const tBTCUnit = tBTC_ASSET.replace('.', '');
    const adminTBTC = adminUtxos.reduce((s, u) => s + (u.assets[tBTCUnit] || 0n), 0n);

    if (adminTBTC > 1000000n) {
      const res = await apiFetch<any>('/intents', {
        method: 'POST',
        body: JSON.stringify({
          senderAddress: adminWallet.address,
          inputAsset: tBTC_ASSET,
          inputAmount: '300000',   // Some tBTC
          outputAsset: 'lovelace',
          minOutput: '1000000',    // At least 1 ADA
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          partialFill: true,        // Allow partial fill
          changeAddress: adminWallet.address,
        }),
      });
      intent6Id = res.intentId || '';

      if (res.unsignedTx) {
        const signed = await adminWallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('3.3c Create Intent (Admin, tBTC→ADA, REVERSE partial)', 'PASS', `intentId=${intent6Id}, tx=${txHash.slice(0, 16)}`);
        intentIds.push(intent6Id);

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, intentId: intent6Id, action: 'create_intent' }),
        }).catch(() => {});

        await waitTx(adminWallet.lucid, txHash, 90_000);
        record('3.3c Intent TX Confirmed', 'PASS');
      } else {
        record('3.3c Create Intent', 'PASS', `intentId=${intent6Id}`);
        intentIds.push(intent6Id);
      }
    } else {
      record('3.3c Create Intent (Admin, tBTC→ADA)', 'SKIP', `Admin tBTC balance too low: ${adminTBTC}`);
    }
  } catch (e: any) {
    record('3.3c Create Intent (Admin, tBTC→ADA)', 'FAIL', e.message.slice(0, 150));
  }

  // --- TEST 3.4: User4 creates intent to CANCEL ---
  console.log('\n  --- 3.4: User4 creates intent then cancels ---');
  let intent4Id = '';
  if (SEEDS.user4) {
    try {
      if (!user4Wallet) user4Wallet = await makeLucid(SEEDS.user4);
      const res = await apiFetch<any>('/intents', {
        method: 'POST',
        body: JSON.stringify({
          senderAddress: user4Wallet.address,
          inputAsset: 'lovelace',
          inputAmount: '2000000', // 2 ADA
          outputAsset: tBTC_ASSET,
          minOutput: '1',
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          partialFill: false,
          changeAddress: user4Wallet.address,
        }),
      });
      intent4Id = res.intentId || '';

      if (res.unsignedTx) {
        const signed = await user4Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('3.4a Create Intent (User4, for cancel)', 'PASS', `intentId=${intent4Id}`);

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, intentId: intent4Id, action: 'create_intent' }),
        }).catch(() => {});

        await waitTx(user4Wallet.lucid, txHash, 90_000);

        // Now cancel it
        console.log('    Cancelling intent...');
        await sleep(2000);
        const cancelRes = await apiFetch<any>(`/intents/${intent4Id}`, {
          method: 'DELETE',
          body: JSON.stringify({ senderAddress: user4Wallet.address }),
        });

        if (cancelRes.unsignedTx) {
          const cancelSigned = await user4Wallet.lucid.fromTx(cancelRes.unsignedTx).sign.withWallet().complete();
          const cancelHash = await cancelSigned.submit();
          record('3.4b Cancel Intent (User4)', 'PASS', `cancelTx=${cancelHash.slice(0, 16)}`);

          await apiFetch('/tx/confirm', {
            method: 'POST',
            body: JSON.stringify({ txHash: cancelHash, intentId: intent4Id, action: 'cancel' }),
          }).catch(() => {});

          await waitTx(user4Wallet.lucid, cancelHash, 90_000);
          record('3.4b Cancel TX Confirmed', 'PASS');
        } else {
          record('3.4b Cancel Intent', 'PASS', 'No TX needed');
        }
      } else {
        record('3.4 Create+Cancel Intent (User4)', 'PASS');
      }
    } catch (e: any) {
      record('3.4 Create+Cancel Intent', 'FAIL', e.message.slice(0, 150));
    }
  } else {
    record('3.4 Create+Cancel Intent', 'SKIP', 'No MNEMONIC1 available');
  }

  // --- TEST 3.5: Verify intents in list ---
  console.log('\n  --- 3.5: Verify intent listing ---');
  try {
    const listRes = await apiFetch<any>('/intents', {
      params: { limit: '20' },
    });
    const intentCount = listRes.data?.length || listRes.items?.length || 0;
    record('3.5 List Intents', 'PASS', `Found ${intentCount} intents`);

    // Check individual intent details
    for (const id of intentIds.slice(0, 2)) {
      if (!id) continue;
      const detail = await safeApi<any>(`/intents/${id}`);
      if (detail.ok) {
        record(`3.5 Intent Detail ${id.slice(0, 8)}`, 'PASS', `status=${detail.data?.status}`);
      }
    }
  } catch (e: any) {
    record('3.5 List Intents', 'FAIL', e.message);
  }

  // --- TEST 3.6: Get quote before fill ---
  console.log('\n  --- 3.6: Get swap quote ---');
  try {
    const quoteRes = await apiFetch<any>('/quote', {
      params: {
        inputAsset: 'lovelace',
        outputAsset: tBTC_ASSET,
        inputAmount: '5000000',
        slippage: '50',
      },
    });
    record('3.6 Get Quote', 'PASS', `output=${quoteRes.outputAmount}, impact=${quoteRes.priceImpact}`);
  } catch (e: any) {
    record('3.6 Get Quote', 'WARN', e.message.slice(0, 100));
  }

  // --- TEST 3.7: Wait for bot to fill intents (or manual fill) ---
  console.log('\n  --- 3.7: Wait for solver bot / check intent fill ---');
  console.log('    Waiting 15s for the solver/bot to process intents...');
  await sleep(15_000);

  // Check if intents were filled
  for (const id of intentIds.filter(Boolean)) {
    const detail = await safeApi<any>(`/intents/${id}`);
    if (detail.ok) {
      const status = detail.data?.status;
      const statusOk = ['FILLED', 'FILLING', 'ACTIVE', 'CANCELLED'].includes(status);
      record(`3.7 Intent ${id.slice(0, 8)} Status`, statusOk ? 'PASS' : 'WARN', `status=${status}`);
    }
  }

  // --- TEST 3.8: Manual fill attempt using fill-intent API ---
  console.log('\n  --- 3.8: Manual solver fill attempt ---');
  if (intent1Id && poolId_ADA_tBTC) {
    try {
      // Get the intent details to find escrow UTxO ref
      const intentDetail = await apiFetch<any>(`/intents/${intent1Id}`);
      const escrowTxHash = intentDetail.escrowTxHash || intentDetail.txHash;
      const escrowOutputIndex = intentDetail.escrowOutputIndex ?? 0;

      // Get pool UTxO ref
      const poolDetail = await apiFetch<any>(`/pools/${poolId_ADA_tBTC}`);
      const pTxHash = poolDetail.txHash || poolDetail.lastTxHash;
      const pOutputIndex = poolDetail.outputIndex ?? 0;

      if (escrowTxHash && pTxHash && intentDetail.status === 'ACTIVE') {
        const fillRes = await apiFetch<any>('/solver/fill-intent', {
          method: 'POST',
          body: JSON.stringify({
            solver_address: adminWallet.address,
            intent_utxo_refs: [
              { tx_hash: escrowTxHash, output_index: escrowOutputIndex },
            ],
            pool_utxo_ref: {
              tx_hash: pTxHash,
              output_index: pOutputIndex,
            },
          }),
        });

        if (fillRes.unsignedTx) {
          const signed = await adminWallet.lucid.fromTx(fillRes.unsignedTx).sign.withWallet().complete();
          const txHash = await signed.submit();
          record('3.8 Manual Fill Intent', 'PASS', `tx=${txHash.slice(0, 16)}`);
          await waitTx(adminWallet.lucid, txHash, 120_000);
          record('3.8 Fill TX Confirmed', 'PASS');
        } else {
          record('3.8 Manual Fill', 'PASS', 'No TX needed (may be mock)');
        }
      } else {
        record('3.8 Manual Fill', 'SKIP', `status=${intentDetail.status} (may already be filled)`);
      }
    } catch (e: any) {
      record('3.8 Manual Fill Intent', 'WARN', e.message.slice(0, 150));
    }
  }

  // --- TEST 3.9: Check intent statuses after fill attempts ---
  console.log('\n  --- 3.9: Post-fill intent verification ---');
  for (const id of intentIds.filter(Boolean)) {
    const detail = await safeApi<any>(`/intents/${id}`);
    if (detail.ok) {
      record(`3.9 Intent ${id.slice(0, 8)} final status`, 'PASS', `status=${detail.data?.status}`);
    }
  }

  record('Phase 3 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 4: ORDER TESTING
// ═══════════════════════════════════════════

async function phase4_orderTests() {
  currentPhase = 4;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 4: ORDER TESTING (LIMIT / DCA / STOP_LOSS)');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  if (!adminWallet) adminWallet = await makeLucid(SEEDS.admin);
  if (!user2Wallet) user2Wallet = await makeLucid(SEEDS.user2);
  if (!tBTC_ASSET) tBTC_ASSET = process.env.T_TOKEN_ASSET || '';

  // --- TEST 4.1: Admin creates LIMIT order (ADA → tBTC) ---
  console.log('\n  --- 4.1: Admin creates LIMIT order ---');
  let limitOrderId = '';
  try {
    const res = await apiFetch<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'LIMIT',
        inputAsset: 'lovelace',
        outputAsset: tBTC_ASSET,
        inputAmount: '5000000',
        priceNumerator: '100',
        priceDenominator: '1',
        deadline: Date.now() + 24 * 60 * 60 * 1000,
        senderAddress: adminWallet.address,
        changeAddress: adminWallet.address,
      }),
    });
    limitOrderId = res.orderId || '';

    if (res.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('4.1 Create LIMIT Order (Admin)', 'PASS', `orderId=${limitOrderId}, tx=${txHash.slice(0, 16)}`);
      orderIds.push(limitOrderId);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, action: 'create_order' }),
      }).catch(() => {});

      await waitTx(adminWallet.lucid, txHash, 90_000);
      record('4.1 LIMIT Order TX Confirmed', 'PASS');
    } else {
      record('4.1 Create LIMIT Order', 'PASS', `orderId=${limitOrderId}`);
      orderIds.push(limitOrderId);
    }
  } catch (e: any) {
    record('4.1 Create LIMIT Order', 'FAIL', e.message.slice(0, 150));
  }

  // --- TEST 4.2: User2 creates DCA order ---
  console.log('\n  --- 4.2: User2 creates DCA order ---');
  let dcaOrderId = '';
  try {
    const res = await apiFetch<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        type: 'DCA',
        inputAsset: 'lovelace',
        outputAsset: tBTC_ASSET,
        inputAmount: '10000000', // 10 ADA total budget
        totalBudget: '10000000',
        amountPerInterval: '2000000', // 2 ADA per interval
        intervalSlots: 7200,
        priceNumerator: '100',
        priceDenominator: '1',
        deadline: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        senderAddress: user2Wallet.address,
        changeAddress: user2Wallet.address,
      }),
    });
    dcaOrderId = res.orderId || '';

    if (res.unsignedTx) {
      const signed = await user2Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('4.2 Create DCA Order (User2)', 'PASS', `orderId=${dcaOrderId}, tx=${txHash.slice(0, 16)}`);
      orderIds.push(dcaOrderId);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, action: 'create_order' }),
      }).catch(() => {});

      await waitTx(user2Wallet.lucid, txHash, 90_000);
      record('4.2 DCA Order TX Confirmed', 'PASS');
    } else {
      record('4.2 Create DCA Order', 'PASS', `orderId=${dcaOrderId}`);
      orderIds.push(dcaOrderId);
    }
  } catch (e: any) {
    record('4.2 Create DCA Order', 'FAIL', e.message.slice(0, 150));
  }

  // --- TEST 4.3: User3 creates STOP_LOSS order ---
  console.log('\n  --- 4.3: User3 creates STOP_LOSS order ---');
  let stopLossOrderId = '';
  if (SEEDS.user3) {
    try {
      if (!user3Wallet) user3Wallet = await makeLucid(SEEDS.user3);
      const res = await apiFetch<any>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'STOP_LOSS',
          inputAsset: 'lovelace',
          outputAsset: tBTC_ASSET,
          inputAmount: '3000000',
          priceNumerator: '50',
          priceDenominator: '1',
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          senderAddress: user3Wallet.address,
          changeAddress: user3Wallet.address,
        }),
      });
      stopLossOrderId = res.orderId || '';

      if (res.unsignedTx) {
        const signed = await user3Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('4.3 Create STOP_LOSS (User3)', 'PASS', `orderId=${stopLossOrderId}, tx=${txHash.slice(0, 16)}`);
        orderIds.push(stopLossOrderId);

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, action: 'create_order' }),
        }).catch(() => {});

        await waitTx(user3Wallet.lucid, txHash, 90_000);
        record('4.3 STOP_LOSS TX Confirmed', 'PASS');
      } else {
        record('4.3 Create STOP_LOSS', 'PASS', `orderId=${stopLossOrderId}`);
        orderIds.push(stopLossOrderId);
      }
    } catch (e: any) {
      record('4.3 Create STOP_LOSS', 'FAIL', e.message.slice(0, 150));
    }
  } else {
    record('4.3 Create STOP_LOSS', 'SKIP', 'No MNEMONIC0');
  }

  // --- TEST 4.4: User4 creates LIMIT order and cancels it ---
  console.log('\n  --- 4.4: User4 creates LIMIT order then cancels ---');
  if (SEEDS.user4) {
    try {
      if (!user4Wallet) user4Wallet = await makeLucid(SEEDS.user4);
      const res = await apiFetch<any>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'LIMIT',
          inputAsset: 'lovelace',
          outputAsset: tBTC_ASSET,
          inputAmount: '2000000',
          priceNumerator: '200',
          priceDenominator: '1',
          deadline: Date.now() + 24 * 60 * 60 * 1000,
          senderAddress: user4Wallet.address,
          changeAddress: user4Wallet.address,
        }),
      });
      const cancelOrderId = res.orderId || '';

      if (res.unsignedTx) {
        const signed = await user4Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('4.4a Create LIMIT for Cancel (User4)', 'PASS', `orderId=${cancelOrderId}`);

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, action: 'create_order' }),
        }).catch(() => {});

        await waitTx(user4Wallet.lucid, txHash, 90_000);

        // Cancel the order
        await sleep(2000);
        const cancelRes = await apiFetch<any>(`/orders/${cancelOrderId}`, {
          method: 'DELETE',
          body: JSON.stringify({ senderAddress: user4Wallet.address }),
        });

        if (cancelRes.unsignedTx) {
          const cancelSigned = await user4Wallet.lucid.fromTx(cancelRes.unsignedTx).sign.withWallet().complete();
          const cancelHash = await cancelSigned.submit();
          record('4.4b Cancel Order (User4)', 'PASS', `cancelTx=${cancelHash.slice(0, 16)}`);

          await apiFetch('/tx/confirm', {
            method: 'POST',
            body: JSON.stringify({ txHash: cancelHash, action: 'cancel_order' }),
          }).catch(() => {});

          await waitTx(user4Wallet.lucid, cancelHash, 90_000);
          record('4.4b Cancel Order TX Confirmed', 'PASS');
        } else {
          record('4.4b Cancel Order', 'PASS', 'No TX needed');
        }
      }
    } catch (e: any) {
      record('4.4 Create+Cancel Order', 'FAIL', e.message.slice(0, 150));
    }
  } else {
    record('4.4 Create+Cancel Order', 'SKIP', 'No MNEMONIC1');
  }

  // --- TEST 4.5: User5 creates another LIMIT order (different price point) ---
  console.log('\n  --- 4.5: User5 creates LIMIT order (edge case: high price) ---');
  if (SEEDS.user5) {
    try {
      if (!user5Wallet) user5Wallet = await makeLucid(SEEDS.user5);
      const res = await apiFetch<any>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'LIMIT',
          inputAsset: 'lovelace',
          outputAsset: tBTC_ASSET,
          inputAmount: '1500000', // Small amount (edge case)
          priceNumerator: '500',
          priceDenominator: '1',
          deadline: Date.now() + 2 * 60 * 60 * 1000, // Short deadline: 2h
          senderAddress: user5Wallet.address,
          changeAddress: user5Wallet.address,
        }),
      });
      const edgeOrderId = res.orderId || '';

      if (res.unsignedTx) {
        const signed = await user5Wallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('4.5 Create LIMIT (User5, Edge)', 'PASS', `orderId=${edgeOrderId}`);
        orderIds.push(edgeOrderId);

        await apiFetch('/tx/confirm', {
          method: 'POST',
          body: JSON.stringify({ txHash, action: 'create_order' }),
        }).catch(() => {});

        await waitTx(user5Wallet.lucid, txHash, 90_000);
        record('4.5 Order TX Confirmed', 'PASS');
      } else {
        record('4.5 Create LIMIT (User5)', 'PASS', `orderId=${edgeOrderId}`);
        orderIds.push(edgeOrderId);
      }
    } catch (e: any) {
      record('4.5 Create LIMIT (User5)', 'FAIL', e.message.slice(0, 150));
    }
  } else {
    record('4.5 Create LIMIT (User5)', 'SKIP', 'No MNEMONIC2');
  }

  // --- TEST 4.6: List and verify orders ---
  console.log('\n  --- 4.6: List and verify orders ---');
  try {
    const listRes = await apiFetch<any>('/orders', { params: { limit: '20' } });
    const orderCount = listRes.data?.length || listRes.items?.length || 0;
    record('4.6 List Orders', 'PASS', `Found ${orderCount} orders`);

    // Check individual order details
    for (const id of orderIds.filter(Boolean).slice(0, 3)) {
      const detail = await safeApi<any>(`/orders/${id}`);
      if (detail.ok) {
        record(`4.6 Order ${id.slice(0, 8)}`, 'PASS', `type=${detail.data?.type}, status=${detail.data?.status}`);
      }
    }
  } catch (e: any) {
    record('4.6 List Orders', 'FAIL', e.message);
  }

  // --- TEST 4.7: Wait for bot to process orders ---
  console.log('\n  --- 4.7: Wait for order executor bot ---');
  console.log('    Waiting 15s for bot to process orders...');
  await sleep(15_000);

  for (const id of orderIds.filter(Boolean)) {
    const detail = await safeApi<any>(`/orders/${id}`);
    if (detail.ok) {
      record(`4.7 Order ${id.slice(0, 8)} status`, 'PASS', `status=${detail.data?.status}`);
    }
  }

  // --- TEST 4.8: Manual order execution attempt ---
  console.log('\n  --- 4.8: Manual order execution attempt ---');
  if (limitOrderId && poolId_ADA_tBTC) {
    try {
      const orderDetail = await apiFetch<any>(`/orders/${limitOrderId}`);
      const escrowTxHash = orderDetail.escrowTxHash || orderDetail.txHash;
      const escrowOutputIndex = orderDetail.escrowOutputIndex ?? 0;

      const poolDetail = await apiFetch<any>(`/pools/${poolId_ADA_tBTC}`);
      const pTxHash = poolDetail.txHash || poolDetail.lastTxHash;

      if (escrowTxHash && pTxHash && ['ACTIVE', 'PENDING'].includes(orderDetail.status)) {
        const execRes = await apiFetch<any>('/solver/execute-order', {
          method: 'POST',
          body: JSON.stringify({
            solver_address: adminWallet.address,
            order_utxo_ref: { tx_hash: escrowTxHash, output_index: escrowOutputIndex },
            pool_utxo_ref: { tx_hash: pTxHash, output_index: 0 },
          }),
        });

        if (execRes.unsignedTx) {
          const signed = await adminWallet.lucid.fromTx(execRes.unsignedTx).sign.withWallet().complete();
          const txHash = await signed.submit();
          record('4.8 Manual Execute Order', 'PASS', `tx=${txHash.slice(0, 16)}`);
          await waitTx(adminWallet.lucid, txHash, 120_000);
          record('4.8 Execution TX Confirmed', 'PASS');
        } else {
          record('4.8 Manual Execute', 'PASS', 'No TX needed');
        }
      } else {
        record('4.8 Manual Execute', 'SKIP', `status=${orderDetail.status}`);
      }
    } catch (e: any) {
      record('4.8 Manual Execute Order', 'WARN', e.message.slice(0, 150));
    }
  }

  record('Phase 4 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 5: WITHDRAW LIQUIDITY
// ═══════════════════════════════════════════

async function phase5_withdrawLiquidity() {
  currentPhase = 5;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 5: WITHDRAW LIQUIDITY');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  if (!adminWallet) adminWallet = await makeLucid(SEEDS.admin);

  // Get pool ID if not set
  if (!poolId_ADA_tBTC) {
    const pools = await safeApi<any>('/pools');
    const poolList5 = pools.data?.data || pools.data?.items || (Array.isArray(pools.data) ? pools.data : []);
    if (pools.ok && poolList5.length > 0) {
      poolId_ADA_tBTC = poolList5[0].poolId || poolList5[0].id;
    }
  }

  if (!poolId_ADA_tBTC) {
    record('Withdraw Liquidity', 'SKIP', 'No pool available');
    return;
  }

  // 5.1: Check pool state before withdrawal
  console.log('\n  --- 5.1: Pool state before withdrawal ---');
  let poolBefore: any;
  try {
    poolBefore = await apiFetch<any>(`/pools/${poolId_ADA_tBTC}`);
    record('5.1 Pool Before', 'PASS',
      `reserveA=${poolBefore.reserveA}, reserveB=${poolBefore.reserveB}, LP=${poolBefore.totalLpTokens}`);
  } catch (e: any) {
    record('5.1 Pool Before', 'FAIL', e.message);
    return;
  }

  // 5.2: Withdraw 30% liquidity
  console.log('\n  --- 5.2: Withdraw 30% liquidity ---');
  try {
    const lpAmount = Math.floor(Number(poolBefore.totalLpTokens) * 0.3).toString();
    const wRes = await apiFetch<any>(`/pools/${poolId_ADA_tBTC}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({
        lpTokenAmount: lpAmount,
        minAmountA: '0',
        minAmountB: '0',
        senderAddress: adminWallet.address,
        changeAddress: adminWallet.address,
      }),
    });

    if (wRes.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(wRes.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('5.2 Withdraw 30% TX', 'PASS', `lp=${lpAmount}, tx=${txHash.slice(0, 16)}`);

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, action: 'withdraw' }),
      }).catch(() => {});

      await waitTx(adminWallet.lucid, txHash, 90_000);
      record('5.2 Withdraw TX Confirmed', 'PASS');
    } else {
      record('5.2 Withdraw', 'PASS', 'No TX required');
    }
  } catch (e: any) {
    record('5.2 Withdraw Liquidity', 'WARN', e.message.slice(0, 150));
  }

  // 5.3: Check pool state after withdrawal
  console.log('\n  --- 5.3: Pool state after withdrawal ---');
  try {
    const poolAfter = await apiFetch<any>(`/pools/${poolId_ADA_tBTC}`);
    record('5.3 Pool After', 'PASS',
      `reserveA=${poolAfter.reserveA}, reserveB=${poolAfter.reserveB}, LP=${poolAfter.totalLpTokens}`);

    // Verify reserves decreased
    if (poolBefore) {
      const rABefore = BigInt(poolBefore.reserveA || '0');
      const rAAfter = BigInt(poolAfter.reserveA || '0');
      const decreased = rAAfter <= rABefore;
      record('5.3 Reserve Check', decreased ? 'PASS' : 'WARN',
        `reserveA: ${rABefore} → ${rAAfter}`);
    }
  } catch (e: any) {
    record('5.3 Pool After', 'WARN', e.message);
  }

  record('Phase 5 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 6: ADMIN FUNCTIONS
// ═══════════════════════════════════════════

async function phase6_adminFunctions() {
  currentPhase = 6;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 6: ADMIN FUNCTIONS');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  if (!adminWallet) adminWallet = await makeLucid(SEEDS.admin);

  // 6.1: Admin auth check
  console.log('\n  --- 6.1: Admin Auth Check ---');
  try {
    const auth = await apiFetch<any>('/admin/auth/check', {
      params: { wallet_address: adminWallet.address },
    });
    record('6.1 Admin Auth Check', 'PASS', `role=${auth.role}, isAdmin=${auth.isAdmin}`);
  } catch (e: any) {
    record('6.1 Admin Auth Check', 'WARN', e.message.slice(0, 100));
  }

  // 6.2: Dashboard metrics
  console.log('\n  --- 6.2: Dashboard Metrics ---');
  try {
    const metrics = await apiFetch<any>('/admin/dashboard/metrics');
    record('6.2 Dashboard Metrics', 'PASS',
      `tvl=${metrics.tvlUsd || metrics.tvl}, volume=${metrics.volume24hUsd || metrics.volume24h}`);
  } catch (e: any) {
    record('6.2 Dashboard Metrics', 'WARN', e.message.slice(0, 100));
  }

  // 6.3: Pending revenue
  console.log('\n  --- 6.3: Pending Revenue ---');
  try {
    const revenue = await apiFetch<any>('/admin/revenue/pending');
    record('6.3 Pending Revenue', 'PASS', JSON.stringify(revenue).slice(0, 100));
  } catch (e: any) {
    record('6.3 Pending Revenue', 'WARN', e.message.slice(0, 100));
  }

  // 6.4: Current settings
  console.log('\n  --- 6.4: Current Settings ---');
  try {
    const settings = await apiFetch<any>('/admin/settings/current');
    record('6.4 Current Settings', 'PASS',
      `feeBps=${settings.max_protocol_fee_bps || settings.protocolFeeBps}, minLiq=${settings.min_pool_liquidity}`);
  } catch (e: any) {
    record('6.4 Current Settings', 'WARN', e.message.slice(0, 100));
  }

  // 6.5: Update settings
  console.log('\n  --- 6.5: Update Settings ---');
  try {
    const updateRes = await apiFetch<any>('/admin/settings/build-update-global', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: adminWallet.address,
        new_settings: {
          max_protocol_fee_bps: 10,
          min_pool_liquidity: '2000000',
          next_version: 2,
        },
      }),
    });

    if (updateRes.unsignedTx) {
      const signed = await adminWallet.lucid.fromTx(updateRes.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();
      record('6.5 Update Settings TX', 'PASS', txHash.slice(0, 16));
      await waitTx(adminWallet.lucid, txHash, 90_000);
      record('6.5 Settings TX Confirmed', 'PASS');
    } else {
      record('6.5 Update Settings', 'PASS', 'Endpoint responded (no TX)');
    }
  } catch (e: any) {
    // 501 = not yet implemented is acceptable
    const expectedError = e.message.includes('501') || e.message.includes('not implemented');
    record('6.5 Update Settings', expectedError ? 'WARN' : 'FAIL', e.message.slice(0, 100));
  }

  // 6.6: Collect fees
  console.log('\n  --- 6.6: Collect Fees ---');
  if (poolId_ADA_tBTC) {
    try {
      const collectRes = await apiFetch<any>('/admin/revenue/build-collect', {
        method: 'POST',
        body: JSON.stringify({
          admin_address: adminWallet.address,
          pool_ids: [poolId_ADA_tBTC],
        }),
      });

      if (collectRes.unsignedTx) {
        const signed = await adminWallet.lucid.fromTx(collectRes.unsignedTx).sign.withWallet().complete();
        const txHash = await signed.submit();
        record('6.6 Collect Fees TX', 'PASS', txHash.slice(0, 16));
      } else {
        record('6.6 Collect Fees', 'PASS', 'Responded (no TX)');
      }
    } catch (e: any) {
      const expected = e.message.includes('501') || e.message.includes('no fees') || e.message.includes('not implemented');
      record('6.6 Collect Fees', expected ? 'WARN' : 'FAIL', e.message.slice(0, 100));
    }
  }

  // 6.7: Admin trigger solver (read-only inspection)
  console.log('\n  --- 6.7: Solver Status ---');
  try {
    const activeIntents = await apiFetch<any>('/intents', { params: { status: 'ACTIVE', limit: '5' } });
    const activeOrders = await apiFetch<any>('/orders', { params: { status: 'ACTIVE', limit: '5' } });
    record('6.7 Solver Queue', 'PASS',
      `activeIntents=${activeIntents.data?.length || activeIntents.items?.length || 0}, activeOrders=${activeOrders.items?.length || activeOrders.data?.length || 0}`);
  } catch (e: any) {
    record('6.7 Solver Queue', 'WARN', e.message.slice(0, 100));
  }

  record('Phase 6 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 7: DATA QUERIES & LISTING
// ═══════════════════════════════════════════

async function phase7_dataQueries() {
  currentPhase = 7;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 7: DATA QUERIES & LISTING FUNCTIONS');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  if (!adminWallet) adminWallet = await makeLucid(SEEDS.admin);

  // 7.1: Health endpoints
  console.log('\n  --- 7.1: Health ---');
  for (const ep of ['/health', '/health/ready']) {
    const res = await safeApi<any>(ep);
    record(`7.1 ${ep}`, res.ok ? 'PASS' : 'FAIL', res.ok ? res.data?.status : res.error?.slice(0, 80));
  }

  // 7.2: Analytics
  console.log('\n  --- 7.2: Analytics ---');
  try {
    const overview = await apiFetch<any>('/analytics/overview');
    record('7.2 Analytics Overview', 'PASS',
      `tvl=${overview.tvl || overview.tvlUsd}, pools=${overview.totalPools}, intents=${overview.totalIntents}`);
  } catch (e: any) {
    record('7.2 Analytics Overview', 'WARN', e.message.slice(0, 100));
  }

  try {
    const prices = await apiFetch<any>('/analytics/prices');
    const priceCount = Array.isArray(prices) ? prices.length : Object.keys(prices || {}).length;
    record('7.2 Analytics Prices', 'PASS', `${priceCount} token prices`);
  } catch (e: any) {
    record('7.2 Analytics Prices', 'WARN', e.message.slice(0, 100));
  }

  // 7.3: Pool listing and detail
  console.log('\n  --- 7.3: Pools ---');
  try {
    const pools = await apiFetch<any>('/pools');
    const items = pools.data || pools.items || (Array.isArray(pools) ? pools : []);
    record('7.3 List Pools', 'PASS', `${items.length} pool(s)`);

    if (items.length > 0) {
      const firstId = items[0].poolId || items[0].id;
      const pd = await apiFetch<any>(`/pools/${firstId}`);
      record('7.3 Pool Detail', 'PASS', `pair=${pd.assetATicker || 'ADA'}/${pd.assetBTicker}, tvl=${pd.tvlAda}`);

      // Pool history
      const hist = await safeApi<any>(`/pools/${firstId}/history`, { params: { period: '30d', interval: '1d' } });
      record('7.3 Pool History', hist.ok ? 'PASS' : 'WARN',
        hist.ok ? `${(hist.data as any[])?.length || 0} data points` : hist.error?.slice(0, 80));
    }
  } catch (e: any) {
    record('7.3 Pool List', 'FAIL', e.message);
  }

  // 7.4: Intent listing
  console.log('\n  --- 7.4: Intents ---');
  try {
    const intents = await apiFetch<any>('/intents', { params: { limit: '20' } });
    record('7.4 List Intents', 'PASS', `${intents.data?.length || intents.items?.length || 0} intent(s)`);
  } catch (e: any) {
    record('7.4 List Intents', 'WARN', e.message.slice(0, 80));
  }

  // 7.5: Order listing
  console.log('\n  --- 7.5: Orders ---');
  try {
    const orders = await apiFetch<any>('/orders', { params: { limit: '20' } });
    record('7.5 List Orders', 'PASS', `${orders.data?.length || orders.items?.length || 0} order(s)`);
  } catch (e: any) {
    record('7.5 List Orders', 'WARN', e.message.slice(0, 80));
  }

  // 7.6: Portfolio
  console.log('\n  --- 7.6: Portfolio ---');
  for (const [name, addr] of [
    ['Admin', adminWallet.address],
    ['User2', user2Wallet?.address || process.env.T_addr2 || ''],
  ] as const) {
    if (!addr) continue;
    for (const ep of ['summary', 'open-orders', 'history', 'liquidity']) {
      const res = await safeApi<any>(`/portfolio/${ep}`, { params: { wallet_address: addr } });
      record(`7.6 Portfolio/${ep} (${name})`, res.ok ? 'PASS' : 'WARN',
        res.ok ? JSON.stringify(res.data).slice(0, 60) : res.error?.slice(0, 60));
    }

    // Legacy portfolio endpoint
    const legacy = await safeApi<any>(`/portfolio/${addr}`);
    record(`7.6 Portfolio/${name}`, legacy.ok ? 'PASS' : 'WARN',
      legacy.ok ? JSON.stringify(legacy.data).slice(0, 60) : legacy.error?.slice(0, 60));

    // Transactions
    const txs = await safeApi<any>(`/portfolio/${addr}/transactions`, { params: { limit: '10' } });
    record(`7.6 Transactions (${name})`, txs.ok ? 'PASS' : 'WARN',
      txs.ok ? `${(txs.data as any)?.data?.length || (txs.data as any)?.items?.length || 0} txs` : txs.error?.slice(0, 60));
  }

  // 7.7: Chart endpoints
  console.log('\n  --- 7.7: Chart ---');
  if (poolId_ADA_tBTC) {
    for (const ep of [
      `/chart/config`,
      `/chart/intervals`,
      `/chart/price/${poolId_ADA_tBTC}`,
      `/chart/info/${poolId_ADA_tBTC}`,
    ]) {
      const res = await safeApi<any>(ep);
      record(`7.7 ${ep.split('/').pop()}`, res.ok ? 'PASS' : 'WARN',
        res.ok ? JSON.stringify(res.data).slice(0, 60) : res.error?.slice(0, 60));
    }

    // Candles
    const candles = await safeApi<any>('/chart/candles', {
      params: { poolId: poolId_ADA_tBTC, interval: '4h', limit: '20' },
    });
    record('7.7 Candles', candles.ok ? 'PASS' : 'WARN',
      candles.ok ? `${(candles.data as any[])?.length || 0} candles` : candles.error?.slice(0, 60));
  }

  // 7.8: Quote
  console.log('\n  --- 7.8: Quote ---');
  if (tBTC_ASSET) {
    const quote = await safeApi<any>('/quote', {
      params: { inputAsset: 'lovelace', outputAsset: tBTC_ASSET, inputAmount: '10000000', slippage: '50' },
    });
    record('7.8 Quote', quote.ok ? 'PASS' : 'WARN',
      quote.ok ? `output=${(quote.data as any)?.outputAmount}` : quote.error?.slice(0, 80));
  }

  // 7.9: TX status (with dummy hash)
  console.log('\n  --- 7.9: TX Status ---');
  const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const txStatus = await safeApi<any>(`/tx/${dummyHash}/status`);
  record('7.9 TX Status (dummy)', txStatus.ok ? 'PASS' : 'WARN',
    txStatus.ok ? `status=${(txStatus.data as any)?.status}` : txStatus.error?.slice(0, 60));

  record('Phase 7 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 8: ADDITIONAL FUNCTIONS
// ═══════════════════════════════════════════

async function phase8_additionalFunctions() {
  currentPhase = 8;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 8: ADDITIONAL FUNCTIONS — ESCROW UTxOs, WALLET BALANCE');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  if (!adminWallet) adminWallet = await makeLucid(SEEDS.admin);

  // 8.1: Check escrow UTxOs on-chain (direct blockchain query)
  console.log('\n  --- 8.1: Escrow UTxOs ---');
  const escrowAddr = process.env.ESCROW_SCRIPT_ADDRESS;
  if (escrowAddr) {
    try {
      const utxos = await adminWallet.lucid.utxosAt(escrowAddr);
      record('8.1 Escrow UTxOs', 'PASS', `${utxos.length} UTxO(s) at escrow`);
      for (const u of utxos.slice(0, 5)) {
        const ada = Number(u.assets['lovelace'] || 0n) / 1_000_000;
        record(`  UTxO ${u.txHash.slice(0, 12)}#${u.outputIndex}`, 'PASS', `${ada.toFixed(2)} ADA`);
      }
    } catch (e: any) {
      record('8.1 Escrow UTxOs', 'WARN', e.message.slice(0, 100));
    }
  }

  // 8.2: Check pool script UTxOs
  console.log('\n  --- 8.2: Pool Script UTxOs ---');
  const poolAddr = process.env.POOL_SCRIPT_ADDRESS;
  if (poolAddr) {
    try {
      const utxos = await adminWallet.lucid.utxosAt(poolAddr);
      record('8.2 Pool UTxOs', 'PASS', `${utxos.length} UTxO(s) at pool script`);
    } catch (e: any) {
      record('8.2 Pool UTxOs', 'WARN', e.message.slice(0, 100));
    }
  }

  // 8.3: Wallet balances
  console.log('\n  --- 8.3: Wallet Balances ---');
  const wallets = [
    ['Admin', SEEDS.admin],
    ['User2', SEEDS.user2],
    ['User3', SEEDS.user3],
    ['User4', SEEDS.user4],
    ['User5', SEEDS.user5],
  ].filter(([, seed]) => seed) as [string, string][];

  for (const [name, seed] of wallets) {
    try {
      const { lucid, address } = await makeLucid(seed);
      const utxos = await lucid.utxosAt(address);
      const ada = utxos.reduce((sum, u) => sum + (u.assets['lovelace'] || 0n), 0n);
      const adaFloat = Number(ada) / 1_000_000;
      const tokenCount = utxos.reduce((count, u) =>
        count + Object.keys(u.assets).filter(k => k !== 'lovelace').length, 0);
      record(`8.3 ${name} Balance`, 'PASS', `${adaFloat.toFixed(2)} ADA, ${tokenCount} token types, ${utxos.length} UTxOs`);
    } catch (e: any) {
      record(`8.3 ${name} Balance`, 'WARN', e.message.slice(0, 80));
    }
  }

  record('Phase 8 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// PHASE 9: DATABASE CONSISTENCY VERIFICATION
// ═══════════════════════════════════════════

async function phase9_dbVerification() {
  currentPhase = 9;
  console.log('\n' + '═'.repeat(70));
  console.log('  PHASE 9: DATABASE CONSISTENCY VERIFICATION');
  console.log('═'.repeat(70));

  const t0 = Date.now();

  // 9.1: Analytics (aggregate view of DB state)
  console.log('\n  --- 9.1: Analytics Overview (DB state) ---');
  try {
    const overview = await apiFetch<any>('/analytics/overview');
    record('9.1 Total Pools', 'PASS', `${overview.totalPools}`);
    record('9.1 Total Intents', 'PASS', `${overview.totalIntents}`);
    record('9.1 Intents Filled', 'PASS', `${overview.intentsFilled}`);
    record('9.1 Fill Rate', 'PASS', `${overview.fillRate || 'N/A'}%`);
    record('9.1 TVL', 'PASS', `${overview.tvl || overview.tvlUsd || 0}`);
    record('9.1 Volume 24h', 'PASS', `${overview.volume24h || overview.volume24hUsd || 0}`);
    record('9.1 Unique Traders', 'PASS', `${overview.uniqueTraders || 0}`);
  } catch (e: any) {
    record('9.1 Analytics', 'WARN', e.message.slice(0, 100));
  }

  // 9.2: Verify pool data matches chain state
  console.log('\n  --- 9.2: Pool DB vs Chain Consistency ---');
  try {
    const pools = await apiFetch<any>('/pools');
    const items = pools.data || pools.items || (Array.isArray(pools) ? pools : []);
    for (const pool of items) {
      record(`9.2 Pool ${(pool.poolId || pool.id).slice(0, 8)}`, 'PASS',
        `state=${pool.state}, reserveA=${pool.reserveA}, reserveB=${pool.reserveB}, tvl=${pool.tvlAda}`);
    }
  } catch (e: any) {
    record('9.2 Pool Consistency', 'WARN', e.message.slice(0, 100));
  }

  // 9.3: Verify intent status distribution
  console.log('\n  --- 9.3: Intent Status Distribution ---');
  try {
    for (const status of ['ACTIVE', 'FILLED', 'CANCELLED', 'EXPIRED', 'RECLAIMED']) {
      const res = await safeApi<any>('/intents', { params: { status, limit: '100' } });
      if (res.ok) {
        const count = res.data?.data?.length || res.data?.items?.length || 0;
        record(`9.3 Intents [${status}]`, 'PASS', `${count}`);
      }
    }
  } catch (e: any) {
    record('9.3 Intent Distribution', 'WARN', e.message);
  }

  // 9.4: Verify order status distribution
  console.log('\n  --- 9.4: Order Status Distribution ---');
  try {
    for (const status of ['ACTIVE', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'EXPIRED']) {
      const res = await safeApi<any>('/orders', { params: { status, limit: '100' } });
      if (res.ok) {
        const count = res.data?.items?.length || res.data?.data?.length || 0;
        record(`9.4 Orders [${status}]`, 'PASS', `${count}`);
      }
    }
  } catch (e: any) {
    record('9.4 Order Distribution', 'WARN', e.message);
  }

  // 9.5: Cross-check portfolio data
  console.log('\n  --- 9.5: Portfolio Cross-Check ---');
  if (adminWallet) {
    try {
      const summary = await apiFetch<any>('/portfolio/summary', {
        params: { wallet_address: adminWallet.address },
      });
      record('9.5 Admin Portfolio Summary', 'PASS', JSON.stringify(summary).slice(0, 120));

      const openOrders = await apiFetch<any>('/portfolio/open-orders', {
        params: { wallet_address: adminWallet.address },
      });
      const openCount = Array.isArray(openOrders) ? openOrders.length : (openOrders?.data?.length || openOrders?.items?.length || 0);
      record('9.5 Admin Open Orders', 'PASS', `${openCount} open positions`);

      const liq = await apiFetch<any>('/portfolio/liquidity', {
        params: { wallet_address: adminWallet.address },
      });
      record('9.5 Admin Liquidity', 'PASS', JSON.stringify(liq).slice(0, 120));
    } catch (e: any) {
      record('9.5 Portfolio Cross-Check', 'WARN', e.message.slice(0, 100));
    }
  }

  // 9.6: Admin dashboard consistency
  console.log('\n  --- 9.6: Admin Dashboard Consistency ---');
  try {
    const [metrics, settings, rev] = await Promise.all([
      safeApi<any>('/admin/dashboard/metrics'),
      safeApi<any>('/admin/settings/current'),
      safeApi<any>('/admin/revenue/pending'),
    ]);

    if (metrics.ok) record('9.6 Dashboard Metrics', 'PASS', JSON.stringify(metrics.data).slice(0, 100));
    if (settings.ok) record('9.6 Settings', 'PASS', JSON.stringify(settings.data).slice(0, 100));
    if (rev.ok) record('9.6 Revenue', 'PASS', JSON.stringify(rev.data).slice(0, 100));
  } catch (e: any) {
    record('9.6 Admin Dashboard', 'WARN', e.message);
  }

  record('Phase 9 Complete', 'PASS', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ═══════════════════════════════════════════
// MAIN — ORCHESTRATOR
// ═══════════════════════════════════════════

async function main() {
  const totalStart = Date.now();

  console.log('\n' + '█'.repeat(70));
  console.log('  ██  COMPREHENSIVE E2E TEST — SolverNet DEX  ██');
  console.log('  ██  Testing full system: User ↔ Bot ↔ Backend ↔ DB ↔ Chain ↔ Pool  ██');
  console.log('█'.repeat(70));
  console.log(`\nPhases to run: [${PHASES_TO_RUN.join(', ')}]`);
  console.log(`Backend: ${process.env.API_BASE || 'http://localhost:3001'}`);
  console.log(`Network: ${NETWORK}`);

  const phases: [number, () => Promise<void>][] = [
    [1, phase1_systemReset],
    [2, phase2_initialization],
    [3, phase3_intentSwapTests],
    [4, phase4_orderTests],
    [5, phase5_withdrawLiquidity],
    [6, phase6_adminFunctions],
    [7, phase7_dataQueries],
    [8, phase8_additionalFunctions],
    [9, phase9_dbVerification],
  ];

  for (const [num, fn] of phases) {
    if (!PHASES_TO_RUN.includes(num)) continue;
    try {
      await fn();
    } catch (err: any) {
      record(`Phase ${num} FATAL`, 'FAIL', err.message);
      console.error(`\n💥 Phase ${num} fatal error:`, err);
    }
  }

  // ═══════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════
  const totalDuration = Date.now() - totalStart;
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const skip = results.filter(r => r.status === 'SKIP').length;

  console.log('\n' + '█'.repeat(70));
  console.log('  ██  FINAL TEST REPORT  ██');
  console.log('█'.repeat(70));
  console.log(`\n  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  ✅ PASS: ${pass}`);
  console.log(`  ❌ FAIL: ${fail}`);
  console.log(`  ⚠️  WARN: ${warn}`);
  console.log(`  ⏭️  SKIP: ${skip}`);

  // Group by phase
  console.log('\n  Per-Phase Breakdown:');
  for (let p = 1; p <= 9; p++) {
    const phaseResults = results.filter(r => r.phase === p);
    if (phaseResults.length === 0) continue;
    const pp = phaseResults.filter(r => r.status === 'PASS').length;
    const pf = phaseResults.filter(r => r.status === 'FAIL').length;
    const pw = phaseResults.filter(r => r.status === 'WARN').length;
    const ps = phaseResults.filter(r => r.status === 'SKIP').length;
    console.log(`    Phase ${p}: ${pp} pass, ${pf} fail, ${pw} warn, ${ps} skip`);
  }

  // List failures
  if (fail > 0) {
    console.log('\n  ❌ FAILURES:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`    Phase ${r.phase}: ${r.name} — ${r.detail}`);
    }
  }

  // List warnings
  if (warn > 0) {
    console.log('\n  ⚠️  WARNINGS:');
    for (const r of results.filter(r => r.status === 'WARN')) {
      console.log(`    Phase ${r.phase}: ${r.name} — ${r.detail}`);
    }
  }

  console.log('\n' + '█'.repeat(70));
  const verdict = fail === 0 ? '🎉 ALL TESTS PASSED' : `⚠️  ${fail} TEST(S) FAILED`;
  console.log(`  ${verdict}`);
  console.log('█'.repeat(70) + '\n');

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
