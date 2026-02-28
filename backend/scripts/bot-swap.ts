/// <reference types="node" />
/**
 * bot-swap.ts — Automated Swap Bot for SolverNet DEX Demo
 *
 * Creates swap intents at randomized intervals to simulate trading activity.
 * Uses MNEMONIC0, MNEMONIC1, MNEMONIC2 wallets — rotates between them.
 *
 * BEHAVIOR:
 *   - Picks a random pool and random direction (A→B or B→A)
 *   - Picks a small random amount (1–5% of the input reserve)
 *   - Submits an intent with 5% slippage tolerance
 *   - Waits 5–30 minutes before the next trade
 *   - If a wallet is low on tADA (<10 ADA), skips it
 *
 * RUNNING:
 *   cd backend && pnpm exec tsx scripts/bot-swap.ts
 *   # Or with PM2: pm2 start "pnpm exec tsx scripts/bot-swap.ts" --name swap-bot
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

// Bot wallets — rotate between these
const WALLET_SEEDS = [
  process.env.MNEMONIC0 ?? '',
  process.env.MNEMONIC1 ?? '',
  process.env.MNEMONIC2 ?? '',
].filter(Boolean);

// Timing (ms)
const MIN_INTERVAL_MS = 5 * 60 * 1000;    // 5 minutes
const MAX_INTERVAL_MS = 30 * 60 * 1000;   // 30 minutes
const MIN_ADA_BALANCE = 10_000_000n;       // 10 ADA minimum to operate
const SLIPPAGE_BPS    = 500n;              // 5% slippage tolerance
const INTENT_DEADLINE_MS = 4 * 3600 * 1000; // 4 hour deadline
const SWAP_PERCENT_MIN = 1;   // Min % of reserve to swap
const SWAP_PERCENT_MAX = 5;   // Max % of reserve to swap

// ─── Utility ───────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function log(msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] [swap-bot] ${msg}`);
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
  label: string;
  seed: string;
  address: string;
  lucid: LucidEvolution;
}

async function makeWallet(seed: string, label: string): Promise<Wallet> {
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_PROJECT), NETWORK);
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  return { label, seed, address, lucid };
}

async function getWalletBalance(wallet: Wallet): Promise<Record<string, bigint>> {
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
  feeNumerator: number;
  feeDenominator?: number;
  state: string;
}

// ─── AMM math ──────────────────────────────────────────────────────
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

function computeMinOutput(
  inputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeNum = 30n,
  feeDenom = 10000n,
): bigint {
  const expectedOut = ammExpectedOutput(inputAmount, reserveIn, reserveOut, feeNum, feeDenom);
  return (expectedOut * (10000n - SLIPPAGE_BPS)) / 10000n;
}

function assetId(policyId: string, assetName: string): string {
  if (!policyId) return 'lovelace';
  return `${policyId}.${assetName}`;
}

// ─── Main bot loop ─────────────────────────────────────────────────
async function main() {
  log('Starting swap bot...');

  if (WALLET_SEEDS.length === 0) {
    log('ERROR: No wallet seeds configured (MNEMONIC0, MNEMONIC1, MNEMONIC2)');
    process.exit(1);
  }

  // Initialize wallets
  const wallets: Wallet[] = [];
  for (let i = 0; i < WALLET_SEEDS.length; i++) {
    const w = await makeWallet(WALLET_SEEDS[i], `wallet-${i}`);
    log(`Initialized ${w.label}: ${w.address.slice(0, 30)}…`);
    wallets.push(w);
  }

  let roundNum = 0;

  // Graceful shutdown
  let running = true;
  process.on('SIGINT', () => { log('Shutting down...'); running = false; });
  process.on('SIGTERM', () => { log('Shutting down...'); running = false; });

  while (running) {
    roundNum++;
    try {
      await executeSwapRound(wallets, roundNum);
    } catch (err) {
      log(`Round ${roundNum} failed: ${err instanceof Error ? err.message : err}`);
    }

    // Random wait between trades
    const waitMs = randomBetween(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
    log(`Next trade in ${Math.round(waitMs / 60000)} minutes...`);

    // Sleep in small chunks so we can check `running`
    const deadline = Date.now() + waitMs;
    while (running && Date.now() < deadline) {
      await sleep(Math.min(5000, deadline - Date.now()));
    }
  }

  log('Swap bot stopped.');
}

async function executeSwapRound(wallets: Wallet[], round: number) {
  log(`═══ Round ${round} ═══`);

  // 1. Get active pools
  const poolsRes = await apiGet<{ data: PoolInfo[] }>('/pools');
  const activePools = poolsRes.data.filter(p => p.state === 'ACTIVE');
  if (activePools.length === 0) {
    log('No active pools found — skipping round');
    return;
  }

  // 2. Pick a random pool
  const pool = activePools[randomBetween(0, activePools.length - 1)];
  const reserveA = BigInt(pool.reserveA);
  const reserveB = BigInt(pool.reserveB);
  const feeNum   = BigInt(pool.feeNumerator);
  const feeDenom = BigInt(pool.feeDenominator ?? 10000);

  // 3. Pick random direction
  const isBuyA = Math.random() > 0.5; // true = B→A, false = A→B

  const inputAsset  = isBuyA ? assetId(pool.assetB.policyId, pool.assetB.assetName) : assetId(pool.assetA.policyId, pool.assetA.assetName);
  const outputAsset = isBuyA ? assetId(pool.assetA.policyId, pool.assetA.assetName) : assetId(pool.assetB.policyId, pool.assetB.assetName);
  const reserveIn   = isBuyA ? reserveB : reserveA;
  const reserveOut  = isBuyA ? reserveA : reserveB;
  const inputTicker = isBuyA ? (pool.assetB.ticker ?? 'B') : (pool.assetA.ticker ?? 'A');
  const outputTicker= isBuyA ? (pool.assetA.ticker ?? 'A') : (pool.assetB.ticker ?? 'B');

  // 4. Pick swap amount (1–5% of the input reserve)
  const pct = randomBetween(SWAP_PERCENT_MIN, SWAP_PERCENT_MAX);
  const inputAmount = (reserveIn * BigInt(pct)) / 100n;
  if (inputAmount <= 0n) {
    log(`Input amount too small for pool ${pool.poolId} — skipping`);
    return;
  }

  // 5. Pick a random wallet that has enough balance
  const shuffled = [...wallets].sort(() => Math.random() - 0.5);
  let selectedWallet: Wallet | null = null;

  for (const w of shuffled) {
    try {
      const bal = await getWalletBalance(w);
      const ada = bal['lovelace'] ?? 0n;
      if (ada < MIN_ADA_BALANCE) {
        log(`${w.label} has insufficient ADA (${Number(ada) / 1e6} ADA) — skipping`);
        continue;
      }
      // Check if wallet has enough of the input token
      const inputUnit = inputAsset === 'lovelace' ? 'lovelace' : inputAsset.replace('.', '');
      const tokenBal = bal[inputUnit] ?? 0n;
      if (tokenBal < inputAmount) {
        log(`${w.label} has insufficient ${inputTicker} (${tokenBal} < ${inputAmount}) — skipping`);
        continue;
      }
      selectedWallet = w;
      break;
    } catch (e) {
      log(`${w.label} balance check failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (!selectedWallet) {
    log('No wallet with sufficient balance — skipping round');
    return;
  }

  // 6. Compute min output with slippage
  const minOutput = computeMinOutput(inputAmount, reserveIn, reserveOut, feeNum, feeDenom);
  if (minOutput <= 0n) {
    log('Min output calculation yielded 0 — skipping');
    return;
  }

  const deadline = Date.now() + INTENT_DEADLINE_MS;

  log(`Trade: ${selectedWallet.label} swaps ${inputAmount} ${inputTicker} → ${outputTicker} (pool ${pool.poolId.slice(0, 8)}…, ${pct}% of reserve)`);

  // 7. Create intent
  const res = await apiPost<{ intentId: string; unsignedTx: string }>('/intents', {
    senderAddress: selectedWallet.address,
    changeAddress: selectedWallet.address,
    inputAsset,
    outputAsset,
    inputAmount:   inputAmount.toString(),
    minOutput:     minOutput.toString(),
    deadline,
    partialFill:   true,
  });

  // 8. Sign and submit
  const signed = await selectedWallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
  const submitResult = await apiPost<{ txHash: string; status: string; error?: string }>(
    '/tx/submit', { signedTx: signed.toCBOR() },
  );
  if (submitResult.status !== 'accepted') {
    throw new Error(`TX rejected: ${submitResult.error ?? 'unknown'}`);
  }

  log(`✅ Intent ${res.intentId} submitted → TX ${submitResult.txHash.slice(0, 16)}…`);

  // 9. Wait for confirmation (non-blocking — don't block the bot loop)
  try {
    const confirmed = await selectedWallet.lucid.awaitTx(submitResult.txHash, 60_000);
    if (confirmed) {
      log(`✅ TX confirmed on-chain`);
      // Notify backend
      try {
        await apiPost('/tx/confirm', {
          txHash: submitResult.txHash,
          intentId: res.intentId,
          action: 'create_intent',
        });
      } catch { /* ChainSync will handle it */ }
    } else {
      log(`⚠️ TX not confirmed within 60s — solver will find it via ChainSync`);
    }
  } catch {
    log(`⚠️ awaitTx error — continuing`);
  }
}

main().catch(err => {
  log(`Fatal error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
