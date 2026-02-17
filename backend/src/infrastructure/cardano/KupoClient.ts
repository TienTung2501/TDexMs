/**
 * Kupo HTTP Client
 * Queries UTxO state from Kupo indexer.
 */
import { getLogger } from '../../config/logger.js';
import type { UTxO } from '../../domain/ports/IChainProvider.js';

export interface KupoMatch {
  transaction_id: string;
  output_index: number;
  address: string;
  value: {
    coins: number;
    assets?: Record<string, number>;
  };
  datum_hash?: string;
  datum_type?: string;
  script_hash?: string;
  created_at: {
    slot_no: number;
    header_hash: string;
  };
  spent_at?: {
    slot_no: number;
    header_hash: string;
  };
}

export class KupoClient {
  private readonly baseUrl: string;
  private readonly logger;

  constructor(kupoUrl: string) {
    this.baseUrl = kupoUrl.replace(/\/$/, '');
    this.logger = getLogger().child({ service: 'kupo' });
  }

  /** Get all unspent UTxOs at an address */
  async getUtxosByAddress(address: string): Promise<UTxO[]> {
    const url = `${this.baseUrl}/matches/${address}?unspent`;
    return this.fetchMatches(url);
  }

  /** Get unspent UTxOs matching a specific policy ID pattern */
  async getUtxosByPolicy(policyId: string): Promise<UTxO[]> {
    const url = `${this.baseUrl}/matches/${policyId}.*?unspent`;
    return this.fetchMatches(url);
  }

  /** Get a specific UTxO by tx hash and output index */
  async getUtxo(txHash: string, outputIndex: number): Promise<UTxO | null> {
    const url = `${this.baseUrl}/matches/*?unspent&transaction_id=${txHash}`;
    const utxos = await this.fetchMatches(url);
    return utxos.find((u) => u.outputIndex === outputIndex) ?? null;
  }

  /** Check if a UTxO has been spent */
  async isSpent(txHash: string, outputIndex: number): Promise<boolean> {
    const url = `${this.baseUrl}/matches/*?spent&transaction_id=${txHash}`;
    const matches = await this.fetchRaw(url);
    return matches.some(
      (m: KupoMatch) => m.output_index === outputIndex && m.spent_at != null,
    );
  }

  /** Get datum by datum hash */
  async getDatum(datumHash: string): Promise<string | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/datums/${datumHash}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return (data as { datum: string }).datum ?? null;
    } catch (err) {
      this.logger.error({ err, datumHash }, 'Failed to fetch datum');
      return null;
    }
  }

  /** Get Kupo health/tip */
  async getHealth(): Promise<{ tip: { slot_no: number; header_hash: string } } | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`);
      if (!resp.ok) return null;
      return (await resp.json()) as { tip: { slot_no: number; header_hash: string } };
    } catch {
      return null;
    }
  }

  private async fetchMatches(url: string): Promise<UTxO[]> {
    const matches = await this.fetchRaw(url);
    return matches.map(this.toUtxo);
  }

  private async fetchRaw(url: string): Promise<KupoMatch[]> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        this.logger.error({ status: resp.status, url }, 'Kupo request failed');
        return [];
      }
      return (await resp.json()) as KupoMatch[];
    } catch (err) {
      this.logger.error({ err, url }, 'Kupo fetch error');
      return [];
    }
  }

  private toUtxo(match: KupoMatch): UTxO {
    const value: Record<string, bigint> = {
      lovelace: BigInt(match.value.coins),
    };
    if (match.value.assets) {
      for (const [assetId, qty] of Object.entries(match.value.assets)) {
        value[assetId] = BigInt(qty);
      }
    }

    return {
      txHash: match.transaction_id,
      outputIndex: match.output_index,
      address: match.address,
      value,
      datumHash: match.datum_hash,
    };
  }
}
