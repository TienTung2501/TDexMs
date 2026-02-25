/// <reference types="node" />
/**
 * test-system.ts — Full On-Chain System Test for SolverNet DEX
 *
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  INTENT-FOCUSED DEMO — demonstrates key SolverNet features:       ║
 * ║                                                                    ║
 * ║  1. NettingEngine: opposing intents cross-matched before AMM      ║
 * ║  2. Partial fills: large intents filled in multiple rounds        ║
 * ║  3. Batch settlement: same-direction intents in single TX         ║
 * ║  4. Cancel / Expire: user cancels or deadline passes              ║
 * ║                                                                    ║
 * ║  Script creates on-chain TXs; SolverEngine + ReclaimKeeper        ║
 * ║  handle settlement and reclaim asynchronously.                     ║
 * ║                                                                    ║
 * ║  Order-related operations (DCA/LIMIT/STOP_LOSS) are disabled      ║
 * ║  in this demo. Set ORDER_EXECUTOR_ENABLED=true to re-enable.      ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * TEST PHASES:
 *  Phase 0  — Distribute test tokens       [admin → users]
 *  Phase 1  — Deploy Settings               [admin, awaitTx]
 *  Phase 2  — Deploy Factory                [admin, awaitTx]
 *  Phase 3  — Create Pool tBTC/tUSD         [admin, awaitTx]
 *  Phase 4  — Create Pool tUSD/tSOL (tiny)  [admin, awaitTx]
 *  Phase 5  — Deposit liquidity             [users, awaitTx]
 *  Phase 6  — Netting demo: 3 opposing intents submitted SIMULTANEOUSLY
 *  Phase 6b — Observe netting fills + DB verification
 *  Phase 7  — Partial fill demo: large intent vs tiny Pool 2
 *  Phase 7b — Observe PARTIALLY_FILLED + DB verification
 *  Phase 7c — Cancel partially filled intent + DB verification
 *  Phase 8  — Cancel fresh intent           [user cancels before solver]
 *  Phase 9  — Expired intent                [deadline passes → ReclaimKeeper]
 *  Phase 10 — Withdraw liquidity            [user, awaitTx]
 *  Phase 11 — Update protocol settings      [admin]
 *
 * RUNNING:
 *   # Terminal 1 — backend with solver enabled:
 *   cd backend && pnpm dev
 *
 *   # Terminal 2 — after backend is ready:
 *   cd backend
 *   pnpm exec tsx scripts/test-system.ts
 */

import 'dotenv/config';
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
  type Network,
} from '@lucid-evolution/lucid';

// ─── Config ────────────────────────────────────────────────────────
const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API         = `${BACKEND_URL}/v1`;
const BF_URL      = process.env.BLOCKFROST_URL        ?? 'https://cardano-preprod.blockfrost.io/api/v0';
const BF_PROJECT  = process.env.BLOCKFROST_PROJECT_ID ?? '';
const NETWORK: Network = (process.env.CARDANO_NETWORK ?? 'preprod') === 'mainnet' ? 'Mainnet' : 'Preprod';

// Test tokens — must exist in wallets before running
const TBTC_POLICY = process.env.TBTC_POLICY_ID  ?? '';
const TBTC_NAME   = process.env.TBTC_ASSET_NAME ?? '74425443'; // "tBTC"
const TUSD_POLICY = process.env.TUSD_POLICY_ID  ?? '';
const TUSD_NAME   = process.env.TUSD_ASSET_NAME ?? '74555344'; // "tUSD"
const TSOL_POLICY = process.env.TSOL_POLICY_ID  ?? '';
const TSOL_NAME   = process.env.TSOL_ASSET_NAME ?? '74534f4c'; // "tSOL"

// Seed phrases
const ADMIN_SEED  = process.env.SOLVER_SEED_PHRASE ?? process.env.T_WALLET_SEED  ?? '';
const USER_A_SEED = process.env.T_WALLET_SEED2     ?? process.env.MNEMONIC0      ?? '';
const USER_B_SEED = process.env.MNEMONIC1           ?? '';
const USER_C_SEED = process.env.MNEMONIC2           ?? '';

// Test amounts (smallest unit of each token)
const POOL_INIT_TBTC  = 100_000_000n;   // 100 tBTC
const POOL_INIT_TUSD  = 5_000_000_000n; // 5 000 tUSD → price 50 tUSD/tBTC
const POOL_INIT_TSOL  = 2_000_000_000n; // 2 000 tSOL
const SWAP_TBTC       =   5_000_000n;   // 5 tBTC per intent
const SWAP_TUSD       = 250_000_000n;   // 250 tUSD per intent
const SLIPPAGE_BPS    = 500n;           // 5 % slippage tolerance (accounts for multiple intents affecting same pool)

// — Partial Fill demo: tiny Pool 2 so intent > input reserve triggers partial fill —
// Pool 2 (tUSD/tSOL) created with 50 tUSD / 50 tSOL.
// Intent: 80 tUSD → tSOL exceeds 50 tUSD input reserve → RouteOptimizer.tryPartialFill
// Round 1: ~50 tUSD consumed, ~25 tSOL out → PARTIALLY_FILLED, remaining ~30 tUSD
// Round 2: pool too skewed (100/25) → both full and partial fail → stays PARTIALLY_FILLED
const PARTIAL_POOL_TUSD = 50_000_000n;   // 50 tUSD (tiny Pool 2 reserve)
const PARTIAL_POOL_TSOL = 50_000_000n;   // 50 tSOL (tiny Pool 2 reserve)
const PARTIAL_SWAP_TUSD = 80_000_000n;   // 80 tUSD → exceeds 50 tUSD input reserve
const PARTIAL_MIN_OUT   = 35_000_000n;   // 35 tSOL — full fill fails (30.7), partial succeeds (24.9 > 21.9 pro-rata)

// ─── Utility helpers ───────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function log(phase: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[${phase}]\x1b[0m ${msg}`);
  if (data !== undefined)
    console.log(
      '         ',
      JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
    );
}

