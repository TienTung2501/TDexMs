/**
 * Swap Bot Service — Automated Trading Activity Bot
 *
 * Integrated service version of scripts/bot-swap.ts.
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
 * Controlled by env: BOT_SWAP_ENABLED (default: false)
 */
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
  type Network,
} from '@lucid-evolution/lucid';
import { getLogger } from '../../config/logger.js';

// ─── Config ────────────────────────────────────────────────────────
const MIN_INTERVAL_MS = 5 * 60 * 1000;    // 5 minutes
const MAX_INTERVAL_MS = 30 * 60 * 1000;   // 30 minutes
const MIN_ADA_BALANCE = 10_000_000n;       // 10 ADA minimum
const SLIPPAGE_BPS    = 500n;              // 5% slippage tolerance
const INTENT_DEADLINE_MS = 4 * 3600 * 1000; // 4 hour deadline
const SWAP_PERCENT_MIN = 1;
const SWAP_PERCENT_MAX = 5;

// ─── Types ─────────────────────────────────────────────────────────
interface PoolInfo {
  poolId: string;
  assetA: { policyId: string; assetName: string; ticker?: string };
  assetB: { policyId: string; assetName: string; ticker?: string };
  reserveA: string;
  reserveB: string;
  feeNumerator: number;
  feeDenominator?: number;
  state: string;
}

interface Wallet {
  label: string;
  seed: string;
  address: string;
  lucid: LucidEvolution;
}

export interface SwapBotConfig {
  backendUrl: string;
  blockfrostUrl: string;
  blockfrostProjectId: string;
  network: 'Preprod' | 'Mainnet';
  walletSeeds: string[];
}

export class SwapBotService {
  private readonly logger;
  private running = false;
  private wallets: Wallet[] = [];
  private readonly apiBase: string;

  constructor(private readonly config: SwapBotConfig) {
    this.logger = getLogger().child({ service: 'swap-bot' });
    this.apiBase = `${config.backendUrl.replace(/\/$/, '')}/v1`;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.config.walletSeeds.length === 0) {
      this.logger.warn('No wallet seeds configured — swap bot disabled');
      return;
    }

    this.running = true;
    this.logger.info('Swap bot service starting...');

    // Initialize wallets
    for (let i = 0; i < this.config.walletSeeds.length; i++) {
      try {
        const lucid = await Lucid(
          new Blockfrost(this.config.blockfrostUrl, this.config.blockfrostProjectId),
          this.config.network,
        );
        lucid.selectWallet.fromSeed(this.config.walletSeeds[i]);
        const address = await lucid.wallet().address();
        this.wallets.push({
          label: `swap-wallet-${i}`,
          seed: this.config.walletSeeds[i],
          address,
          lucid,
        });
        this.logger.info({ wallet: `swap-wallet-${i}`, address: address.slice(0, 30) + '…' }, 'Wallet initialized');
      } catch (err) {
        this.logger.warn({ err, index: i }, 'Failed to initialize swap wallet');
      }
    }

    if (this.wallets.length === 0) {
      this.logger.warn('No valid wallets — swap bot disabled');
      this.running = false;
      return;
    }

