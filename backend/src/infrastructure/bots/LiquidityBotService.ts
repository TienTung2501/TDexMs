/**
 * Liquidity Bot Service — Automated LP Activity Bot
 *
 * Integrated service version of scripts/bot-liquidity.ts.
 * Periodically adds/removes liquidity from pools to simulate LP activity.
 * Uses T_WALLET_SEED2 wallet by default.
 *
 * BEHAVIOR:
 *   - Every 30–120 minutes, picks a random active pool
 *   - 70% chance: deposit small proportional amounts (2–8% of reserves)
 *   - 30% chance: withdraw 5–20% of the bot's LP position (if any)
 *   - If wallet is low on ADA (<15 ADA), pauses until funded
 *
 * Controlled by env: BOT_LIQUIDITY_ENABLED (default: false)
 */
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
  type Network,
} from '@lucid-evolution/lucid';
import { getLogger } from '../../config/logger.js';

// ─── Config ─────────────────────────────────────────────────────────
const MIN_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;  // 5 ngày (432,000,000 ms)
const MAX_INTERVAL_MS = 10 * 24 * 60 * 60 * 1000; // 10 ngày (864,000,000 ms)
const MIN_ADA_BALANCE = 10_000_000n;
const DEPOSIT_PERCENT_MIN = 2;
const DEPOSIT_PERCENT_MAX = 8;
const WITHDRAW_PERCENT_MIN = 5;
const WITHDRAW_PERCENT_MAX = 20;
const DEPOSIT_PROBABILITY = 0.7;

// ─── Types ──────────────────────────────────────────────────────────
interface PoolInfo {
  poolId: string;
  assetA: { policyId: string; assetName: string; ticker?: string };
  assetB: { policyId: string; assetName: string; ticker?: string };
  reserveA: string;
  reserveB: string;
  totalLpTokens: string;
  lpPolicyId?: string;
  poolNftAssetName?: string;
  feeNumerator: number;
  feeDenominator?: number;
  state: string;
}

interface Wallet {
  address: string;
  lucid: LucidEvolution;
}

export interface LiquidityBotConfig {
  backendUrl: string;
  blockfrostUrl: string;
  blockfrostProjectId: string;
  network: 'Preprod' | 'Mainnet';
  walletSeed: string;
}

export class LiquidityBotService {
  private readonly logger;
  private running = false;
  private wallet: Wallet | null = null;
  private readonly apiBase: string;

  constructor(private readonly config: LiquidityBotConfig) {
    this.logger = getLogger().child({ service: 'liquidity-bot' });
    this.apiBase = `${config.backendUrl.replace(/\/$/, '')}/v1`;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.walletSeed) {
      this.logger.warn('No wallet seed configured — liquidity bot disabled');
      return;
    }

    this.running = true;
    this.logger.info('Liquidity bot service starting...');

    try {
      const lucid = await Lucid(
        new Blockfrost(this.config.blockfrostUrl, this.config.blockfrostProjectId),
        this.config.network,
      );
      lucid.selectWallet.fromSeed(this.config.walletSeed);
      const address = await lucid.wallet().address();
      this.wallet = { address, lucid };
      this.logger.info({ address: address.slice(0, 30) + '…' }, 'LP wallet initialized');
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize LP wallet');
      this.running = false;
      return;
    }