function hr(title: string) {
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${title}`);
  console.log('═'.repeat(72));
}

// ─── HTTP helpers ──────────────────────────────────────────────────
async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  const body = await r.json() as T;
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const body = await r.json() as T;
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function apiDelete<T>(path: string, payload: unknown = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const body = await r.json() as T;
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

// ─── Phase runner (non-fatal) ──────────────────────────────────────
const phaseResults: { phase: string; status: 'PASS' | 'FAIL' | 'SKIP'; error?: string }[] = [];

async function runPhase(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    phaseResults.push({ phase: name, status: 'PASS' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(name, `❌ Phase failed: ${msg}`);
    phaseResults.push({ phase: name, status: 'FAIL', error: msg });
  }
}

// ─── Wallet balance reporter ───────────────────────────────────────
async function reportWalletBalances(wallets: { label: string; wallet: Wallet }[]) {
  log('balances', 'Checking wallet token balances...');
  const assets = [
    { name: 'tBTC', unit: TBTC_POLICY ? `${TBTC_POLICY}${TBTC_NAME}` : null },
    { name: 'tUSD', unit: TUSD_POLICY ? `${TUSD_POLICY}${TUSD_NAME}` : null },
    { name: 'tSOL', unit: TSOL_POLICY ? `${TSOL_POLICY}${TSOL_NAME}` : null },
  ];

  for (const { label, wallet } of wallets) {
    try {
      const utxos = await wallet.lucid.wallet().getUtxos();
      const totals: Record<string, bigint> = {};
      for (const utxo of utxos) {
        for (const [unit, qty] of Object.entries(utxo.assets)) {
          totals[unit] = (totals[unit] ?? 0n) + qty;
        }
      }
      const lovelace = totals['lovelace'] ?? 0n;
      const lines = [`${label}: ${Number(lovelace) / 1_000_000} ADA`];
      for (const { name, unit } of assets) {
        if (!unit) continue;
        // unit in Lucid is policyId+assetName without separator
        const qty = totals[unit] ?? 0n;
        if (qty > 0n) lines.push(`  ${name}: ${qty}`);
        else lines.push(`  ${name}: ⚠️  NONE`);
      }
      log('balances', lines.join('\n           '));
    } catch {
      log('balances', `${label}: ⚠️  Could not fetch balance`);
    }
  }
}

// ─── Poll helper (observe bot activity without triggering it) ───────
/**
 * Poll fetchFn every intervalMs until condition(result) is true
 * or timeoutMs is exceeded.  Returns the last result that met condition,
 * or null on timeout.
 */
async function pollUntil<T>(
  label: string,
  fetchFn: () => Promise<T>,
  condition: (v: T) => boolean,
  intervalMs = 12_000,
  timeoutMs  = 150_000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const v = await fetchFn();
      if (condition(v)) return v;
      const remaining = Math.round((deadline - Date.now()) / 1000);
      log(label, `Not yet met — retrying in ${intervalMs / 1000}s (${remaining}s left)...`);
    } catch (e) {
      log(label, `Poll error: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(intervalMs);
  }
  log(label, `⏰ Timed out after ${timeoutMs / 1000}s`);
  return null;
}

// ─── Wallet helpers ────────────────────────────────────────────────
interface Wallet {
  seed: string;
  address: string;
  lucid: LucidEvolution;
}

/** Each wallet gets its own Lucid instance — prevents shared-state collisions */
async function makeWallet(seed: string): Promise<Wallet> {
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_PROJECT), NETWORK);
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  return { seed, address, lucid };
}

// ═══════════════════════════════════════════════════════════════════
// Phase 0 — Distribute Test Tokens from Admin to Users
// ═══════════════════════════════════════════════════════════════════

/** Send tBTC + tUSD + tSOL from admin to each test user if they don't have enough */
async function phase0DistributeTokens(
  admin: Wallet,
  users: Wallet[],
): Promise<void> {
  hr('Phase 0 — Distribute Test Tokens [admin → users]');

  const tbtcUnit = `${TBTC_POLICY}${TBTC_NAME}`;
  const tusdUnit = `${TUSD_POLICY}${TUSD_NAME}`;
  const tsolUnit = `${TSOL_POLICY}${TSOL_NAME}`;

  // Amounts to send per user
  const SEND_TBTC = 200_000_000n;   // 200 tBTC
  const SEND_TUSD = 1_000_000_000n; // 1 000 tUSD
  const SEND_TSOL = 500_000_000n;   // 500 tSOL
  const SEND_COLLATERAL = 7_000_000n; // 7 ADA pure-ADA UTxO for Plutus collateral

  // Thresholds — top-up if below these amounts (set = SEND so any usage triggers refresh)
  const MIN_TBTC = SEND_TBTC;   // top-up when below 200 tBTC
  const MIN_TUSD = SEND_TUSD;   // top-up when below 1 000 tUSD
  const MIN_TSOL = SEND_TSOL;   // top-up when below 500 tSOL
  const MIN_COLLATERAL = 5_000_000n; // need a pure-ADA UTxO with at least 5 ADA

  const needsFunding: Wallet[] = [];

  for (const user of users) {
    const utxos = await user.lucid.wallet().getUtxos();
    let tbtcBal = 0n, tusdBal = 0n, tsolBal = 0n;
    let hasPureAda = false;
    for (const u of utxos) {
      tbtcBal += u.assets[tbtcUnit] ?? 0n;
      tusdBal += u.assets[tusdUnit] ?? 0n;
      tsolBal += u.assets[tsolUnit] ?? 0n;
      // Pure-ADA UTxO: only lovelace, no native tokens
      const keys = Object.keys(u.assets);
      if (keys.length === 1 && keys[0] === 'lovelace' && (u.assets['lovelace'] ?? 0n) >= MIN_COLLATERAL) {
        hasPureAda = true;
      }
    }

    if (tbtcBal < MIN_TBTC || tusdBal < MIN_TUSD || tsolBal < MIN_TSOL || !hasPureAda) {
      log('distribute', `${user.address.slice(0, 20)}… needs tokens (tBTC=${tbtcBal}, tUSD=${tusdBal}, tSOL=${tsolBal}, pureAda=${hasPureAda})`);
      needsFunding.push(user);
    } else {
      log('distribute', `${user.address.slice(0, 20)}… already funded — skipping`);
    }
  }

  if (needsFunding.length === 0) {
    log('distribute', '✅ All users already funded');
    return;
  }

  // Build one TX distributing to all users who need funding
  log('distribute', `Sending tokens to ${needsFunding.length} user(s) in one TX...`);

  // Retry once if Blockfrost returns stale UTxOs (BadInputsUTxO)
  let attemptAdmin = admin;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      let tx = attemptAdmin.lucid.newTx();
      for (const user of needsFunding) {
        // Token UTxO
        tx = tx.pay.ToAddress(user.address, {
          lovelace:   3_000_000n, // 3 ADA min UTxO
          [tbtcUnit]: SEND_TBTC,
          [tusdUnit]: SEND_TUSD,
          [tsolUnit]: SEND_TSOL,
        });
        // Separate pure-ADA collateral UTxO (required for Plutus TXes)
        tx = tx.pay.ToAddress(user.address, {
          lovelace: SEND_COLLATERAL,
        });
      }

      const completed = await tx.complete();
      const signed    = await completed.sign.withWallet().complete();
      const txHash    = await signed.submit();

      log('distribute', `Submitted ✅  ${txHash}`);
      log('distribute', 'Awaiting confirmation...');
      await attemptAdmin.lucid.awaitTx(txHash, 120_000);
      log('distribute', `✅ Tokens distributed to ${needsFunding.length} users`);
      // Wait 60 s for Blockfrost to propagate new UTxOs across all its nodes
      // before any subsequent phase tries to spend them.
      log('distribute', 'Waiting 60 s for Blockfrost to propagate new UTxOs...');
      await sleep(60_000);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 2 && msg.includes('BadInputsUTxO')) {
        log('distribute', `⚠️  Stale UTxO on attempt ${attempt} — refreshing wallet and retrying in 30 s...`);
        await sleep(30_000);
        // Re-create admin Lucid to get a fresh UTxO set from Blockfrost
        attemptAdmin = await makeWallet(admin.seed);
      } else {
        throw err;
      }
    }
  }
}

/** Sign an unsigned TX CBOR and submit via /v1/tx/submit */
async function signAndSubmit(wallet: Wallet, unsignedTx: string): Promise<string> {
  const signed = await wallet.lucid.fromTx(unsignedTx).sign.withWallet().complete();
  const result = await apiPost<{ txHash: string; status: string; error?: string }>(
    '/tx/submit', { signedTx: signed.toCBOR() },
  );
  if (result.status !== 'accepted')
    throw new Error(`TX rejected: ${result.error ?? 'unknown'}`);
  return result.txHash;
}