    // Run bot loop (non-blocking)
    this.loop().catch((err) => {
      this.logger.error({ err }, 'Swap bot loop crashed');
    });
  }

  stop(): void {
    this.running = false;
    this.logger.info('Swap bot service stopped');
  }

  private async loop(): Promise<void> {
    let round = 0;
    while (this.running) {
      round++;
      try {
        await this.executeRound(round);
      } catch (err) {
        this.logger.error({ round, err }, 'Swap round failed');
      }

      // Random wait between trades
      const waitMs = randomBetween(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
      this.logger.info({ nextInMinutes: Math.round(waitMs / 60000) }, 'Next swap trade scheduled');

      const deadline = Date.now() + waitMs;
      while (this.running && Date.now() < deadline) {
        await sleep(Math.min(5000, deadline - Date.now()));
      }
    }
  }

  private async executeRound(round: number): Promise<void> {
    this.logger.info({ round }, 'Swap bot round starting');

    // 1. Get active pools
    const pools = await this.apiGet<{ data: PoolInfo[] }>('/pools');
    const activePools = pools.data.filter((p) => p.state === 'ACTIVE');
    if (activePools.length === 0) {
      this.logger.info('No active pools — skipping round');
      return;
    }

    // 2. Pick random pool and direction
    const pool = activePools[randomBetween(0, activePools.length - 1)];
    const reserveA = BigInt(pool.reserveA);
    const reserveB = BigInt(pool.reserveB);
    const feeNum = BigInt(pool.feeNumerator);
    const feeDenom = BigInt(pool.feeDenominator ?? 10000);
    const isBuyA = Math.random() > 0.5;

    const inputAsset = isBuyA
      ? assetId(pool.assetB.policyId, pool.assetB.assetName)
      : assetId(pool.assetA.policyId, pool.assetA.assetName);
    const outputAsset = isBuyA
      ? assetId(pool.assetA.policyId, pool.assetA.assetName)
      : assetId(pool.assetB.policyId, pool.assetB.assetName);
    const reserveIn = isBuyA ? reserveB : reserveA;
    const reserveOut = isBuyA ? reserveA : reserveB;
    const inputTicker = isBuyA ? (pool.assetB.ticker ?? 'B') : (pool.assetA.ticker ?? 'A');
    const outputTicker = isBuyA ? (pool.assetA.ticker ?? 'A') : (pool.assetB.ticker ?? 'B');

    // 3. Compute swap amount
    const pct = randomBetween(SWAP_PERCENT_MIN, SWAP_PERCENT_MAX);
    const inputAmount = (reserveIn * BigInt(pct)) / 100n;
    if (inputAmount <= 0n) {
      this.logger.info({ poolId: pool.poolId }, 'Input amount too small — skipping');
      return;
    }

    // 4. Find a wallet with enough balance
    const shuffled = [...this.wallets].sort(() => Math.random() - 0.5);
    let selectedWallet: Wallet | null = null;

    for (const w of shuffled) {
      try {
        const utxos = await w.lucid.wallet().getUtxos();
        const bal = aggregateBalances(utxos);
        const ada = bal['lovelace'] ?? 0n;
        if (ada < MIN_ADA_BALANCE) continue;
        const inputUnit = inputAsset === 'lovelace' ? 'lovelace' : inputAsset.replace('.', '');
        if ((bal[inputUnit] ?? 0n) < inputAmount) continue;
        selectedWallet = w;
        break;
      } catch {
        continue;
      }
    }

    if (!selectedWallet) {
      this.logger.info('No wallet with sufficient balance — skipping round');
      return;
    }

    // 5. Compute min output with slippage
    const expectedOut = ammExpectedOutput(inputAmount, reserveIn, reserveOut, feeNum, feeDenom);
    const minOutput = (expectedOut * (10000n - SLIPPAGE_BPS)) / 10000n;
    if (minOutput <= 0n) {
      this.logger.info('Min output is 0 — skipping');
      return;
    }

    const deadline = Date.now() + INTENT_DEADLINE_MS;

    this.logger.info(
      {
        wallet: selectedWallet.label,
        inputAmount: inputAmount.toString(),
        inputTicker,
        outputTicker,
        poolId: pool.poolId.slice(0, 8),
        pct,
      },
      'Executing swap',
    );

    // 6. Create intent
    const res = await this.apiPost<{ intentId: string; unsignedTx: string }>('/intents', {
      senderAddress: selectedWallet.address,
      changeAddress: selectedWallet.address,
      inputAsset,
      outputAsset,
      inputAmount: inputAmount.toString(),
      minOutput: minOutput.toString(),
      deadline,
      partialFill: true,
    });

    // 7. Sign and submit
    const signed = await selectedWallet.lucid.fromTx(res.unsignedTx).sign.withWallet().complete();
    const submitResult = await this.apiPost<{ txHash: string; status: string; error?: string }>(
      '/tx/submit',
      { signedTx: signed.toCBOR() },
    );
    if (submitResult.status !== 'accepted') {
      throw new Error(`TX rejected: ${submitResult.error ?? 'unknown'}`);
    }

    this.logger.info(
      { intentId: res.intentId, txHash: submitResult.txHash.slice(0, 16) },
      'Swap intent submitted',
    );

    // 8. Wait for confirmation
    try {
      const confirmed = await selectedWallet.lucid.awaitTx(submitResult.txHash, 60_000);
      if (confirmed) {
        this.logger.info({ txHash: submitResult.txHash.slice(0, 16) }, 'Swap TX confirmed');
        try {
          await this.apiPost('/tx/confirm', {
            txHash: submitResult.txHash,
            intentId: res.intentId,
            action: 'create_intent',
          });
        } catch { /* ChainSync will handle */ }
      }
    } catch {
      this.logger.warn('awaitTx error — continuing');
    }
  }

  private async apiGet<T>(path: string): Promise<T> {
    const r = await fetch(`${this.apiBase}${path}`);
    const body = (await r.json()) as T;
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(body)}`);
    return body;
  }

  private async apiPost<T>(path: string, payload: unknown): Promise<T> {
    const r = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await r.json()) as T;
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(body)}`);
    return body;
  }
}

// ─── Utility functions ─────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function assetId(policyId: string, assetName: string): string {
  if (!policyId) return 'lovelace';
  return `${policyId}.${assetName}`;
}

function ammExpectedOutput(
  inputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeNum = 30n,
  feeDenom = 10000n,
): bigint {
  const inputWithFee = inputAmount * (feeDenom - feeNum);
  const numerator = reserveOut * inputWithFee;
  const denominator = reserveIn * feeDenom + inputWithFee;
  return numerator / denominator;
}

function aggregateBalances(utxos: { assets: Record<string, bigint> }[]): Record<string, bigint> {
  const totals: Record<string, bigint> = {};
  for (const utxo of utxos) {
    for (const [unit, qty] of Object.entries(utxo.assets)) {
      totals[unit] = (totals[unit] ?? 0n) + qty;
    }
  }
  return totals;
}
