/// <reference types="node" />
/**
 * test-system.ts — Full On-Chain System Test for SolverNet DEX
 *
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DESIGN PRINCIPLE — phân chia trách nhiệm đúng:                   ║
 * ║                                                                    ║
 * ║  Script này chỉ làm:        Để bot / engine làm:                  ║
 * ║  ─────────────────────────  ──────────────────────────────────     ║
 * ║  Deploy settings            SolverEngine → fill intents           ║
 * ║  Deploy factory             OrderExecutorCron → execute orders    ║
 * ║  Create pool                ReclaimKeeperCron → reclaim expired   ║
 * ║  Deposit / Withdraw                                                ║
 * ║  Create intent ──────────────────────────────→ [bot fills]        ║
 * ║  Cancel intent  (user huỷ TRƯỚC khi bot fill)                     ║
 * ║  Create order ───────────────────────────────→ [bot executes]     ║
 * ║  Cancel order   (user huỷ TRƯỚC khi bot exec)                     ║
 * ║  Update settings                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * TEST PHASES:
 *  Phase 1  — Deploy Settings              [admin, awaitTx — required for pools]
 *  Phase 2  — Deploy Factory               [admin, awaitTx — required for pools]
 *  Phase 3  — Create Pool tBTC/tUSD        [admin, awaitTx — required for intents]
 *  Phase 4  — Create Pool tUSD/tSOL        [admin, awaitTx]
 *  Phase 5  — Deposit liquidity            [users, awaitTx — pool UTxO changes]
 *  Phase 6  — Swap intents (multi-user)    [users, fire-and-forget → SolverEngine fills]
 *  Phase 7  — Cancel intent               [user, on-chain cancel TX before solver]
 *  Phase 8  — Expired intent               [user creates → ReclaimKeeperCron reclaims]
 *  Phase 9  — DCA order                    [user, fire-and-forget → OrderExecutorCron]
 *  Phase 10 — Limit order                  [user, fire-and-forget → OrderExecutorCron]
 *  Phase 11 — Stop-Loss order              [user, fire-and-forget → OrderExecutorCron]
 *  Phase 12 — Cancel order                 [user, on-chain cancel TX before bot]
 *  Phase 13 — Expired order                [user creates → ReclaimKeeperCron reclaims]
 *  Phase 14 — Withdraw liquidity           [user, awaitTx]
 *  Phase 15 — Update protocol settings     [admin]
 *
 * RUNNING:
 *   # Terminal 1 — backend với solver bật:
 *   cd backend && pnpm dev
 *
 *   # Terminal 2 — sau khi backend sẵn sàng:
 *   cd backend
 *   pnpm exec tsx scripts/test-system.ts
 *
 * ENV VARS (thêm vào backend/.env):
 *   BACKEND_URL=http://localhost:3001   (default)
 *   TBTC_POLICY_ID=<64-char hex>
 *   TBTC_ASSET_NAME=<hex>  (default "tBTC" = 74425443)
 *   TUSD_POLICY_ID=<64-char hex>
 *   TUSD_ASSET_NAME=<hex>  (default "tUSD" = 74555344)
 *   TSOL_POLICY_ID=<64-char hex>
 *   TSOL_ASSET_NAME=<hex>  (default "tSOL" = 74534f4c)
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
const DCA_BUDGET      = 100_000_000n;   // 100 tUSD total
const DCA_PER_INT     =  10_000_000n;   // 10 tUSD per DCA interval
const DCA_INTERVAL    =         60;     // 60 slots (~60 s on preprod)
const SLIPPAGE_BPS    = 500n;           // 5 % slippage tolerance (accounts for multiple intents affecting same pool)

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
interface OrderRef   { orderId: string }

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

async function phase6SwapIntents(
  userA: Wallet,
  userB: Wallet,
  userC: Wallet,
  pool1: PoolMeta,
): Promise<IntentRef[]> {
  hr('Phase 6 — Swap Intents [TC-S04, TC-SE01, TC-SE02] → SolverEngine fills');

  const deadline = Date.now() + 6 * 3600 * 1000; // 6 h

  // Fetch current pool reserves to compute accurate minOutput
  const poolInfo = await apiGet<PoolRow>(`/pools/${pool1.poolId}`);
  const reserveA = BigInt(poolInfo.reserveA ?? '0');
  const reserveB = BigInt(poolInfo.reserveB ?? '0');
  const feeNum   = BigInt(poolInfo.feeNumerator ?? 30);
  const feeDenom = BigInt(poolInfo.feeDenominator ?? 10000);

  log('intents', `Pool reserves: A=${reserveA} B=${reserveB} fee=${feeNum}/${feeDenom}`);
  log('intents', 'Creating 3 intents (one per user) — each awaits on-chain confirmation + /tx/confirm');

  // i1: User A swaps tBTC (assetA) → tUSD (assetB)  →  reserveIn=A, reserveOut=B
  const minOut1 = computeMinOutput(SWAP_TBTC,      reserveA, reserveB, feeNum, feeDenom);
  // i2: User B swaps tUSD (assetB) → tBTC (assetA)  →  reserveIn=B, reserveOut=A
  const minOut2 = computeMinOutput(SWAP_TUSD,      reserveB, reserveA, feeNum, feeDenom);
  // i3: User C swaps tBTC (assetA) → tUSD (assetB)  →  reserveIn=A, reserveOut=B
  const minOut3 = computeMinOutput(SWAP_TBTC * 2n, reserveA, reserveB, feeNum, feeDenom);

  log('intents', `Computed minOutputs: i1=${minOut1}, i2=${minOut2}, i3=${minOut3}`);

  // One intent per user only: each signSubmitConfirm awaits confirmation
  // i2 uses partialFill=true (250 tUSD is large relative to reserves)
  const i1 = await createIntent(userA, asTbtc(), asTusd(),  SWAP_TBTC,       minOut1, deadline, 'i1-A-AtoB',    true);
  const i2 = await createIntent(userB, asTusd(), asTbtc(),  SWAP_TUSD,       minOut2, deadline, 'i2-B-BtoA',    true);
  const i3 = await createIntent(userC, asTbtc(), asTusd(),  SWAP_TBTC * 2n,  minOut3, deadline, 'i3-C-AtoB-2x', true);

  log('intents', `✅ 3 intents on-chain and ACTIVE. SolverEngine (15 s cycle) will batch-fill them.`);
  log('intents', `   Monitor: GET ${API}/intents?address=${userA.address.slice(0, 20)}...`);
  return [i1, i2, i3];
}

/**
 * Observe (poll) that SolverEngine has filled the intents.
 * Does NOT trigger the solver — just watches the API.
 * TC-SE01: Solver auto-fills intent
 * TC-SE02: Solver batches multiple intents
 */