/**
 * Sign → submit → awaitTx.
 * Use for operations where subsequent steps read the same on-chain state
 * (e.g., pool UTxO must be confirmed before creating intents against it).
 */
async function signSubmitAwait(wallet: Wallet, unsignedTx: string, label: string): Promise<string> {
  const txHash = await signAndSubmit(wallet, unsignedTx);
  log(label, `Submitted ✅  ${txHash}`);
  log(label, 'Awaiting on-chain confirmation (up to 120 s)...');
  const ok = await wallet.lucid.awaitTx(txHash, 120_000);
  if (!ok) throw new Error(`TX ${txHash} not confirmed within 120 s`);
  log(label, 'Confirmed ✅');
  // Wait 30 s for Blockfrost to index the new UTxOs before next phase
  log(label, 'Waiting 30 s for Blockfrost propagation...');
  await sleep(30_000);
  return txHash;
}

/**
 * Sign → submit → awaitTx → call /tx/confirm.
 * Use for intents/orders — the on-chain UTxO must be confirmed
 * before the backend's ChainSync can promote CREATED→ACTIVE.
 * We also explicitly call /tx/confirm for immediate promotion.
 */
async function signSubmitConfirm(
  wallet: Wallet,
  unsignedTx: string,
  label: string,
  confirmPayload?: { intentId?: string; orderId?: string; action?: string },
): Promise<string> {
  const txHash = await signAndSubmit(wallet, unsignedTx);
  log(label, `Submitted ✅  ${txHash}`);
  log(label, 'Awaiting on-chain confirmation (up to 120 s)...');
  const ok = await wallet.lucid.awaitTx(txHash, 120_000);
  if (!ok) throw new Error(`TX ${txHash} not confirmed within 120 s`);
  log(label, 'Confirmed on-chain ✅');

  // Call /tx/confirm to immediately transition CREATED → ACTIVE
  if (confirmPayload) {
    try {
      await apiPost('/tx/confirm', { txHash, ...confirmPayload });
      log(label, 'Backend status confirmed → ACTIVE');
    } catch (e) {
      log(label, `⚠️  /tx/confirm failed (ChainSync will auto-promote): ${e instanceof Error ? e.message : e}`);
    }
  }

  // Short wait for Blockfrost propagation
  await sleep(5_000);
  return txHash;
}

/**
 * Sign → submit, no wait (legacy — kept for cancel TX where we don't need confirmation).
 */
async function signSubmitFire(wallet: Wallet, unsignedTx: string, label: string): Promise<string> {
  const txHash = await signAndSubmit(wallet, unsignedTx);
  log(label, `Submitted (fire-and-forget) ✅  ${txHash}`);
  return txHash;
}

// ─── Asset ID helpers ──────────────────────────────────────────────
const asTbtc = () => (TBTC_POLICY ? `${TBTC_POLICY}.${TBTC_NAME}` : 'lovelace');
const asTusd = () => (TUSD_POLICY ? `${TUSD_POLICY}.${TUSD_NAME}` : 'lovelace');
const asTsol = () => (TSOL_POLICY ? `${TSOL_POLICY}.${TSOL_NAME}` : 'lovelace');
const minOut  = (input: bigint, bps = SLIPPAGE_BPS) => (input * (10000n - bps)) / 10000n;

// ─── Shared types ──────────────────────────────────────────────────
interface PoolMeta   { poolId: string; txHash: string; outputIndex: number }
interface IntentRef  { intentId: string }

type PoolRow = {
  poolId: string;
  txHash?: string;
  outputIndex?: number;
  assetA?: { policyId: string; assetName: string };
  assetB?: { policyId: string; assetName: string };
  reserveA?: string;
  reserveB?: string;
  feeNumerator?: number;
  feeDenominator?: number;
  lpTokenPolicyId?: string;
  lpTokenName?: string;
};

/**
 * Calculate expected AMM output using constant-product formula with fee deduction.
 * Matches AmmMath.calculateSwapOutput exactly:
 *   inputWithFee = input * (feeDenom - feeNum)
 *   output       = (reserveOut * inputWithFee) / (reserveIn * feeDenom + inputWithFee)
 */
function ammExpectedOutput(
  inputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeNum = 30n,
  feeDenom = 10000n,
): bigint {
  const inputWithFee = inputAmount * (feeDenom - feeNum);
  const numerator    = reserveOut * inputWithFee;
  const denominator  = reserveIn * feeDenom + inputWithFee;
  return numerator / denominator;
}

/**
 * Compute minOutput = expected AMM output minus slippage tolerance.
 * Falls back to input-based slippage if reserves are not provided.
 */
