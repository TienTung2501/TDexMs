/**
 * Intent Collector
 * Queries the blockchain for active escrow UTxOs and parses their datums.
 * Uses Blockfrost as the chain data provider.
 */
import { Data, Constr } from '@lucid-evolution/lucid';
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

/**
 * Extract a Plutus Address credential hash from Constr data.
 * Address = Constr(0, [credential, stakeCredential])
 * credential = Constr(0, [hash]) for PubKey | Constr(1, [hash]) for Script
 * Returns the hex hash string.
 */
function extractCredentialHash(addrConstr: Constr<Data>): string {
  if (addrConstr.index !== 0 || addrConstr.fields.length < 1) return '';
  const cred = addrConstr.fields[0] as Constr<Data>;
  if (!cred || cred.fields.length < 1) return '';
  return cred.fields[0] as string;
}

/**
 * Decode AssetClass Constr(0, [policyId, assetName]) → "policyId.assetName" string.
 * ADA is represented as empty policy + empty name → returns "".
 */
function decodeAssetClass(ac: Constr<Data>): string {
  const policyId = ac.fields[0] as string;
  const assetName = ac.fields[1] as string;
  if (!policyId && !assetName) return '';
  return `${policyId}.${assetName}`;
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

      // Skip expired intents (deadline already passed)
      if (intent.deadline <= now) {
        this.logger.debug({ key, deadline: intent.deadline.toString(), now: now.toString() }, 'Skipping expired intent');
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

  /**
   * Parse escrow datum from UTxO inline datum CBOR.
   *
   * EscrowDatum = Constr(0, [
   *   escrow_token: AssetClass,       // [0] Constr(0, [policyId, assetName])
   *   owner: Address,                 // [1] Constr(0, [cred, stakeCred])
   *   input_asset: AssetClass,        // [2]
   *   input_amount: Int,              // [3]
   *   output_asset: AssetClass,       // [4]
   *   min_output: Int,                // [5]
   *   deadline: Int,                  // [6]
   *   max_partial_fills: Int,         // [7]
   *   fill_count: Int,               // [8]
   *   remaining_input: Int,          // [9]
   * ])
   */
  private async parseEscrowDatum(utxo: UTxO): Promise<EscrowIntent | null> {
    try {
      if (!utxo.datumHash && !utxo.datum) {
        return null;
      }

      // Fetch the full datum if only hash is available
      let datumCbor = utxo.datum;
      if (!datumCbor && utxo.datumHash) {
        datumCbor = (await this.blockfrost.getDatum(utxo.datumHash)) ?? undefined;
      }

      if (!datumCbor) return null;

      // Decode CBOR into Plutus Data structure
      const decoded = Data.from(datumCbor);

      // Validate it's a Constr with index 0 and 10 fields
      if (!(decoded instanceof Constr)) {
        this.logger.warn(
          { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
          'Datum is not a Constr — skipping',
        );
        return null;
      }

      const constr = decoded as Constr<Data>;
      if (constr.index !== 0 || constr.fields.length < 10) {
        this.logger.warn(
          { txHash: utxo.txHash, index: constr.index, fields: constr.fields.length },
          'Unexpected EscrowDatum shape',
        );
        return null;
      }

      const ownerHash = extractCredentialHash(constr.fields[1] as Constr<Data>);
      const inputAsset = decodeAssetClass(constr.fields[2] as Constr<Data>);
      const inputAmount = constr.fields[3] as bigint;
      const outputAsset = decodeAssetClass(constr.fields[4] as Constr<Data>);
      const minOutput = constr.fields[5] as bigint;
      const deadline = constr.fields[6] as bigint;
      const remainingInput = constr.fields[9] as bigint;

      return {
        utxoRef: { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
        owner: ownerHash,
        inputAsset,
        inputAmount,
        outputAsset,
        minOutput,
        deadline,
        remainingInput,
      };
    } catch (err) {
      this.logger.error(
        { err, txHash: utxo.txHash, outputIndex: utxo.outputIndex },
        'Failed to parse escrow datum',
      );
      return null;
    }
  }
}