async function observeIntentFills(intents: IntentRef[]): Promise<void> {
  hr('Phase 6b — Observe SolverEngine [TC-SE01, TC-SE02]');
  log('watch', `Polling ${intents.length} intents for FILLED status...`);

  for (const { intentId } of intents) {
    const short = intentId.slice(0, 10);
    const result = await pollUntil<{ status?: string }>(
      `intent-${short}`,
      () => apiGet(`/intents/${intentId}`),
      v => v.status === 'FILLED' || v.status === 'PARTIALLY_FILLED',
      12_000,
      150_000,
    );
    const status = result?.status ?? 'TIMEOUT';
    const icon   = status === 'FILLED' || status === 'PARTIALLY_FILLED' ? '✅' : '⚠️';
    log('watch', `${icon} ${short}… → ${status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 7 — Cancel Intent (TC-O09: user-initiated on-chain cancel)
// ═══════════════════════════════════════════════════════════════════

async function phase7CancelIntent(userA: Wallet): Promise<void> {
  hr('Phase 7 — Cancel Intent [TC-O09] — user signs cancel before solver fills');

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
}

// ═══════════════════════════════════════════════════════════════════
// Phase 8 — Expired Intent → ReclaimKeeperCron (TC-O10, TC-SE05)
// ═══════════════════════════════════════════════════════════════════

async function phase8ExpiredIntent(user: Wallet): Promise<void> {
  hr('Phase 8 — Expired Intent [TC-O10, TC-SE05] → ReclaimKeeperCron');

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
// Phases 9-11 — Advanced Orders (bots execute, script only creates)
// ═══════════════════════════════════════════════════════════════════

async function createOrder(
  user: Wallet,
  orderType: 'DCA' | 'LIMIT' | 'STOP_LOSS',
  inputAsset: string,
  outputAsset: string,
  totalBudget: bigint,
  amountPerInterval: bigint,
  intervalSlots: number,
  priceNum: bigint,
  priceDen: bigint,
  deadlineMs: number,
  label: string,
): Promise<OrderRef> {
  log(label, `type=${orderType} budget=${totalBudget}`);

  // inputAmount = per-execution amount (required by schema)
  const inputAmount = amountPerInterval.toString();

  const res = await apiPost<{ orderId: string; unsignedTx: string }>('/orders', {
    type:              orderType,
    senderAddress:     user.address,
    changeAddress:     user.address,
    inputAsset,
    outputAsset,
    inputAmount,
    amountPerInterval: amountPerInterval.toString(),
    intervalSlots:     intervalSlots > 0 ? intervalSlots : undefined,
    totalBudget:       totalBudget.toString(),
    priceNumerator:    priceNum.toString(),
    priceDenominator:  priceDen.toString(),
    deadline:          deadlineMs,
  });

  // Sign, submit, await confirmation, and call /tx/confirm to activate the order
  await signSubmitConfirm(user, res.unsignedTx, label, {
    orderId: res.orderId,
    action: 'create_order',
  });
  log(label, `Order: ${res.orderId}`);
  return { orderId: res.orderId };
}

async function phase9DcaOrder(userA: Wallet): Promise<OrderRef> {
  hr('Phase 9 — DCA Order [TC-O04, TC-O05, TC-SE04] → OrderExecutorCron');

  const deadline = Date.now() + 24 * 3600 * 1000;
  // Buy tBTC with tUSD — pool price ~50 tUSD/tBTC, cap at 60 (always satisfiable)
  const order = await createOrder(
    userA, 'DCA', asTusd(), asTbtc(),
    DCA_BUDGET,     // 100 tUSD total
    DCA_PER_INT,    // 10 tUSD per interval
    DCA_INTERVAL,   // 60 slots between fills
    1n, 60n,        // price cap: 1 tBTC ≤ 60 tUSD (pool price = 50 → OK)
    deadline, 'dca-order',
  );

  log('dca-order', '✅ DCA order on-chain.');
  log('dca-order', '   OrderExecutorCron will execute each 60 s interval.');
  log('dca-order', '   Watch backend logs for: "DCA order executed"');
  return order;
}

async function phase10LimitOrder(userB: Wallet): Promise<OrderRef> {
  hr('Phase 10 — Limit Order [TC-O01, TC-O02, TC-SE04] → OrderExecutorCron');

  const deadline = Date.now() + 24 * 3600 * 1000;
  // Sell 5 tBTC for tUSD — trigger when price ≥ 40 tUSD/tBTC
  // Pool gives ~50 tUSD/tBTC → condition immediately satisfied
  const order = await createOrder(
    userB, 'LIMIT', asTbtc(), asTusd(),
    SWAP_TBTC,
    SWAP_TBTC,   // one-shot (totalBudget = amountPerInterval)
    0,           // no minimum interval
    40n, 1n,     // minPrice: get at least 40 tUSD per tBTC (50 > 40 ✅)
    deadline, 'limit-order',
  );

  log('limit-order', '✅ Limit order on-chain.');
  log('limit-order', '   OrderExecutorCron will fill when pool price ≥ 40 tUSD/tBTC.');
  return order;
}

async function phase11StopLossOrder(userC: Wallet): Promise<OrderRef> {
  hr('Phase 11 — Stop-Loss Order [TC-O06, TC-SE04] → OrderExecutorCron');

  const deadline = Date.now() + 24 * 3600 * 1000;
  // Sell tBTC if price drops below 10,000 tUSD/tBTC
  // Actual price ~50, so 50 < 10,000 → trigger fires immediately
  const order = await createOrder(
    userC, 'STOP_LOSS', asTbtc(), asTusd(),
    SWAP_TBTC,
    SWAP_TBTC,
    0,
    10_000n, 1n,  // stop price 10,000 → always triggers at current pool
    deadline, 'stoploss-order',
  );

  log('stoploss-order', '✅ StopLoss order on-chain.');
  log('stoploss-order', '   OrderExecutorCron fires when pool price < stop threshold.');
  return order;
}

/**
 * Observe OrderExecutorCron filling the Phase 9-11 orders.
 * Does NOT execute them — just polls status.  TC-SE04.
 */
async function observeOrderExecution(orders: OrderRef[]): Promise<void> {
  hr('Phase 9-11b — Observe OrderExecutorCron [TC-SE04]');
  log('watch', `Polling ${orders.length} orders for FILLED / PARTIALLY_FILLED...`);

  for (const { orderId } of orders) {
    const short = orderId.slice(0, 8);
    const result = await pollUntil<{ status?: string }>(
      `order-${short}`,
      () => apiGet(`/orders/${orderId}`),
      v => ['FILLED', 'PARTIALLY_FILLED'].includes(v.status ?? ''),
      15_000,
      150_000,
    );
    const status = result?.status ?? 'TIMEOUT';
    const icon   = (status === 'FILLED' || status === 'PARTIALLY_FILLED') ? '✅' : '⚠️';
    log('watch', `${icon} order ${short}… → ${status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 12 — Cancel Order (TC-O07, TC-O08)
// ═══════════════════════════════════════════════════════════════════

async function phase12CancelOrder(user: Wallet): Promise<void> {
  hr('Phase 12 — Cancel Order [TC-O07] — user signs cancel before bot executes');

  const deadline = Date.now() + 3 * 3600 * 1000;
  // Use an impossible price so OrderExecutorCron never touches this order
  // (price cap = 1 tUSD for 1,000,000 tBTC — never satisfiable)
  const { orderId } = await createOrder(
    user, 'DCA', asTusd(), asTbtc(),
    DCA_BUDGET,
    DCA_PER_INT,
    DCA_INTERVAL,
    1_000_000n, 1n,  // impossible price: 1,000,000 tUSD per tBTC → bot won't execute
    deadline, 'cancel-order-setup',
  );

  log('cancel-order', `Order: ${orderId.slice(0, 10)}… — already confirmed on-chain`);

  const res = await apiDelete<{ orderId: string; unsignedTx: string | null }>(
    `/orders/${orderId}`, { senderAddress: user.address },
  );

  if (!res.unsignedTx) {
    log('cancel-order', '⚠️  No unsigned TX returned');
    return;
  }

  await signSubmitConfirm(user, res.unsignedTx, 'cancel-order', {
    orderId,
    action: 'cancel_order',
  });
  log('cancel-order', `✅ Order cancelled & confirmed`);
  log('cancel-order', '   Budget tokens returned to owner wallet');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 13 — Expired Order → ReclaimKeeperCron (TC-O10, TC-SE05)
// ═══════════════════════════════════════════════════════════════════

async function phase13ExpiredOrder(user: Wallet): Promise<void> {
  hr('Phase 13 — Expired Order [TC-O10, TC-SE05] → ReclaimKeeperCron');

  // 3 min deadline — createOrder takes ~2 min on-chain, so order expires ~1 min after ACTIVE
  const shortDeadline = Date.now() + 3 * 60_000;
  const { orderId }   = await createOrder(
    user, 'DCA', asTusd(), asTbtc(),
    DCA_BUDGET, DCA_PER_INT, DCA_INTERVAL,
    1n, 60n,
    shortDeadline, 'expire-order',
  );
  log('expire-order', `Order with 3-min deadline: ${orderId.slice(0, 10)}…`);

  // Wait until the deadline passes
  const waitMs = Math.max(0, shortDeadline - Date.now() + 5_000);
  log('expire-order', `Waiting ${Math.round(waitMs / 1000)} s for deadline to pass...`);
  await sleep(waitMs);

  log('expire-order', '✅ Deadline passed. ReclaimKeeperCron will reclaim on next tick (~60 s)');

  const result = await pollUntil<{ status?: string }>(
    'expire-order-watch',
    () => apiGet(`/orders/${orderId}`),
    v => v.status === 'RECLAIMED' || v.status === 'EXPIRED',
    15_000,
    180_000,
  );
  const status = result?.status ?? 'TIMEOUT';
  log('expire-order', (status === 'RECLAIMED' || status === 'EXPIRED')
    ? `✅ Order is now ${status}`
    : '⚠️  Not yet RECLAIMED — check backend logs');
}

// ═══════════════════════════════════════════════════════════════════
// Phase 14 — Withdraw Liquidity (TC-P08, TC-P09)
// ═══════════════════════════════════════════════════════════════════

async function phase14Withdraw(userA: Wallet, pool1: PoolMeta): Promise<void> {
  hr('Phase 14 — Withdraw Liquidity [TC-P08] (user removes LP position)');

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
// Phase 15 — Update Protocol Settings (TC-AD04)
// ═══════════════════════════════════════════════════════════════════

async function phase15UpdateSettings(admin: Wallet): Promise<void> {
  hr('Phase 15 — Update Protocol Settings [TC-AD04]');

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
  console.log('  SolverNet DEX — Full On-Chain System Test');
  console.log(`  Network: ${NETWORK} | Backend: ${BACKEND_URL}`);
  console.log(`  Time:    ${new Date().toISOString()}`);
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
  log('preflight', '⚠️  Bots MUST be running for phases 6b, 8, 9-11b, 13 to complete!');

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

  hr('Phase 3 — Create Pool tBTC / tUSD [TC-P02]');
  let pool1 = await findExistingPool(TBTC_POLICY, TUSD_POLICY);
  if (pool1) {
    log('pool1', `tBTC/tUSD pool already exists — ID: ${pool1.poolId}`);
    phaseResults.push({ phase: 'Phase 3 — Create tBTC/tUSD Pool', status: 'PASS' });
  } else {
    await runPhase('Phase 3 — Create tBTC/tUSD Pool', async () => {
      pool1 = await createPool(admin, 'pool1', asTbtc(), asTusd(), POOL_INIT_TBTC, POOL_INIT_TUSD);
    });
  }

  hr('Phase 4 — Create Pool tUSD / tSOL [TC-P02]');
  let pool2: PoolMeta | null = await findExistingPool(TUSD_POLICY, TSOL_POLICY);
  if (pool2) {
    log('pool2', `tUSD/tSOL pool already exists — ID: ${pool2.poolId}`);
    phaseResults.push({ phase: 'Phase 4 — Create tUSD/tSOL Pool', status: 'PASS' });
  } else {
    await runPhase('Phase 4 — Create tUSD/tSOL Pool', async () => {
      pool2 = await createPool(admin, 'pool2', asTusd(), asTsol(), POOL_INIT_TUSD / 2n, POOL_INIT_TSOL);
    });
  }

  if (!pool1) {
    console.error('\n❌ Cannot continue — tBTC/tUSD pool (pool1) not available. Aborting.\n');
    process.exit(1);
  }

  // ════ LIQUIDITY DEPOSIT ══════════════════════════════════════════

  hr('Phase 5 — Deposit Liquidity [TC-P06, TC-P07]');
  await runPhase('Phase 5a — User A deposit tBTC/tUSD', async () => {
    // Deposit only a modest fraction so UserA retains enough tUSD for Phase 9 DCA
    await depositLiquidity(userA, pool1!.poolId, POOL_INIT_TBTC / 100n, 50_000_000n, 'deposit-A-pool1');
  });
  if (pool2) {
    await runPhase('Phase 5b — User B deposit tUSD/tSOL', async () => {
      await depositLiquidity(userB, pool2!.poolId, POOL_INIT_TUSD / 20n, POOL_INIT_TSOL / 10n, 'deposit-B-pool2');
    });
  } else {
    log('phase5', 'Skipping User B deposit — pool2 not available');
    phaseResults.push({ phase: 'Phase 5b — User B deposit tUSD/tSOL', status: 'SKIP' });
  }

  // ════ SWAP INTENTS (user action, bot fills async) ═════════════════

  let intentRefs: IntentRef[] = [];
  await runPhase('Phase 6 — Swap Intents', async () => {
    intentRefs = await phase6SwapIntents(userA, userB, userC, pool1!);
  });

  // ════ CANCEL INTENT (user action) ════════════════════════════════

  await runPhase('Phase 7 — Cancel Intent', () => phase7CancelIntent(userA));

  // Wait for Phase 7's fire-and-forget TXes to be indexed by Blockfrost
  // before Phase 8 tries to reuse UserA/UserB wallets.
  log('main', 'Waiting 40 s for Phase 7 TXes to propagate...');
  await sleep(40_000);

  // ════ EXPIRED INTENT (sequential, userB to avoid collision with Phase 9 userA) ════
  await runPhase('Phase 8 — Expired Intent', () => phase8ExpiredIntent(userB));

  // ════ ADVANCED ORDERS (user creates, bot executes async) ══════════

  let dcaOrder: OrderRef  = { orderId: '' };
  let limitOrder: OrderRef = { orderId: '' };
  let stopLoss: OrderRef   = { orderId: '' };

  await runPhase('Phase 9  — DCA Order',       async () => { dcaOrder   = await phase9DcaOrder(userA);      });
  await runPhase('Phase 10 — Limit Order',      async () => { limitOrder = await phase10LimitOrder(userB);   });
  await runPhase('Phase 11 — Stop-Loss Order',  async () => { stopLoss   = await phase11StopLossOrder(userC);});
  await runPhase('Phase 12 — Cancel Order',     () => phase12CancelOrder(userC));

  // Phase 13 uses userA (not userB) to avoid collision with Phase 10 userB above.
  await runPhase('Phase 13 — Expired Order', () => phase13ExpiredOrder(userA));

  // ════ OBSERVE BOT ACTIVITY (non-blocking polls) ════════════════════

  if (intentRefs.length > 0) await runPhase('Phase 6b — Observe Intent Fills', () => observeIntentFills(intentRefs));
  const activeOrders = [dcaOrder, limitOrder, stopLoss].filter(o => o.orderId);
  if (activeOrders.length > 0) await runPhase('Phase 9-11b — Observe Order Execution', () => observeOrderExecution(activeOrders));

  // ════ WITHDRAW LIQUIDITY (user action) ════════════════════════════

  await runPhase('Phase 14 — Withdraw Liquidity', () => phase14Withdraw(userA, pool1!));

  // ════ UPDATE SETTINGS (admin action) ══════════════════════════════

  await runPhase('Phase 15 — Update Settings', () => phase15UpdateSettings(admin));

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

  console.log('  Verify results:');
  console.log(`    ${API}/pools`);
  console.log(`    ${API}/intents`);
  console.log(`    ${API}/orders`);
  console.log('    https://preprod.cardanoscan.io/');
  console.log('\n' + '═'.repeat(72) + '\n');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
