/// <reference types="node" />
/**
 * bot-liquidity.ts — Automated Liquidity Provider Bot for SolverNet DEX Demo
 *
 * Periodically adds/removes liquidity from pools to simulate LP activity.
 * Uses T_WALLET_SEED2 wallet by default.
 *
 * BEHAVIOR:
 *   - Every 30–120 minutes, picks a random active pool
 *   - 70% chance: deposit small proportional amounts (2–8% of reserves)
 *   - 30% chance: withdraw 5–20% of the bot's LP position (if any)
 *   - If wallet is low on ADA (<15 ADA), pauses until funded
 *
 * RUNNING:
 *   cd backend && pnpm exec tsx scripts/bot-liquidity.ts
 *   # Or with PM2: pm2 start "pnpm exec tsx scripts/bot-liquidity.ts" --name lp-bot
 *
 * STOPPING:
 *   Ctrl+C or kill the process
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

// Bot wallet — T_WALLET_SEED2 for liquidity provision
const WALLET_SEED = process.env.T_WALLET_SEED2 ?? '';

// Timing (ms)
const MIN_INTERVAL_MS = 30 * 60 * 1000;   // 30 minutes
const MAX_INTERVAL_MS = 120 * 60 * 1000;  // 2 hours
const MIN_ADA_BALANCE = 15_000_000n;       // 15 ADA minimum
const DEPOSIT_PERCENT_MIN = 2;  // Min % of reserve to deposit
const DEPOSIT_PERCENT_MAX = 8;  // Max % of reserve to deposit
const WITHDRAW_PERCENT_MIN = 5;   // Min % of LP to withdraw
const WITHDRAW_PERCENT_MAX = 20;  // Max % of LP to withdraw
const DEPOSIT_PROBABILITY = 0.7;  // 70% deposit, 30% withdraw

// ─── Utility ───────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function log(msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] [lp-bot] ${msg}`);
  if (data !== undefined) {
    console.log('  ', typeof data === 'string' ? data : JSON.stringify(data));
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

// ─── Wallet ────────────────────────────────────────────────────────
interface Wallet {
  seed: string;
  address: string;
  lucid: LucidEvolution;
}

async function makeWallet(seed: string): Promise<Wallet> {
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_PROJECT), NETWORK);
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  return { seed, address, lucid };
}

async function getWalletBalances(wallet: Wallet): Promise<Record<string, bigint>> {
  const utxos = await wallet.lucid.wallet().getUtxos();
  const totals: Record<string, bigint> = {};
  for (const utxo of utxos) {
    for (const [unit, qty] of Object.entries(utxo.assets)) {
      totals[unit] = (totals[unit] ?? 0n) + qty;
    }
  }
  return totals;
}

// ─── Pool types ────────────────────────────────────────────────────
interface PoolInfo {
  poolId: string;
  assetA: { policyId: string; assetName: string; ticker?: string; decimals?: number };
  assetB: { policyId: string; assetName: string; ticker?: string; decimals?: number };
  reserveA: string;
  reserveB: string;
  totalLpTokens: string;
  lpPolicyId?: string;
  poolNftAssetName?: string;
  feeNumerator: number;
  feeDenominator?: number;
  state: string;
}

// ─── Sign & submit helper ──────────────────────────────────────────
async function signSubmitAwait(wallet: Wallet, unsignedTx: string, label: string): Promise<string> {
  const signed = await wallet.lucid.fromTx(unsignedTx).sign.withWallet().complete();
  const result = await apiPost<{ txHash: string; status: string; error?: string }>(
    '/tx/submit', { signedTx: signed.toCBOR() },
  );
  if (result.status !== 'accepted') {
    throw new Error(`TX rejected: ${result.error ?? 'unknown'}`);
  }
  log(`${label} TX submitted: ${result.txHash.slice(0, 16)}…`);

  // Wait for on-chain confirmation
  try {
    const ok = await wallet.lucid.awaitTx(result.txHash, 90_000);
    if (ok) {
      log(`${label} TX confirmed ✅`);
    } else {
      log(`${label} TX not confirmed within 90s — continuing`);
    }
  } catch {
    log(`${label} awaitTx error — continuing`);
  }

  // Brief wait for Blockfrost propagation
  await sleep(10_000);
  return result.txHash;
}

// ─── Main bot loop ─────────────────────────────────────────────────
async function main() {
  log('Starting liquidity bot...');

  if (!WALLET_SEED) {
    log('ERROR: T_WALLET_SEED2 not configured');
    process.exit(1);
  }

  const wallet = await makeWallet(WALLET_SEED);
  log(`Wallet: ${wallet.address.slice(0, 30)}…`);

  let roundNum = 0;

  // Graceful shutdown
  let running = true;
  process.on('SIGINT', () => { log('Shutting down...'); running = false; });
  process.on('SIGTERM', () => { log('Shutting down...'); running = false; });

  while (running) {
    roundNum++;
    try {
      await executeLpRound(wallet, roundNum);
    } catch (err) {
      log(`Round ${roundNum} failed: ${err instanceof Error ? err.message : err}`);
    }

    // Random wait
    const waitMs = randomBetween(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
    log(`Next action in ${Math.round(waitMs / 60000)} minutes...`);

    const deadline = Date.now() + waitMs;
    while (running && Date.now() < deadline) {
      await sleep(Math.min(5000, deadline - Date.now()));
    }
  }

  log('Liquidity bot stopped.');
}

async function executeLpRound(wallet: Wallet, round: number) {
  log(`═══ Round ${round} ═══`);

  // Check ADA balance
  const bal = await getWalletBalances(wallet);
  const ada = bal['lovelace'] ?? 0n;
  if (ada < MIN_ADA_BALANCE) {
    log(`Insufficient ADA: ${Number(ada) / 1e6} ADA (need ${Number(MIN_ADA_BALANCE) / 1e6}) — pausing`);
    return;
  }

  // Get active pools
  const poolsRes = await apiGet<{ data: PoolInfo[] }>('/pools');
  const activePools = poolsRes.data.filter(p => p.state === 'ACTIVE');
  if (activePools.length === 0) {
    log('No active pools — skipping round');
    return;
  }

  // Pick random pool
  const pool = activePools[randomBetween(0, activePools.length - 1)];
  const tickerA = pool.assetA.ticker ?? 'A';
  const tickerB = pool.assetB.ticker ?? 'B';

  // Decide: deposit or withdraw?
  const shouldDeposit = Math.random() < DEPOSIT_PROBABILITY;

  if (shouldDeposit) {
    await doDeposit(wallet, pool, bal, tickerA, tickerB);
  } else {
    await doWithdraw(wallet, pool, bal, tickerA, tickerB);
  }
}

async function doDeposit(
  wallet: Wallet,
  pool: PoolInfo,
  bal: Record<string, bigint>,
  tickerA: string,
  tickerB: string,
) {
  const reserveA = BigInt(pool.reserveA);
  const reserveB = BigInt(pool.reserveB);

  // Pick deposit percentage (of reserve)
  const pct = randomBetween(DEPOSIT_PERCENT_MIN, DEPOSIT_PERCENT_MAX);
  const amountA = (reserveA * BigInt(pct)) / 100n;
  const amountB = (reserveB * BigInt(pct)) / 100n;

  if (amountA <= 0n || amountB <= 0n) {
    log('Reserve too small for deposit — skipping');
    return;
  }

  // Check wallet has enough of both tokens
  const unitA = pool.assetA.policyId ? `${pool.assetA.policyId}${pool.assetA.assetName}` : 'lovelace';
  const unitB = pool.assetB.policyId ? `${pool.assetB.policyId}${pool.assetB.assetName}` : 'lovelace';
  const balA = bal[unitA] ?? 0n;
  const balB = bal[unitB] ?? 0n;

  // Adjust down to what we can afford
  let depositA = amountA;
  let depositB = amountB;
  if (balA < depositA) {
    depositA = balA / 2n; // Use half of remaining
    depositB = reserveA > 0n ? (depositA * reserveB) / reserveA : 0n;
  }
  if (balB < depositB) {
    depositB = balB / 2n;
    depositA = reserveB > 0n ? (depositB * reserveA) / reserveB : 0n;
  }

  if (depositA <= 0n || depositB <= 0n) {
    log(`Insufficient token balance for deposit (${tickerA}=${balA}, ${tickerB}=${balB}) — skipping`);
    return;
  }

  log(`Deposit: ${depositA} ${tickerA} + ${depositB} ${tickerB} → pool ${pool.poolId.slice(0, 8)}… (${pct}% of reserves)`);

  try {
    const res = await apiPost<{ unsignedTx: string }>(`/pools/${pool.poolId}/deposit`, {
      senderAddress: wallet.address,
      changeAddress: wallet.address,
      amountA: depositA.toString(),
      amountB: depositB.toString(),
      minLpTokens: '0',
    });

    await signSubmitAwait(wallet, res.unsignedTx, 'deposit');
    log(`✅ Deposit completed`);
  } catch (err) {
    log(`Deposit failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function doWithdraw(
  wallet: Wallet,
  pool: PoolInfo,
  bal: Record<string, bigint>,
  tickerA: string,
  tickerB: string,
) {
  // Find the bot's LP token balance for this pool
  const lpPolicyId = pool.lpPolicyId;
  if (!lpPolicyId) {
    log(`Pool ${pool.poolId.slice(0, 8)}… has no lpPolicyId — skipping withdraw`);
    return;
  }

  // Find LP balance — try with poolNftAssetName, fallback to prefix match
  let lpBalance = 0n;
  const poolNftAssetName = pool.poolNftAssetName ?? '';
  if (poolNftAssetName) {
    lpBalance = bal[`${lpPolicyId}${poolNftAssetName}`] ?? 0n;
  }
  if (lpBalance === 0n) {
    // Prefix scan
    for (const [unit, qty] of Object.entries(bal)) {
      if (unit.startsWith(lpPolicyId) && qty > 0n) {
        lpBalance = qty;
        break;
      }
    }
  }

  if (lpBalance <= 0n) {
    log(`No LP tokens for pool ${tickerA}/${tickerB} — switching to deposit`);
    await doDeposit(wallet, pool, bal, tickerA, tickerB);
    return;
  }

  const pct = randomBetween(WITHDRAW_PERCENT_MIN, WITHDRAW_PERCENT_MAX);
  const lpToWithdraw = (lpBalance * BigInt(pct)) / 100n;

  if (lpToWithdraw <= 0n) {
    log('LP withdraw amount too small — skipping');
    return;
  }

  log(`Withdraw: ${pct}% LP (${lpToWithdraw} of ${lpBalance}) from pool ${tickerA}/${tickerB}`);

  try {
    const res = await apiPost<{ unsignedTx: string }>(`/pools/${pool.poolId}/withdraw`, {
      senderAddress: wallet.address,
      changeAddress: wallet.address,
      lpTokenAmount: lpToWithdraw.toString(),
      minAmountA: '0',
      minAmountB: '0',
    });

    await signSubmitAwait(wallet, res.unsignedTx, 'withdraw');
    log(`✅ Withdrawal completed`);
  } catch (err) {
    log(`Withdrawal failed: ${err instanceof Error ? err.message : err}`);
  }
}

main().catch(err => {
  log(`Fatal error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