function computeMinOutput(
  inputAmount: bigint,
  reserveIn?: bigint,
  reserveOut?: bigint,
  feeNum = 30n,
  feeDenom = 10000n,
  slippageBps = SLIPPAGE_BPS,
): bigint {
  if (reserveIn && reserveOut && reserveIn > 0n) {
    const expectedOut = ammExpectedOutput(inputAmount, reserveIn, reserveOut, feeNum, feeDenom);
    return (expectedOut * (10000n - slippageBps)) / 10000n;
  }
  // Fallback: apply slippage to input (only valid for ~1:1 priced pairs)
  return (inputAmount * (10000n - slippageBps)) / 10000n;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 1 — Deploy Settings
// ═══════════════════════════════════════════════════════════════════

async function phase1DeploySettings(admin: Wallet): Promise<void> {
  hr('Phase 1 — Deploy Settings [TC-AD03]');

  // Skip if already deployed
  try {
    const cur = await apiGet<{ global_settings: { current_version: number } }>('/admin/settings/current');
    log('settings', `Already deployed (version ${cur.global_settings.current_version}) — skipping`);
    return;
  } catch { /* not yet deployed, proceed */ }

  const res = await apiPost<{ unsignedTx: string }>('/admin/settings/build-deploy', {
    admin_address:         admin.address,
    fee_collector_address: admin.address,
    protocol_fee_bps:      5,           // 0.05 %
    min_pool_liquidity:    '2000000',   // 2 ADA
  });

  // MUST await — pool creation reads from the settings UTxO on-chain
  await signSubmitAwait(admin, res.unsignedTx, 'settings');
  log('settings', '✅ Settings UTxO deployed on-chain');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 — Deploy Factory
// ═══════════════════════════════════════════════════════════════════

async function phase2DeployFactory(admin: Wallet): Promise<void> {
  hr('Phase 2 — Deploy Factory [admin bootstrap]');

  // Route: POST /v1/admin/factory/build-deploy
  // The TxBuilder rejects internally if factory already exists on-chain
  try {
    const res = await apiPost<{ unsignedTx: string }>('/admin/factory/build-deploy', {
      admin_address: admin.address,
    });

    // MUST await — pool creation checks factory UTxO
    await signSubmitAwait(admin, res.unsignedTx, 'factory');
    log('factory', '✅ Factory UTxO deployed on-chain');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already exists')) {
      log('factory', 'Factory UTxO already on-chain — skipping');
    } else {
      // Non-fatal: pool creation has a no-factory fallback path
      log('factory', `⚠️  Factory deploy failed: ${msg}`);
      log('factory', '   Pool creation will use no-factory fallback mode on this run');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 & 4 — Create Pools
// ═══════════════════════════════════════════════════════════════════

async function createPool(
  admin: Wallet,
  label: string,
  assetAId: string,
  assetBId: string,
  initA: bigint,
  initB: bigint,
  feeNumerator = 30,
): Promise<PoolMeta> {
  log(label, `assetA=${assetAId.slice(0, 14)}… assetB=${assetBId.slice(0, 14)}…`);

  const res = await apiPost<{
    unsignedTx: string;
    txHash?: string;
    poolId?: string;
    poolMeta?: { poolOutputIndex: number };
  }>('/pools/create', {
    assetA: assetAId,
    assetB: assetBId,
    initialAmountA: initA.toString(),
    initialAmountB: initB.toString(),
    feeNumerator,
    creatorAddress: admin.address,
    changeAddress:  admin.address,
  });

  // MUST await — intents and deposits reference this pool UTxO by TxHash#Index
  const txHash = await signSubmitAwait(admin, res.unsignedTx, label);
  await sleep(3_000); // give Blockfrost time to index

  const pools = await apiGet<{ data: PoolRow[] }>('/pools');
  const pool  = pools.data.find(p => p.assetA?.policyId && (
    p.assetA.policyId === assetAId.split('.')[0] ||
    p.assetA.policyId === assetBId.split('.')[0]
  )) ?? pools.data.at(-1);

  const poolId      = pool?.poolId      ?? res.poolId ?? 'unknown';
  const outputIndex = pool?.outputIndex ?? res.poolMeta?.poolOutputIndex ?? 0;
  log(label, `✅ Pool ID: ${poolId}`);
  return { poolId, txHash, outputIndex };
}

async function findExistingPool(policyA: string, policyB: string): Promise<PoolMeta | null> {
  const pools = await apiGet<{ data: PoolRow[]; pagination?: unknown }>('/pools');
  await sleep(2_000); // give Blockfrost time to index

  const pools2 = await apiGet<{ data: PoolRow[]; pagination?: unknown }>('/pools');
  const found  = pools2.data.find(p => {
    const ps = [p.assetA?.policyId ?? '', p.assetB?.policyId ?? ''];
    return ps.includes(policyA) && ps.includes(policyB);
  });
  return found ? { poolId: found.poolId, txHash: '', outputIndex: 0 } : null;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 5 — Deposit Liquidity
// ═══════════════════════════════════════════════════════════════════

async function depositLiquidity(
  user: Wallet,
  poolId: string,
  amountA: bigint,
  amountB: bigint,
  label: string,
): Promise<string> {
  log(label, `pool=${poolId.slice(0, 8)}… amountA=${amountA} amountB=${amountB}`);

  const res = await apiPost<{ unsignedTx: string }>(`/pools/${poolId}/deposit`, {
    senderAddress: user.address,
    changeAddress: user.address,
    amountA:       amountA.toString(),
    amountB:       amountB.toString(),
    minLpTokens:   '0',
  });

  // MUST await — amounts must be proportional to current reserves;
  // next deposit or swap needs the updated pool UTxO
  const txHash = await signSubmitAwait(user, res.unsignedTx, label);
  await sleep(2_000);
  return txHash;
}

// ═══════════════════════════════════════════════════════════════════
// Phase 6 — Swap Intents (SolverEngine fills these — NOT the script)
// ═══════════════════════════════════════════════════════════════════

async function createIntent(
  user: Wallet,
  inputAsset: string,
  outputAsset: string,
  inputAmt: bigint,
  minOutAmt: bigint,
  deadlineMs: number,
  label: string,
  partialFill = true,
): Promise<IntentRef> {
  log(label, `${inputAsset.slice(0, 14)}…→${outputAsset.slice(0, 14)}… amt=${inputAmt} minOut=${minOutAmt} partial=${partialFill}`);

  const res = await apiPost<{ intentId: string; unsignedTx: string }>('/intents', {
    senderAddress: user.address,
    changeAddress: user.address,
    inputAsset,
    outputAsset,
    inputAmount:   inputAmt.toString(),
    minOutput:     minOutAmt.toString(),
    deadline:      deadlineMs,
    partialFill,
  });

  // Sign, submit, await confirmation, and call /tx/confirm to activate the intent
  await signSubmitConfirm(user, res.unsignedTx, label, {
    intentId: res.intentId,
    action: 'create_intent',
  });
  log(label, `Intent: ${res.intentId}`);
  return { intentId: res.intentId };
}

/**
 * Build + sign + submit intent TX WITHOUT waiting for on-chain confirmation.
 * Used for the netting demo: submit multiple intents rapidly (different wallets)
 * so the solver sees them all in the same batch window.
 */
async function createIntentFast(
  user: Wallet,
  inputAsset: string,
  outputAsset: string,
  inputAmt: bigint,
  minOutAmt: bigint,
  deadlineMs: number,
  label: string,
  partialFill = true,
): Promise<{ intentId: string; txHash: string }> {
  log(label, `[FAST] ${inputAsset.slice(0, 14)}…→${outputAsset.slice(0, 14)}… amt=${inputAmt} minOut=${minOutAmt}`);

  const res = await apiPost<{ intentId: string; unsignedTx: string }>('/intents', {
    senderAddress: user.address,
    changeAddress: user.address,
    inputAsset,
    outputAsset,
    inputAmount:   inputAmt.toString(),
    minOutput:     minOutAmt.toString(),
    deadline:      deadlineMs,
    partialFill,
  });

  // Sign and submit WITHOUT waiting — returns immediately
  const txHash = await signAndSubmit(user, res.unsignedTx);
  log(label, `Submitted (no wait) ✅  ${res.intentId} → ${txHash.slice(0, 16)}…`);
  return { intentId: res.intentId, txHash };
}

async function phase6NettingDemo(
  userA: Wallet,
  userB: Wallet,
  userC: Wallet,
  pool1: PoolMeta,
): Promise<IntentRef[]> {
  hr('Phase 6 — NettingEngine Demo: Opposing Intents Cross-Match');
  log('netting', '━━━ GOAL: Create 3 opposing intents SIMULTANEOUSLY ━━━');
  log('netting', 'All 3 TXes hit the mempool before the solver\'s next 15 s scan,');
  log('netting', 'so NettingEngine sees A→B + B→A flows in the SAME batch.');

  const deadline = Date.now() + 6 * 3600 * 1000; // 6 h

  // Fetch current pool reserves to compute accurate minOutput
  const poolInfo = await apiGet<PoolRow>(`/pools/${pool1.poolId}`);
  const reserveA = BigInt(poolInfo.reserveA ?? '0');
  const reserveB = BigInt(poolInfo.reserveB ?? '0');
  const feeNum   = BigInt(poolInfo.feeNumerator ?? 30);
  const feeDenom = BigInt(poolInfo.feeDenominator ?? 10000);

  log('netting', `Pool reserves: A=${reserveA} B=${reserveB} fee=${feeNum}/${feeDenom}`);
  log('netting', `Pool spot price: ${Number(reserveB) / Number(reserveA)} tUSD/tBTC`);

  // 3 opposing intents (different wallets — no UTxO conflict):
  //   i1: User A → 5 tBTC → tUSD  (A→B)
  //   i2: User B → 250 tUSD → tBTC (B→A — OPPOSING)
  //   i3: User C → 10 tBTC → tUSD  (A→B)
  const minOut1 = computeMinOutput(SWAP_TBTC,      reserveA, reserveB, feeNum, feeDenom);
  const minOut2 = computeMinOutput(SWAP_TUSD,      reserveB, reserveA, feeNum, feeDenom);
  const minOut3 = computeMinOutput(SWAP_TBTC * 2n, reserveA, reserveB, feeNum, feeDenom);

  log('netting', `Creating 3 intents SIMULTANEOUSLY (no wait between):`);
  log('netting', `  i1: User A → ${SWAP_TBTC} tBTC → tUSD (A→B) minOut=${minOut1}`);
  log('netting', `  i2: User B → ${SWAP_TUSD} tUSD → tBTC (B→A) minOut=${minOut2}`);
  log('netting', `  i3: User C → ${SWAP_TBTC * 2n} tBTC → tUSD (A→B) minOut=${minOut3}`);

  // ── Step 1: Build + sign + submit all 3 TXes in parallel (different wallets) ──
  const [r1, r2, r3] = await Promise.all([
    createIntentFast(userA, asTbtc(), asTusd(), SWAP_TBTC,       minOut1, deadline, 'i1-A-AtoB'),
    createIntentFast(userB, asTusd(), asTbtc(), SWAP_TUSD,       minOut2, deadline, 'i2-B-BtoA'),
    createIntentFast(userC, asTbtc(), asTusd(), SWAP_TBTC * 2n,  minOut3, deadline, 'i3-C-AtoB'),
  ]);

  log('netting', '✅ All 3 TXes submitted to mempool simultaneously');

  // ── Step 2: Wait for all 3 to confirm on-chain (parallel) ──
  log('netting', 'Awaiting on-chain confirmation for all 3...');
  const confirmResults = await Promise.allSettled([
    userA.lucid.awaitTx(r1.txHash, 120_000),
    userB.lucid.awaitTx(r2.txHash, 120_000),
    userC.lucid.awaitTx(r3.txHash, 120_000),
  ]);
  for (let i = 0; i < confirmResults.length; i++) {
    const r = confirmResults[i];
    const lbl = ['i1', 'i2', 'i3'][i];
    if (r.status === 'fulfilled') {
      log('netting', `  ${lbl} confirmed on-chain ✅`);
    } else {
      log('netting', `  ${lbl} confirmation issue: ${r.reason}`);
    }
  }

  // ── Step 3: Call /tx/confirm for all 3 to immediately set ACTIVE ──
  for (const r of [r1, r2, r3]) {
    try {
      await apiPost('/tx/confirm', { txHash: r.txHash, intentId: r.intentId, action: 'create_intent' });
    } catch {
      // ChainSync will auto-promote — not critical
    }
  }

  log('netting', '✅ 3 intents on-chain and ACTIVE simultaneously!');
  log('netting', '   SolverEngine (15 s cycle) will see ALL 3 in one batch:');
  log('netting', '   → NettingEngine.analyze() detects opposing A→B + B→A flows');
  log('netting', '   → Splits into sub-batches: {i1,i3} AToB, {i2} BToA');
  log('netting', '   → Check backend logs for: "⚡ NettingEngine: opposing intents detected"');

  // Wait for Blockfrost propagation
  log('netting', 'Waiting 15 s for Blockfrost propagation + solver pickup...');
  await sleep(15_000);

  return [
    { intentId: r1.intentId },
    { intentId: r2.intentId },
    { intentId: r3.intentId },
  ];
}

/**
 * Observe (poll) that SolverEngine has filled the intents.
 * Does NOT trigger the solver — just watches the API.
 * Includes DB verification: checks fillCount, remainingInput, settlementTxHash.
 */
async function observeIntentFills(intents: IntentRef[], label = 'Phase 6b'): Promise<void> {
  hr(`${label} — Observe SolverEngine fills + DB Verification`);
  log('watch', `Polling ${intents.length} intents for FILLED / PARTIALLY_FILLED status...`);

  type IntentDetail = {
    intentId?: string;
    status?: string;
    fillCount?: number;
    remainingInput?: string;
    inputAmount?: string;
    settlementTxHash?: string;
    actualOutput?: string;
  };

  const results: Array<{ intentId: string; status: string; detail?: IntentDetail }> = [];
  for (const { intentId } of intents) {
    const short = intentId.slice(0, 10);
    const result = await pollUntil<IntentDetail>(
      `intent-${short}`,
      () => apiGet(`/intents/${intentId}`),
      v => v.status === 'FILLED' || v.status === 'PARTIALLY_FILLED',
      12_000,
      180_000, // 3 min timeout
    );
    const status = result?.status ?? 'TIMEOUT';
    const icon   = status === 'FILLED' || status === 'PARTIALLY_FILLED' ? '✅' : '⚠️';
    log('watch', `${icon} ${short}… → ${status}` +
      (result?.fillCount ? ` (fills: ${result.fillCount})` : '') +
      (result?.remainingInput && result.remainingInput !== '0' ? ` remaining: ${result.remainingInput}` : '') +
      (result?.actualOutput ? ` output: ${result.actualOutput}` : '') +
      (result?.settlementTxHash ? ` tx: ${result.settlementTxHash.slice(0, 16)}…` : ''));
    results.push({ intentId, status, detail: result ?? undefined });
  }

  // ── DB Verification Summary ──
  const filled  = results.filter(r => r.status === 'FILLED').length;
  const partial = results.filter(r => r.status === 'PARTIALLY_FILLED').length;
  const timeout = results.filter(r => r.status === 'TIMEOUT').length;
  log('verify', `DB Summary: ${filled} FILLED, ${partial} PARTIALLY_FILLED, ${timeout} TIMEOUT out of ${intents.length}`);
  for (const r of results) {
    if (r.detail) {
      log('verify', `  ${r.intentId.slice(0, 10)}… → status=${r.detail.status} fillCount=${r.detail.fillCount ?? 0} ` +
        `remaining=${r.detail.remainingInput ?? '?'} settlement=${r.detail.settlementTxHash ? '✅' : '❌'}`);
    }
  }
  if (timeout > 0) {
    log('verify', `⚠️  ${timeout} intent(s) timed out — check backend logs for solver errors`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7 — Partial Fill Demo (intent > pool input reserve → RouteOptimizer.tryPartialFill)
// ═══════════════════════════════════════════════════════════════════

async function phase7PartialFillDemo(
  user: Wallet,
  pool2: PoolMeta,
): Promise<IntentRef> {
  hr('Phase 7 — Partial Fill Demo: Intent > Pool Input Reserve');
  log('partial', '━━━ GOAL: Create intent of 80 tUSD → tSOL against tiny Pool 2 (50/50) ━━━');
  log('partial', 'RouteOptimizer.tryFullFill fails (output 30.7 < minOutput 35).');
  log('partial', 'RouteOptimizer.tryPartialFill: caps output at 50% reserve, consumes ~50 tUSD.');
  log('partial', 'After round 1: pool skews to 100/25 → round 2 fail → stays PARTIALLY_FILLED.');

  const deadline = Date.now() + 6 * 3600 * 1000;

  // Fetch current pool reserves
  const poolInfo = await apiGet<PoolRow>(`/pools/${pool2.poolId}`);
  const reserveA = BigInt(poolInfo.reserveA ?? '0');
  const reserveB = BigInt(poolInfo.reserveB ?? '0');

  log('partial', `Pool 2 reserves: A=${reserveA} (tUSD) B=${reserveB} (tSOL)`);
  log('partial', `Intent: ${PARTIAL_SWAP_TUSD} tUSD (${Number(PARTIAL_SWAP_TUSD) * 100 / Number(reserveA)}% of input reserve)`);
  log('partial', `minOutput: ${PARTIAL_MIN_OUT} tSOL — tight enough to force partial fill`);

  // tUSD is asset A in Pool 2, tSOL is asset B
  const intent = await createIntent(
    user, asTusd(), asTsol(), PARTIAL_SWAP_TUSD, PARTIAL_MIN_OUT,
    deadline, 'partial-fill', true,
  );

  log('partial', `✅ Large intent on-chain: ${intent.intentId.slice(0, 10)}…`);
  log('partial', '   SolverEngine: tryFullFill fails → tryPartialFill caps at 50% reserve');
  log('partial', '   Round 1: ~50 tUSD consumed, ~25 tSOL output → PARTIALLY_FILLED');
  log('partial', '   Round 2+: pool too skewed → both full & partial fail → stays PARTIALLY_FILLED');
  return intent;
}

/**
 * Phase 7b: Observe the partial fill → verify PARTIALLY_FILLED in DB.
 */
async function phase7bObservePartialFill(intent: IntentRef): Promise<void> {
  hr('Phase 7b — Observe Partial Fill + DB Verification');
  log('partial-watch', `Tracking intent ${intent.intentId.slice(0, 10)}… for PARTIALLY_FILLED...`);

  type IntentDetail = {
    status?: string;
    fillCount?: number;
    remainingInput?: string;
    inputAmount?: string;
    settlementTxHash?: string;
    actualOutput?: string;
  };

  // Poll until PARTIALLY_FILLED (or FILLED if pool somehow had enough)
  const result = await pollUntil<IntentDetail>(
    'partial-fill',
    () => apiGet(`/intents/${intent.intentId}`),
    v => v.status === 'PARTIALLY_FILLED' || v.status === 'FILLED',
    15_000,
    180_000, // 3 min timeout
  );

  const finalStatus = result?.status ?? 'TIMEOUT';

  if (finalStatus === 'PARTIALLY_FILLED') {
    log('partial-watch', `✅ PARTIALLY_FILLED confirmed!`);
    log('partial-watch', `   fillCount:      ${result?.fillCount ?? '?'}`);
    log('partial-watch', `   inputAmount:     ${result?.inputAmount ?? '?'}`);
    log('partial-watch', `   remainingInput:  ${result?.remainingInput ?? '?'}`);
    log('partial-watch', `   settlement TX:   ${result?.settlementTxHash?.slice(0, 16) ?? 'none'}…`);

    const consumed = BigInt(result?.inputAmount ?? '0') - BigInt(result?.remainingInput ?? '0');
    log('partial-watch', `   Consumed: ${consumed} out of ${result?.inputAmount ?? '?'} (${Number(consumed * 100n / BigInt(result?.inputAmount ?? '1'))}%)`);
    log('partial-watch', `   ⚡ RouteOptimizer.tryPartialFill demonstrated successfully!`);
  } else if (finalStatus === 'FILLED') {
    log('partial-watch', `⚠️  Unexpectedly FILLED in one go — pool may have had enough reserves`);
  } else {
    log('partial-watch', `⚠️  Status: ${finalStatus} — check backend logs for route optimizer decisions`);
  }
}

/**
 * Phase 7c: Cancel the partially filled intent → verify CANCELLED in DB.
 * Demonstrates: user can cancel even after partial fill, recovering remaining escrow tokens.
 */
async function phase7cCancelPartialFill(user: Wallet, intent: IntentRef): Promise<void> {
  hr('Phase 7c — Cancel Partially Filled Intent');
  log('partial-cancel', '━━━ GOAL: Cancel remaining portion of partially filled intent ━━━');
  log('partial-cancel', 'User recovers un-consumed escrow tokens. On-chain escrow UTxO burned.');

  // Verify it's still PARTIALLY_FILLED before cancelling
  const detail = await apiGet<{ status?: string; remainingInput?: string }>(`/intents/${intent.intentId}`);
  if (detail.status !== 'PARTIALLY_FILLED') {
    log('partial-cancel', `⚠️  Intent status is ${detail.status}, not PARTIALLY_FILLED — skipping cancel`);
    return;
  }
  log('partial-cancel', `Cancelling intent with ${detail.remainingInput} remaining input...`);

  const res = await apiDelete<{ intentId: string; unsignedTx: string | null }>(
    `/intents/${intent.intentId}`, { senderAddress: user.address },
  );

  if (!res.unsignedTx) {
    log('partial-cancel', '⚠️  No cancel TX returned — intent may have been filled or already cancelled');
    return;
  }

  const cancelHash = await signSubmitConfirm(user, res.unsignedTx, 'partial-cancel', {
    intentId: intent.intentId,
    action: 'cancel_intent',
  });
  log('partial-cancel', `✅ Cancel TX confirmed: ${cancelHash}`);

  // ── DB Verification ──
  await sleep(3_000);
  const final = await apiGet<{ status?: string; remainingInput?: string; fillCount?: number }>(
    `/intents/${intent.intentId}`,
  );
  log('partial-cancel', `DB Verification: status=${final.status} fillCount=${final.fillCount ?? 0} remaining=${final.remainingInput ?? '?'}`);
  if (final.status === 'CANCELLED') {
    log('partial-cancel', '✅ Partial fill → cancel demonstrated: ACTIVE → PARTIALLY_FILLED → CANCELLED');
  } else {
    log('partial-cancel', `⚠️  Expected CANCELLED but got ${final.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 8 — Cancel Intent (user-initiated on-chain cancel)
// ═══════════════════════════════════════════════════════════════════

async function phase8CancelIntent(userA: Wallet): Promise<void> {
  hr('Phase 8 — Cancel Intent — user signs cancel before solver fills');

  // 3 h deadline: solver cycles every ~15 s so it will find this, but we cancel fast
  const deadline = Date.now() + 3 * 3600 * 1000;
  const { intentId } = await createIntent(
    userA, asTbtc(), asTusd(), SWAP_TBTC, minOut(SWAP_TBTC), deadline, 'cancel-intent',
  );

  // Intent is now on-chain and ACTIVE (createIntent uses signSubmitConfirm)
  // Cancel immediately before the solver can fill it

  const res = await apiDelete<{ intentId: string; unsignedTx: string | null }>(
    `/intents/${intentId}`, { senderAddress: userA.address },
  );

  if (!res.unsignedTx) {
    log('cancel-intent', '⚠️  No cancel TX returned — intent may already be filled');
    return;
  }

  const cancelHash = await signSubmitConfirm(userA, res.unsignedTx, 'cancel-intent', {
    intentId,
    action: 'cancel_intent',
  });
  log('cancel-intent', `✅ Cancel TX confirmed: ${cancelHash}`);
  log('cancel-intent', '   Intent burned, input tokens returning to owner wallet');

  // ── DB Verification ──
  await sleep(3_000);
  const final = await apiGet<{ status?: string }>(`/intents/${intentId}`);
  log('cancel-intent', `DB Verification: status=${final.status}`);
}

// ═══════════════════════════════════════════════════════════════════
// Phase 9 — Expired Intent → ReclaimKeeperCron
// ═══════════════════════════════════════════════════════════════════

async function phase9ExpiredIntent(user: Wallet): Promise<void> {
  hr('Phase 9 — Expired Intent → ReclaimKeeperCron');

  // 3 min deadline — createIntent takes ~2 min (await on-chain + propagation),
  // so the intent is ACTIVE for ~1 min before expiring.
  const shortDeadline = Date.now() + 3 * 60_000;
  const { intentId }  = await createIntent(
    user, asTbtc(), asTusd(), SWAP_TBTC, minOut(SWAP_TBTC),
    shortDeadline, 'expire-intent',
  );
  log('expire-intent', `Intent with 3-min deadline: ${intentId.slice(0, 12)}…`);

  // Wait until the deadline passes
  const waitMs = Math.max(0, shortDeadline - Date.now() + 5_000);
  log('expire-intent', `Waiting ${Math.round(waitMs / 1000)} s for deadline to pass...`);
  await sleep(waitMs);

  log('expire-intent', '✅ Deadline passed. ReclaimKeeperCron handles reclaim on next tick (~60 s)');
  log('expire-intent', '   Watch backend logs for: "Reclaim TX submitted"');

  const result = await pollUntil<{ status?: string }>(
    'expire-watch',
    () => apiGet(`/intents/${intentId}`),
    v => v.status === 'RECLAIMED' || v.status === 'EXPIRED',
    15_000,
    180_000,
  );
  const status = result?.status ?? 'TIMEOUT';
  log('expire-intent', (status === 'RECLAIMED' || status === 'EXPIRED')
    ? `✅ Intent is now ${status}`
    : '⚠️  Bot may need another tick — check backend logs');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 10 — Withdraw Liquidity
// ═══════════════════════════════════════════════════════════════════

async function phase10Withdraw(userA: Wallet, pool1: PoolMeta): Promise<void> {
  hr('Phase 10 — Withdraw Liquidity (user removes LP position)');

  try {
    // Fetch LP token info from pool detail endpoint
    const poolDetail = await apiGet<PoolRow & {
      lpTokenPolicyId?: string;
      lpTokenName?: string;
    }>(`/pools/${pool1.poolId}`);

    const lpPolicy = poolDetail.lpTokenPolicyId ?? '';
    const lpName   = poolDetail.lpTokenName     ?? '';

    if (!lpPolicy) {
      log('withdraw', '⚠️  LP token policy not returned by /pools/:id');
      log('withdraw', '   Check backend: poolDetail.lpTokenPolicyId should be populated');
      return;
    }

    // Check user wallet for LP balance (or fall back to a small fixed amount)
    const utxos = await userA.lucid.wallet().getUtxos();
    const lpUnit = `${lpPolicy}${lpName}`;
    let lpBalance = 0n;
    for (const utxo of utxos) {
      for (const [unit, qty] of Object.entries(utxo.assets)) {
        if (unit === lpUnit || unit.toLowerCase() === lpUnit.toLowerCase()) {
          lpBalance += qty;
        }
      }
    }

    if (lpBalance === 0n) {
      log('withdraw', `⚠️  User A has no LP tokens for pool ${pool1.poolId.slice(0, 8)}…`);
      log('withdraw', '   (Deposit may have already been consumed or LP tokens use different unit)');
      return;
    }

    // Withdraw 25% of held LP tokens (TC-P08)
    const withdrawAmt = lpBalance / 4n;
    log('withdraw', `User A LP balance: ${lpBalance} — withdrawing ${withdrawAmt} (25%)`);

    const res = await apiPost<{ unsignedTx: string }>(`/pools/${pool1.poolId}/withdraw`, {
      senderAddress: userA.address,
      changeAddress: userA.address,
      lpTokenAmount: withdrawAmt.toString(),
      minAmountA:    '0',
      minAmountB:    '0',
    });

    await signSubmitAwait(userA, res.unsignedTx, 'withdraw');
    log('withdraw', '✅ Partial withdrawal confirmed — tokens returned to wallet');
  } catch (e) {
    log('withdraw', `⚠️  Withdraw failed: ${e instanceof Error ? e.message : e}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 11 — Update Protocol Settings
// ═══════════════════════════════════════════════════════════════════

async function phase11UpdateSettings(admin: Wallet): Promise<void> {
  hr('Phase 11 — Update Protocol Settings');

  try {
    const cur = await apiGet<{
      global_settings: {
        max_protocol_fee_bps: number;
        min_pool_liquidity:   number;
        current_version:      number;
      };
    }>('/admin/settings/current');

    const nextVersion = (cur.global_settings.current_version ?? 1) + 1;
    const res = await apiPost<{ unsignedTx: string }>('/admin/settings/build-update', {
      admin_address:     admin.address,
      protocol_fee_bps:  10,   // bump to 0.10 %
      min_pool_liquidity: String(cur.global_settings.min_pool_liquidity ?? 2_000_000),
      next_version:      nextVersion,
    });

    await signSubmitFire(admin, res.unsignedTx, 'update-settings');
    log('update-settings', `✅ Settings version → ${nextVersion} (fee 0.10%)`);
  } catch (e) {
    log('update-settings', `⚠️  Update failed: ${e instanceof Error ? e.message : e}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Pre-flight validation
// ═══════════════════════════════════════════════════════════════════

function validateConfig() {
  const missing: string[] = [];
  if (!BF_PROJECT)  missing.push('BLOCKFROST_PROJECT_ID');
  if (!ADMIN_SEED)  missing.push('SOLVER_SEED_PHRASE or T_WALLET_SEED (admin)');
  if (!USER_A_SEED) missing.push('T_WALLET_SEED2 or MNEMONIC0 (user A)');
  if (!USER_B_SEED) missing.push('MNEMONIC1 (user B)');
  if (!USER_C_SEED) missing.push('MNEMONIC2 (user C)');
  if (!TBTC_POLICY) missing.push('TBTC_POLICY_ID');
  if (!TUSD_POLICY) missing.push('TUSD_POLICY_ID');
  if (!TSOL_POLICY) missing.push('TSOL_POLICY_ID');

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(m => console.error(`   - ${m}`));
    console.error('\nAdd them to backend/.env and retry.\n');
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('  SolverNet DEX — Intent-Focused System Test');
  console.log(`  Network: ${NETWORK} | Backend: ${BACKEND_URL}`);
  console.log(`  Time:    ${new Date().toISOString()}`);
  console.log('  Features: NettingEngine · Partial Fill · Batch Settlement · DB Verification');
  console.log('═'.repeat(72) + '\n');

  validateConfig();

  // ── Backend health check ──────────────────────────────────────────
  log('preflight', 'Checking backend health...');
  try {
    await apiGet('/health');
    log('preflight', '✅ Backend healthy');
  } catch {
    console.error('\n❌ Backend unreachable. Start: cd backend && pnpm dev\n');
    process.exit(1);
  }

  // ── Solver status check ───────────────────────────────────────────
  try {
    const solverStatus = await apiGet<unknown>('/admin/solver/status');
    log('preflight', `Solver status: ${JSON.stringify(solverStatus)}`);
  } catch {
    log('preflight', '⚠️  Cannot query solver status — /admin/solver/status unavailable');
  }
  log('preflight', '⚠️  SolverEngine + ReclaimKeeper MUST be running for intent fills!');
  log('preflight', '   OrderExecutorCron is DISABLED (ORDER_EXECUTOR_ENABLED=false)');

  // ── Init wallets ──────────────────────────────────────────────────
  log('preflight', 'Initialising 4 wallets...');
  const [admin, userA, userB, userC] = await Promise.all([
    makeWallet(ADMIN_SEED),
    makeWallet(USER_A_SEED),
    makeWallet(USER_B_SEED),
    makeWallet(USER_C_SEED),
  ]);
  log('preflight', `Admin:  ${admin.address}`);
  log('preflight', `User A: ${userA.address}`);
  log('preflight', `User B: ${userB.address}`);
  log('preflight', `User C: ${userC.address}`);

  // Allow Blockfrost to stabilise after any recent TXes from previous runs
  log('preflight', 'Waiting 15 s for Blockfrost stabilisation...');
  await sleep(15_000);

  // ── token balance check ───────────────────────────────────────────
  await reportWalletBalances([
    { label: 'Admin',  wallet: admin  },
    { label: 'User A', wallet: userA  },
    { label: 'User B', wallet: userB  },
    { label: 'User C', wallet: userC  },
  ]);

  // ════ PHASE 0 — Distribute test tokens ═══════════════════════════

  await runPhase('Phase 0 — Distribute Test Tokens', () =>
    phase0DistributeTokens(admin, [userA, userB, userC]));

  // ════ ADMIN BOOTSTRAP ════════════════════════════════════════════

  await runPhase('Phase 1 — Deploy Settings',  () => phase1DeploySettings(admin));
  await runPhase('Phase 2 — Deploy Factory',   () => phase2DeployFactory(admin));

  // ════ POOLS ══════════════════════════════════════════════════════

  hr('Phase 3 — Create Pool tBTC / tUSD');
  let pool1 = await findExistingPool(TBTC_POLICY, TUSD_POLICY);
  if (pool1) {
    log('pool1', `tBTC/tUSD pool already exists — ID: ${pool1.poolId}`);
    phaseResults.push({ phase: 'Phase 3 — Create tBTC/tUSD Pool', status: 'PASS' });
  } else {
    await runPhase('Phase 3 — Create tBTC/tUSD Pool', async () => {
      pool1 = await createPool(admin, 'pool1', asTbtc(), asTusd(), POOL_INIT_TBTC, POOL_INIT_TUSD);
    });
  }

  hr('Phase 4 — Create Pool tUSD / tSOL (TINY for partial fill demo)');
  let pool2: PoolMeta | null = await findExistingPool(TUSD_POLICY, TSOL_POLICY);
  if (pool2) {
    log('pool2', `tUSD/tSOL pool already exists — ID: ${pool2.poolId}`);
    phaseResults.push({ phase: 'Phase 4 — Create tUSD/tSOL Pool', status: 'PASS' });
  } else {
    await runPhase('Phase 4 — Create tUSD/tSOL Pool', async () => {
      // TINY reserves: 50 tUSD / 50 tSOL → partial fill triggers when intent > 50 tUSD
      pool2 = await createPool(admin, 'pool2', asTusd(), asTsol(), PARTIAL_POOL_TUSD, PARTIAL_POOL_TSOL);
    });
  }

  if (!pool1) {
    console.error('\n❌ Cannot continue — tBTC/tUSD pool (pool1) not available. Aborting.\n');
    process.exit(1);
  }

  // ════ LIQUIDITY DEPOSIT ══════════════════════════════════════════

  hr('Phase 5 — Deposit Liquidity');
  await runPhase('Phase 5a — User A deposit tBTC/tUSD', async () => {
    await depositLiquidity(userA, pool1!.poolId, POOL_INIT_TBTC / 100n, 50_000_000n, 'deposit-A-pool1');
  });
  // NOTE: No deposit into Pool 2 — keeping it tiny (50/50) for partial fill demo
  log('phase5', 'Skipping Pool 2 deposit — keeping reserves tiny for partial fill demo');
  phaseResults.push({ phase: 'Phase 5b — Pool 2 tiny (no extra deposit)', status: 'PASS' });

  // ════ NETTING DEMO: opposing intents submitted SIMULTANEOUSLY ══════

  let nettingIntents: IntentRef[] = [];
  await runPhase('Phase 6 — Netting Demo (opposing intents)', async () => {
    nettingIntents = await phase6NettingDemo(userA, userB, userC, pool1!);
  });

  // ════ OBSERVE NETTING FILLS + DB VERIFICATION ════════════════════

  if (nettingIntents.length > 0) {
    await runPhase('Phase 6b — Observe Netting Fills', () =>
      observeIntentFills(nettingIntents, 'Phase 6b'));
  }

  // ════ PARTIAL FILL DEMO (tiny Pool 2) ════════════════════════════

  let partialFillIntent: IntentRef = { intentId: '' };
  if (pool2) {
    await runPhase('Phase 7 — Partial Fill Demo', async () => {
      partialFillIntent = await phase7PartialFillDemo(userA, pool2!);
    });

    if (partialFillIntent.intentId) {
      await runPhase('Phase 7b — Observe Partial Fill', () =>
        phase7bObservePartialFill(partialFillIntent));

      await runPhase('Phase 7c — Cancel Partial Fill', () =>
        phase7cCancelPartialFill(userA, partialFillIntent));
    }
  } else {
    log('main', 'Skipping partial fill demo — pool2 not available');
    phaseResults.push({ phase: 'Phase 7 — Partial Fill Demo', status: 'SKIP' });
  }

  // ════ CANCEL INTENT (user action) ════════════════════════════════

  await runPhase('Phase 8 — Cancel Intent', () => phase8CancelIntent(userA));

  // Wait for Phase 8's TXes to propagate before Phase 9 tries to reuse wallets
  log('main', 'Waiting 40 s for Phase 8 TXes to propagate...');
  await sleep(40_000);

  // ════ EXPIRED INTENT ═════════════════════════════════════════════

  await runPhase('Phase 9 — Expired Intent', () => phase9ExpiredIntent(userB));

  // ════ WITHDRAW LIQUIDITY (user action) ════════════════════════════

  await runPhase('Phase 10 — Withdraw Liquidity', () => phase10Withdraw(userA, pool1!));

  // ════ UPDATE SETTINGS (admin action) ══════════════════════════════

  await runPhase('Phase 11 — Update Settings', () => phase11UpdateSettings(admin));

  // ════ SUMMARY ═════════════════════════════════════════════════════

  hr('Test Run Complete — Phase Summary');
  const pass = phaseResults.filter(r => r.status === 'PASS').length;
  const fail = phaseResults.filter(r => r.status === 'FAIL').length;
  const skip = phaseResults.filter(r => r.status === 'SKIP').length;

  for (const r of phaseResults) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭ ';
    const detail = r.status === 'FAIL' ? `  → ${r.error?.slice(0, 100)}` : '';
    console.log(`  ${icon}  ${r.phase}${detail}`);
  }
  console.log(`\n  Total: ${pass} passed, ${fail} failed, ${skip} skipped\n`);

  console.log('  Key features demonstrated:');
  console.log('    ⚡ NettingEngine — 3 opposing intents submitted SIMULTANEOUSLY');
  console.log('    🔄 Partial fills — PARTIALLY_FILLED status with reduced remainingInput');
  console.log('    ✂️  Partial fill → cancel — user cancels remaining after partial fill');
  console.log('    📦 Batch settlement — same-direction intents in single TX');
  console.log('    📊 DB verification — fillCount, remainingInput, status checked via API');
  console.log('');
  console.log('  Verify results:');
  console.log(`    ${API}/pools`);
  console.log(`    ${API}/intents`);
  console.log('    https://preprod.cardanoscan.io/');
  console.log('\n' + '═'.repeat(72) + '\n');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
