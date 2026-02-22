/**
 * FaucetBot — Cardano Testnet Faucet Auto-Drip
 *
 * Automatically requests test ADA from the Cardano preprod/preview faucet
 * every 24 hours and sends it to the configured target address.
 *
 * Supported networks: preprod, preview
 * Faucet API: GET https://faucet.{network}.world.dev.cardano.org/send-money/{address}?apiKey={key}
 *
 * Configuration (environment variables):
 *   FAUCET_TARGET_ADDRESS  — Bech32 address to receive test ADA (falls back to SOLVER_ADDRESS)
 *   FAUCET_API_KEY         — API key for the faucet (optional; faucet rejects if required and missing)
 *   CARDANO_NETWORK        — "preprod" | "preview" | "mainnet"  (mainnet skips faucet)
 */
import { getLogger } from '../../config/logger.js';

const FAUCET_BASE: Record<string, string> = {
  preprod: 'https://faucet.preprod.world.dev.cardano.org',
  preview: 'https://faucet.preview.world.dev.cardano.org',
};

export interface FaucetBotConfig {
  targetAddress: string;
  network: string;
  apiKey?: string;
  /** Interval in milliseconds between faucet requests (default: 24 hours) */
  intervalMs?: number;
}

export class FaucetBot {
  private readonly logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;
  private lastRequestAt: Date | null = null;
  private totalRequested = 0;

  constructor(private readonly config: FaucetBotConfig) {
    this.logger = getLogger().child({ service: 'faucet-bot' });
    this.intervalMs = config.intervalMs ?? 24 * 60 * 60 * 1000; // 24h default
  }

  start(): void {
    if (this.running) return;

    if (this.config.network === 'mainnet') {
      this.logger.warn('FaucetBot disabled on mainnet — test faucet does not exist for mainnet');
      return;
    }

    const baseUrl = FAUCET_BASE[this.config.network];
    if (!baseUrl) {
      this.logger.warn(
        { network: this.config.network },
        'Unknown network for faucet — bot not started',
      );
      return;
    }

    if (!this.config.targetAddress) {
      this.logger.warn('No FAUCET_TARGET_ADDRESS configured — faucet bot not started');
      return;
    }

    this.running = true;
    this.logger.info(
      {
        targetAddress: this.config.targetAddress,
        network: this.config.network,
        intervalHours: this.intervalMs / 3_600_000,
      },
      'FaucetBot started',
    );

    // Request once on startup, then every intervalMs
    this.tick().catch((err) => this.logger.error({ err }, 'Initial faucet tick failed'));

    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error({ err }, 'Faucet tick failed'));
    }, this.intervalMs);

    if (this.timer.unref) this.timer.unref(); // Don't block process exit
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info({ totalRequested: this.totalRequested }, 'FaucetBot stopped');
  }

  get status() {
    return {
      running: this.running,
      network: this.config.network,
      targetAddress: this.config.targetAddress,
      lastRequestAt: this.lastRequestAt?.toISOString() ?? null,
      totalRequested: this.totalRequested,
      intervalMs: this.intervalMs,
    };
  }

  private async tick(): Promise<void> {
    const baseUrl = FAUCET_BASE[this.config.network];
    if (!baseUrl) return;

    const url = new URL(`${baseUrl}/send-money/${encodeURIComponent(this.config.targetAddress)}`);
    if (this.config.apiKey) {
      url.searchParams.set('apiKey', this.config.apiKey);
    }

    this.logger.info(
      { address: this.config.targetAddress, network: this.config.network },
      'Requesting test ADA from faucet…',
    );

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        this.lastRequestAt = new Date();
        this.totalRequested += 1;
        this.logger.info(
          { status: res.status, body, address: this.config.targetAddress },
          '✅ Faucet request successful',
        );
      } else {
        // Faucet returns 429 when rate-limited (within 24h window)
        const isRateLimited = res.status === 429;
        this.logger.warn(
          { status: res.status, body, isRateLimited },
          isRateLimited
            ? '⏳ Faucet rate-limited — will retry in 24h'
            : '⚠️  Faucet request failed',
        );
      }
    } catch (err) {
      this.logger.error({ err }, 'Faucet HTTP request threw an error');
    }
  }
}