    // Run bot loop (non-blocking)
    this.loop().catch((err) => {
      this.logger.error({ err }, 'Liquidity bot loop crashed');
    });
  }

  stop(): void {
    this.running = false;
    this.logger.info('Liquidity bot service stopped');
  }

  private async loop(): Promise<void> {
    let round = 0;
    while (this.running) {
      round++;
      try {
        await this.executeRound(round);
      } catch (err) {
        this.logger.error({ round, err }, 'LP round failed');
      }

      const waitMs = randomBetween(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
      this.logger.info({ nextInMinutes: Math.round(waitMs / 60000) }, 'Next LP action scheduled');

      const deadline = Date.now() + waitMs;
      while (this.running && Date.now() < deadline) {
        await sleep(Math.min(5000, deadline - Date.now()));
      }
    }
  }

  private async executeRound(round: number): Promise<void> {
    if (!this.wallet) return;

    this.logger.info({ round }, 'LP bot round starting');

    // Check ADA balance
    const utxos = await this.wallet.lucid.wallet().getUtxos();
    const bal = aggregateBalances(utxos);
    const ada = bal['lovelace'] ?? 0n;
    if (ada < MIN_ADA_BALANCE) {
      this.logger.info(
        { adaBalance: Number(ada) / 1e6 },
        'Insufficient ADA — pausing',
      );
      return;
    }

    // Get active pools
    const pools = await this.apiGet<{ data: PoolInfo[] }>('/pools');
    const activePools = pools.data.filter((p) => p.state === 'ACTIVE');
    if (activePools.length === 0) {
      this.logger.info('No active pools — skipping round');
      return;
    }

    // Pick random pool
    const pool = activePools[randomBetween(0, activePools.length - 1)];
    const tickerA = pool.assetA.ticker ?? 'A';
    const tickerB = pool.assetB.ticker ?? 'B';

    // Decide: deposit or withdraw
    const shouldDeposit = Math.random() < DEPOSIT_PROBABILITY;
    if (shouldDeposit) {
      await this.doDeposit(pool, bal, tickerA, tickerB);
    } else {
      await this.doWithdraw(pool, bal, tickerA, tickerB);
    }
  }

  private async doDeposit(
    pool: PoolInfo,
    bal: Record<string, bigint>,
    tickerA: string,
    tickerB: string,
  ): Promise<void> {
    if (!this.wallet) return;

    const reserveA = BigInt(pool.reserveA);
    const reserveB = BigInt(pool.reserveB);
    const pct = randomBetween(DEPOSIT_PERCENT_MIN, DEPOSIT_PERCENT_MAX);
    let depositA = (reserveA * BigInt(pct)) / 100n;
    let depositB = (reserveB * BigInt(pct)) / 100n;
    if (depositA <= 0n || depositB <= 0n) return;

    const unitA = pool.assetA.policyId ? `${pool.assetA.policyId}${pool.assetA.assetName}` : 'lovelace';
    const unitB = pool.assetB.policyId ? `${pool.assetB.policyId}${pool.assetB.assetName}` : 'lovelace';
    const balA = bal[unitA] ?? 0n;
    const balB = bal[unitB] ?? 0n;

    if (balA < depositA) {
      depositA = balA / 2n;
      depositB = reserveA > 0n ? (depositA * reserveB) / reserveA : 0n;
    }
    if (balB < depositB) {
      depositB = balB / 2n;
      depositA = reserveB > 0n ? (depositB * reserveA) / reserveB : 0n;
    }
    if (depositA <= 0n || depositB <= 0n) {
      this.logger.info('Insufficient token balance for deposit — skipping');
      return;
    }

    this.logger.info(
      { depositA: depositA.toString(), depositB: depositB.toString(), tickerA, tickerB, pct },
      'Depositing liquidity',
    );

    try {
      const res = await this.apiPost<{ unsignedTx: string }>(`/pools/${pool.poolId}/deposit`, {
        senderAddress: this.wallet.address,
        changeAddress: this.wallet.address,
        amountA: depositA.toString(),
        amountB: depositB.toString(),
        minLpTokens: '0',
      });

      await this.signSubmitAwait(res.unsignedTx, 'deposit');
      this.logger.info('Deposit completed');
    } catch (err) {
      this.logger.error({ err }, 'Deposit failed');
    }
  }

  private async doWithdraw(
    pool: PoolInfo,
    bal: Record<string, bigint>,
    tickerA: string,
    tickerB: string,
  ): Promise<void> {
    if (!this.wallet) return;

    const lpPolicyId = pool.lpPolicyId;
    if (!lpPolicyId) {
      this.logger.info('No lpPolicyId — switching to deposit');
      await this.doDeposit(pool, bal, tickerA, tickerB);
      return;
    }

    // Find LP balance
    let lpBalance = 0n;
    const poolNftAssetName = pool.poolNftAssetName ?? '';
    if (poolNftAssetName) {
      lpBalance = bal[`${lpPolicyId}${poolNftAssetName}`] ?? 0n;
    }
    if (lpBalance === 0n) {
      for (const [unit, qty] of Object.entries(bal)) {
        if (unit.startsWith(lpPolicyId) && qty > 0n) {
          lpBalance = qty;
          break;
        }
      }
    }

    if (lpBalance <= 0n) {
      this.logger.info('No LP tokens — switching to deposit');
      await this.doDeposit(pool, bal, tickerA, tickerB);
      return;
    }

    const pct = randomBetween(WITHDRAW_PERCENT_MIN, WITHDRAW_PERCENT_MAX);
    const lpToWithdraw = (lpBalance * BigInt(pct)) / 100n;
    if (lpToWithdraw <= 0n) return;

    this.logger.info(
      { lpToWithdraw: lpToWithdraw.toString(), pct, tickerA, tickerB },
      'Withdrawing liquidity',
    );

    try {
      const res = await this.apiPost<{ unsignedTx: string }>(`/pools/${pool.poolId}/withdraw`, {
        senderAddress: this.wallet.address,
        changeAddress: this.wallet.address,
        lpTokenAmount: lpToWithdraw.toString(),
        minAmountA: '0',
        minAmountB: '0',
      });

      await this.signSubmitAwait(res.unsignedTx, 'withdraw');
      this.logger.info('Withdrawal completed');
    } catch (err) {
      this.logger.error({ err }, 'Withdrawal failed');
    }
  }

  private async signSubmitAwait(unsignedTx: string, label: string): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not initialized');

    const signed = await this.wallet.lucid.fromTx(unsignedTx).sign.withWallet().complete();
    const result = await this.apiPost<{ txHash: string; status: string; error?: string }>(
      '/tx/submit',
      { signedTx: signed.toCBOR() },
    );
    if (result.status !== 'accepted') {
      throw new Error(`TX rejected: ${result.error ?? 'unknown'}`);
    }

    this.logger.info({ label, txHash: result.txHash.slice(0, 16) }, 'TX submitted');

    try {
      const ok = await this.wallet.lucid.awaitTx(result.txHash, 90_000);
      if (ok) {
        this.logger.info({ label }, 'TX confirmed on-chain');
      }
    } catch {
      this.logger.warn({ label }, 'awaitTx error — continuing');
    }

    await sleep(10_000);
    return result.txHash;
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

// ─── Utility ────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
