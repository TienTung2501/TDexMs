/**
 * TxSubmitter — Singleton TX submission queue with UTxO locking
 *
 * Prevents UTxO contention between the 3 independent bots (SolverEngine,
 * OrderExecutorCron, ReclaimKeeperCron) that share the same SOLVER_SEED_PHRASE.
 *
 * Without this queue, two bots could pick the same UTxO for collateral/fee,
 * causing one TX to fail with "UTxO already spent".
 *
 * Architecture:
 * - FIFO queue — TXs are submitted one at a time, serially
 * - After each submit, waits for on-chain confirmation (or timeout)
 * - On failure, releases the slot so next TX can proceed
 * - Shared singleton via TxSubmitter.getInstance()
 *
 * TODO (production):
 * - Redis-backed queue for multi-instance deployment
 * - UTxO reservation set to track which exact UTxOs are in-flight
 * - Retry with exponential backoff on transient failures
 */
import {
  type LucidEvolution,
} from '@lucid-evolution/lucid';
import { getLogger } from '../config/logger.js';

const logger = getLogger().child({ service: 'tx-submitter' });

export interface SignedTxPayload {
  /** Human-readable label for logging */
  label: string;
  /** Pre-signed TX ready to submit */
  signAndSubmit: () => Promise<string>;
  /** Optional: callback after confirmed */
  onConfirmed?: (txHash: string) => Promise<void>;
  /** Optional: callback on failure */
  onFailed?: (error: Error) => void;
}

interface QueueItem {
  payload: SignedTxPayload;
  resolve: (txHash: string) => void;
  reject: (error: Error) => void;
}

export class TxSubmitter {
  private static instance: TxSubmitter | null = null;
  private queue: QueueItem[] = [];
  private processing = false;
  private lucid: LucidEvolution | null = null;

  /** Confirmation timeout per TX (ms) */
  private readonly confirmTimeoutMs: number;
  /** Minimum delay between submissions to avoid mempool congestion */
  private readonly cooldownMs: number;

  private constructor(
    confirmTimeoutMs = 120_000,
    cooldownMs = 2_000,
  ) {
    this.confirmTimeoutMs = confirmTimeoutMs;
    this.cooldownMs = cooldownMs;
  }

  static getInstance(confirmTimeoutMs?: number, cooldownMs?: number): TxSubmitter {
    if (!TxSubmitter.instance) {
      TxSubmitter.instance = new TxSubmitter(confirmTimeoutMs, cooldownMs);
    }
    return TxSubmitter.instance;
  }

  /** Inject the Lucid instance for awaitTx */
  setLucid(lucid: LucidEvolution): void {
    this.lucid = lucid;
  }

  /**
   * Enqueue a TX for serial submission.
   * Returns a promise that resolves with the confirmed txHash.
   */
  submit(payload: SignedTxPayload): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      logger.info(
        { label: payload.label, queueLength: this.queue.length },
        'TX enqueued',
      );
      this.processNext();
    });
  }

  /** Get current queue depth */
  get queueDepth(): number {
    return this.queue.length;
  }

  /** Check if currently processing */
  get isProcessing(): boolean {
    return this.processing;
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift()!;
    const { payload, resolve, reject } = item;

    try {
      logger.info({ label: payload.label }, 'Submitting TX');

      // Sign and submit
      const txHash = await payload.signAndSubmit();
      logger.info({ label: payload.label, txHash }, 'TX submitted — awaiting confirmation');

      // Wait for on-chain confirmation
      if (this.lucid) {
        const confirmed = await this.lucid.awaitTx(txHash, this.confirmTimeoutMs);
        if (!confirmed) {
          throw new Error(`TX ${txHash} not confirmed within ${this.confirmTimeoutMs}ms`);
        }
        logger.info({ label: payload.label, txHash }, 'TX confirmed on-chain');
      } else {
        logger.warn({ label: payload.label, txHash }, 'No Lucid instance — skipping awaitTx');
      }

      // Run post-confirmation callback
      if (payload.onConfirmed) {
        try {
          await payload.onConfirmed(txHash);
        } catch (err) {
          logger.error(
            { label: payload.label, txHash, error: String(err) },
            'Post-confirmation callback failed (TX is confirmed — DB may be inconsistent)',
          );
        }
      }

      resolve(txHash);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(
        { label: payload.label, error: err.message },
        'TX submission/confirmation failed',
      );

      if (payload.onFailed) {
        try {
          payload.onFailed(err);
        } catch (_) {
          // Suppress callback errors
        }
      }

      reject(err);
    } finally {
      this.processing = false;

      // Cooldown before next TX
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), this.cooldownMs);
      }
    }
  }

  /** Reset singleton — useful for tests */
  static reset(): void {
    TxSubmitter.instance = null;
  }
}
