/**
 * Intent Collector
 * Queries the blockchain for active escrow UTxOs and parses their datums.
 * Uses Blockfrost as the chain data provider.
 */
import { getLogger } from '../config/logger.js';
import { BlockfrostClient } from '../infrastructure/cardano/BlockfrostClient.js';
import type { UTxO } from '../domain/ports/IChainProvider.js';

export interface EscrowIntent {
  utxoRef: { txHash: string; outputIndex: number };
  owner: string;
  inputAsset: string;
  inputAmount: bigint;
  outputAsset: string;
  minOutput: bigint;
  deadline: bigint;
  remainingInput: bigint;
}

export class IntentCollector {
  private readonly logger;
  private processingSet = new Set<string>(); // txHash#index

  constructor(
    private readonly blockfrost: BlockfrostClient,
    private readonly escrowAddress: string,
  ) {
    this.logger = getLogger().child({ service: 'intent-collector' });
  }

  /** Collect all active, unexpired escrow intents from chain */
  async getActiveIntents(): Promise<EscrowIntent[]> {
    const utxos = await this.blockfrost.getUtxos(this.escrowAddress);

    const intents: EscrowIntent[] = [];
    const now = BigInt(Date.now());

    for (const utxo of utxos) {
      const key = `${utxo.txHash}#${utxo.outputIndex}`;

      // Skip if already being processed in current batch
      if (this.processingSet.has(key)) continue;

      const intent = await this.parseEscrowDatum(utxo);
      if (!intent) continue;

      // Skip expired intents
      if (intent.deadline <= now) {
        this.logger.debug({ key, deadline: intent.deadline.toString() }, 'Skipping expired intent');
        continue;
      }

      intents.push(intent);
    }

    this.logger.info({ count: intents.length, total: utxos.length }, 'Collected active intents');
    return intents;
  }

  /** Mark intents as being processed (prevents double-processing) */
  markProcessing(refs: Array<{ txHash: string; outputIndex: number }>): void {
    for (const ref of refs) {
      this.processingSet.add(`${ref.txHash}#${ref.outputIndex}`);
    }
  }

  /** Clear processing marks after batch completes */
  clearProcessing(refs: Array<{ txHash: string; outputIndex: number }>): void {
    for (const ref of refs) {
      this.processingSet.delete(`${ref.txHash}#${ref.outputIndex}`);
    }
  }

  /** Clear all processing marks */
  clearAll(): void {
    this.processingSet.clear();
  }

  /** Parse escrow datum from UTxO */
  private async parseEscrowDatum(utxo: UTxO): Promise<EscrowIntent | null> {
    try {
      // In production, we decode the CBOR datum using Lucid's Data.from()
      // For now, we construct a minimal intent from the UTxO value
      if (!utxo.datumHash && !utxo.datum) {
        return null;
      }

      // Fetch the full datum if only hash is available
      let datumCbor = utxo.datum;
      if (!datumCbor && utxo.datumHash) {
        datumCbor = (await this.blockfrost.getDatum(utxo.datumHash)) ?? undefined;
      }

      if (!datumCbor) return null;

      // TODO: Decode CBOR datum into EscrowDatum structure
      // This requires the specific Aiken datum schema from the smart contract
      // const escrowDatum = Data.from(datumCbor, EscrowDatum);

      // Placeholder — in production, parse from datum:
      return null;
    } catch (err) {
      this.logger.error(
        { err, txHash: utxo.txHash, outputIndex: utxo.outputIndex },
        'Failed to parse escrow datum',
      );
      return null;
    }
  }
}
