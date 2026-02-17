/**
 * Chain Provider — Blockfrost-based implementation
 * Replaces the old Ogmios+Kupo composite. Uses a single Blockfrost client.
 */
import type {
  IChainProvider,
  UTxO,
  ChainTip,
  SubmitResult,
} from '../../domain/ports/IChainProvider.js';
import { BlockfrostClient } from './BlockfrostClient.js';
import { getLogger } from '../../config/logger.js';

export class ChainProvider implements IChainProvider {
  private readonly logger;

  constructor(private readonly blockfrost: BlockfrostClient) {
    this.logger = getLogger().child({ service: 'chain-provider' });
  }

  async getUtxos(address: string): Promise<UTxO[]> {
    return this.blockfrost.getUtxos(address);
  }

  async getUtxosByAsset(address: string, policyId: string, assetName: string): Promise<UTxO[]> {
    return this.blockfrost.getUtxosByAsset(address, policyId, assetName);
  }

  async getChainTip(): Promise<ChainTip> {
    return this.blockfrost.getChainTip();
  }

  async submitTx(signedTx: string): Promise<SubmitResult> {
    const result = await this.blockfrost.submitTx(signedTx);
    if (result.accepted) {
      this.logger.info({ txHash: result.txHash }, 'Transaction submitted');
    } else {
      this.logger.warn({ error: result.error }, 'Transaction rejected');
    }
    return result;
  }

  async awaitTx(txHash: string, maxWaitMs = 120_000): Promise<boolean> {
    return this.blockfrost.awaitTx(txHash, maxWaitMs);
  }

  async getProtocolParameters(): Promise<unknown> {
    return this.blockfrost.getProtocolParameters();
  }

  async isUtxoSpent(txHash: string, outputIndex: number): Promise<boolean> {
    return this.blockfrost.isUtxoSpent(txHash, outputIndex);
  }
}
