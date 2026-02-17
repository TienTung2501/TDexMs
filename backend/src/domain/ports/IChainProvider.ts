/**
 * Port: Chain Provider Interface
 * Abstraction over Cardano node interaction.
 */

export interface UTxO {
  txHash: string;
  outputIndex: number;
  address: string;
  value: Record<string, bigint>; // "lovelace" → amount, "policyId.assetName" → amount
  datum?: string;      // CBOR hex
  datumHash?: string;
  scriptRef?: string;
  inlineDatum?: unknown;
}

export interface ChainTip {
  slot: number;
  hash: string;
  block: number;
  epoch: number;
}

export interface SubmitResult {
  txHash: string;
  accepted: boolean;
  error?: string;
}

export interface IChainProvider {
  /** Get UTxOs at a given address */
  getUtxos(address: string): Promise<UTxO[]>;

  /** Get UTxOs at address containing a specific asset */
  getUtxosByAsset(address: string, policyId: string, assetName: string): Promise<UTxO[]>;

  /** Get current chain tip */
  getChainTip(): Promise<ChainTip>;

  /** Submit a signed transaction */
  submitTx(signedTx: string): Promise<SubmitResult>;

  /** Await transaction confirmation */
  awaitTx(txHash: string, maxWaitMs?: number): Promise<boolean>;

  /** Get protocol parameters */
  getProtocolParameters(): Promise<unknown>;

  /** Check if a UTxO has been spent */
  isUtxoSpent(txHash: string, outputIndex: number): Promise<boolean>;
}
