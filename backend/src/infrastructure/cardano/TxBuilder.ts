/**
 * Transaction Builder — Lucid Evolution implementation
 * Constructs unsigned Cardano transactions for all protocol operations.
 *
 * Stack: Blockfrost as provider (replaces self-hosted Ogmios+Kupo).
 *
 * NOTE: This is a structural placeholder. Full Lucid Evolution integration
 * requires the actual validator script references deployed on-chain.
 * The TX building logic will be completed after reference script deployment.
 */
import type {
  ITxBuilder,
  SwapTxParams,
  DepositTxParams,
  WithdrawTxParams,
  CreatePoolTxParams,
  CancelIntentTxParams,
  SettlementTxParams,
  BuildTxResult,
} from '../../domain/ports/ITxBuilder.js';
import { getLogger } from '../../config/logger.js';
import { ChainError } from '../../domain/errors/index.js';

/**
 * Placeholder TX builder.
 * In production, this integrates with @lucid-evolution/lucid using BlockfrostProvider:
 *
 *   import { Lucid, Blockfrost } from "@lucid-evolution/lucid";
 *   const lucid = await Lucid(
 *     new Blockfrost(blockfrostUrl, blockfrostProjectId),
 *     "Preprod"
 *   );
 */
export class TxBuilder implements ITxBuilder {
  private readonly logger;

  constructor(
    private readonly _networkId: 'preprod' | 'preview' | 'mainnet',
    private readonly _blockfrostUrl: string,
    private readonly _blockfrostProjectId: string,
  ) {
    this.logger = getLogger().child({ service: 'tx-builder' });
  }

  async buildCreateIntentTx(params: SwapTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { sender: params.senderAddress, input: params.inputAmount.toString() },
      'Building create intent TX',
    );

    // TODO: Integrate with Lucid Evolution
    // 1. Create Lucid instance with Ogmios+Kupo provider
    // 2. Select user UTxOs
    // 3. Build escrow output with inline datum (EscrowDatum)
    // 4. Mint intent token
    // 5. Set validity interval for deadline
    // 6. Balance TX and return unsigned CBOR

    throw new ChainError(
      'TX builder not yet connected to chain. Deploy reference scripts first.',
    );
  }

  async buildCancelIntentTx(params: CancelIntentTxParams): Promise<BuildTxResult> {
    this.logger.info({ intentId: params.intentId }, 'Building cancel intent TX');
    throw new ChainError(
      'TX builder not yet connected to chain. Deploy reference scripts first.',
    );
  }

  async buildCreatePoolTx(params: CreatePoolTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { assetA: params.assetAId, assetB: params.assetBId },
      'Building create pool TX',
    );
    throw new ChainError(
      'TX builder not yet connected to chain. Deploy reference scripts first.',
    );
  }

  async buildDepositTx(params: DepositTxParams): Promise<BuildTxResult> {
    this.logger.info({ poolId: params.poolId }, 'Building deposit TX');
    throw new ChainError(
      'TX builder not yet connected to chain. Deploy reference scripts first.',
    );
  }

  async buildWithdrawTx(params: WithdrawTxParams): Promise<BuildTxResult> {
    this.logger.info({ poolId: params.poolId }, 'Building withdraw TX');
    throw new ChainError(
      'TX builder not yet connected to chain. Deploy reference scripts first.',
    );
  }

  async buildSettlementTx(params: SettlementTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { intentCount: params.intentUtxoRefs.length },
      'Building settlement TX',
    );
    throw new ChainError(
      'TX builder not yet connected to chain. Deploy reference scripts first.',
    );
  }
}
