/**
 * Transaction Builder Lucid Evolution implementation
 * Constructs unsigned Cardano transactions for all protocol operations.
 *
 * Uses @lucid-evolution/lucid v0.4 with Blockfrost provider on Preprod.
 * Reads compiled validators from smartcontract/plutus.json (Aiken CIP-57 blueprint).
 *
 * Flow: Backend builds unsigned TX â†’ returns CBOR hex â†’ frontend signs via CIP-30.
 */
import {
  Lucid,
  Blockfrost,
  Data,
  Constr,
  toUnit,
  getAddressDetails,
  credentialToAddress,
  validatorToAddress,
  validatorToScriptHash,
  mintingPolicyToId,
  datumToHash,
  applyParamsToScript,
  applyDoubleCborEncoding,
  type LucidEvolution,
  type Script,
  type Network,
  type Assets,
  type UTxO as LucidUTxO,
  type Credential,
} from '@lucid-evolution/lucid';
import type {
  ITxBuilder,
  SwapTxParams,
  DepositTxParams,
  WithdrawTxParams,
  CreatePoolTxParams,
  CancelIntentTxParams,
  SettlementTxParams,
  OrderTxParams,
  CancelOrderTxParams,
  ReclaimTxParams,
  CollectFeesTxParams,
  UpdateSettingsTxParams,
  UpdateFactoryAdminTxParams,
  BurnPoolNFTTxParams,
  ExecuteOrderTxParams,
  DeploySettingsTxParams,
  BuildTxResult,
} from '../../domain/ports/ITxBuilder.js';
import { getLogger } from '../../config/logger.js';
import { ChainError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// â”€â”€â”€ Plutus Blueprint Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface BlueprintValidator {
  title: string;
  compiledCode: string;
  hash: string;
}

interface PlutusBlueprint {
  preamble: { title: string; version: string };
  validators: BlueprintValidator[];
}

// â”€â”€â”€ Script Resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Resolves parameterized validators from the Aiken blueprint
// in DAG order (no circular dependencies).
//
// Resolution order:
// 1. escrow_validator (no params) â†’ escrow_hash
// 2. pool_validator(admin_vkh) â†’ pool_hash
// 3. intent_token_policy(escrow_hash) â†’ intent_policy_id
// 4. factory_validator(pool_hash) â†’ factory_hash
// 5. lp_token_policy(pool_hash, factory_hash) â†’ lp_id
// 6. pool_nft_policy(factory_hash, admin_vkh) â†’ nft_id
// 7. order_validator(intent_policy_id)
// 8. settings_validator(settings_nft) deferred

interface ResolvedScripts {
  // Escrow system
  escrowScript: Script;
  escrowAddr: string;
  escrowHash: string;
  intentPolicyScript: Script;
  intentPolicyId: string;
  // Pool system
  poolScript: Script;
  poolAddr: string;
  poolHash: string;
  factoryScript: Script;
  factoryAddr: string;
  factoryHash: string;
  lpScript: Script;
  lpPolicyId: string;
  poolNftScript: Script;
  poolNftPolicyId: string;
  // Order system
  orderScript: Script;
  orderAddr: string;
}

function resolveScripts(
  bp: PlutusBlueprint,
  network: Network,
  adminVkh: string,
): ResolvedScripts {
  // Step 1: escrow_validator NO parameters
  const escrowBp = findValidator(bp, 'escrow_validator.escrow_validator');
  const escrowScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(escrowBp.compiledCode),
  };
  const escrowAddr = validatorToAddress(network, escrowScript);
  const escrowHash = validatorToScriptHash(escrowScript);

  // Step 2: pool_validator(admin_vkh:VerificationKeyHash)
  const poolBp = findValidator(bp, 'pool_validator.pool_validator');
  const poolApplied = applyParamsToScript(poolBp.compiledCode, [adminVkh]);
  const poolScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(poolApplied),
  };
  const poolAddr = validatorToAddress(network, poolScript);
  const poolHash = validatorToScriptHash(poolScript);

  // Step 3: intent_token_policy NO parameters (standalone one-shot policy)
  const intentBp = findValidator(bp, 'intent_token_policy.intent_token_policy');
  const intentPolicyScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(intentBp.compiledCode),
  };
  const intentPolicyId = mintingPolicyToId(intentPolicyScript);

  // Step 4: factory_validator(pool_validator_hash:ScriptHash)
  const factoryBp = findValidator(bp, 'factory_validator.factory_validator');
  const factoryApplied = applyParamsToScript(factoryBp.compiledCode, [poolHash]);
  const factoryScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(factoryApplied),
  };
  const factoryAddr = validatorToAddress(network, factoryScript);
  const factoryHash = validatorToScriptHash(factoryScript);

  // Step 5: lp_token_policy(pool_validator_hash, factory_validator_hash)
  const lpBp = findValidator(bp, 'lp_token_policy.lp_token_policy');
  const lpApplied = applyParamsToScript(lpBp.compiledCode, [poolHash, factoryHash]);
  const lpScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(lpApplied),
  };
  const lpPolicyId = mintingPolicyToId(lpScript);

  // Step 6: pool_nft_policy(factory_validator_hash, admin_vkh)
  const nftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
  const nftApplied = applyParamsToScript(nftBp.compiledCode, [factoryHash, adminVkh]);
  const poolNftScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(nftApplied),
  };
  const poolNftPolicyId = mintingPolicyToId(poolNftScript);

  // Step 7: order_validator(intent_token_policy_id:PolicyId)
  const orderBp = findValidator(bp, 'order_validator.order_validator');
  const orderApplied = applyParamsToScript(orderBp.compiledCode, [intentPolicyId]);
  const orderScript: Script = {
    type: 'PlutusV3',
    script: applyDoubleCborEncoding(orderApplied),
  };
  const orderAddr = validatorToAddress(network, orderScript);

  return {
    escrowScript, escrowAddr, escrowHash,
    intentPolicyScript, intentPolicyId,
    poolScript, poolAddr, poolHash,
    factoryScript, factoryAddr, factoryHash,
    lpScript, lpPolicyId,
    poolNftScript, poolNftPolicyId,
    orderScript, orderAddr,
  };
}

// â”€â”€â”€ Datum / Redeemer helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// These mirror Aiken types from lib/solvernet/types.ak

/** AssetClass { policy_id, asset_name } Constr(0, [bytes, bytes]) */
function mkAssetClass(policyId: string, assetName: string): Constr<Data> {
  return new Constr(0, [policyId, assetName]);
}

/** Convert Address bech32 â†’ Plutus Address data (payment cred, optional stake cred) */
function addressToPlutusData(addr: string): Constr<Data> {
  const details = getAddressDetails(addr);
  const paymentCred = details.paymentCredential!;
  const credConstr =
    paymentCred.type === 'Key'
      ? new Constr(0, [paymentCred.hash])
      : new Constr(1, [paymentCred.hash]);

  const stakePart = details.stakeCredential
    ? new Constr(0, [
        new Constr(0, [
          details.stakeCredential.type === 'Key'
            ? new Constr(0, [details.stakeCredential.hash])
            : new Constr(1, [details.stakeCredential.hash]),
        ]),
      ])
    : new Constr(1, []); // None

  return new Constr(0, [credConstr, stakePart]);
}

/**
 * Reverse of addressToPlutusData: convert Plutus Address Constr back to bech32.
 * Plutus Address = Constr(0, [paymentCred, stakePart])
 *   paymentCred = Constr(0=Key|1=Script, [hash])
 *   stakePart   = Constr(0=Some, [Constr(0=Inline, [stakeCred])]) | Constr(1=None, [])
 *   stakeCred   = Constr(0=Key|1=Script, [hash])
 */
function plutusAddressToAddress(
  plutusAddr: Constr<Data>,
  network: Network,
): string {
  const paymentConstr = plutusAddr.fields[0] as Constr<Data>;
  const paymentCred: Credential = {
    type: paymentConstr.index === 0 ? 'Key' : 'Script',
    hash: paymentConstr.fields[0] as string,
  };

  const stakePart = plutusAddr.fields[1] as Constr<Data>;
  let stakeCred: Credential | undefined;
  if (stakePart.index === 0) {
    // Some → Constr(0, [Constr(0=Inline, [stakeCred])])
    const inlineWrapper = stakePart.fields[0] as Constr<Data>;
    const stakeConstr = inlineWrapper.fields[0] as Constr<Data>;
    stakeCred = {
      type: stakeConstr.index === 0 ? 'Key' : 'Script',
      hash: stakeConstr.fields[0] as string,
    };
  }

  return credentialToAddress(network, paymentCred, stakeCred);
}

/** Build EscrowDatum CBOR hex */
function buildEscrowDatumCbor(p: {
  escrowToken: Constr<Data>;
  owner: Constr<Data>;
  inputAsset: Constr<Data>;
  inputAmount: bigint;
  outputAsset: Constr<Data>;
  minOutput: bigint;
  deadline: bigint;
  maxPartialFills: bigint;
  fillCount: bigint;
  remainingInput: bigint;
}): string {
  return Data.to(
    new Constr(0, [
      p.escrowToken,
      p.owner,
      p.inputAsset,
      p.inputAmount,
      p.outputAsset,
      p.minOutput,
      p.deadline,
      p.maxPartialFills,
      p.fillCount,
      p.remainingInput,
    ]),
  );
}

/** EscrowRedeemer variants matching Aiken types */
const EscrowRedeemer = {
  Cancel: () => Data.to(new Constr(0, [])),
  Fill: (inputConsumed: bigint, outputDelivered: bigint) =>
    Data.to(new Constr(1, [inputConsumed, outputDelivered])),
  Reclaim: () => Data.to(new Constr(2, [])),
};

/** PoolRedeemer variants */
const PoolRedeemer = {
  Swap: (direction: 'AToB' | 'BToA', minOutput: bigint) =>
    Data.to(
      new Constr(0, [
        direction === 'AToB' ? new Constr(0, []) : new Constr(1, []),
        minOutput,
      ]),
    ),
  Deposit: (minLpTokens: bigint) => Data.to(new Constr(1, [minLpTokens])),
  Withdraw: (lpTokensBurned: bigint) => Data.to(new Constr(2, [lpTokensBurned])),
  CollectFees: () => Data.to(new Constr(3, [])),
  ClosePool: () => Data.to(new Constr(4, [])),
};

/** IntentTokenRedeemer matching Aiken types:
 *  MintIntentToken { consumed_utxo: OutputReference }
 *  BurnIntentToken
 */
const IntentTokenRedeemer = {
  Mint: (txHash: string, outputIndex: bigint) =>
    Data.to(
      new Constr(0, [new Constr(0, [txHash, outputIndex])]),
    ),
  Burn: () => Data.to(new Constr(1, [])),
};

/** PoolNFTRedeemer MintPoolNFT { consumed_utxo } | BurnPoolNFT */
const PoolNFTRedeemer = {
  Mint: (txHash: string, outputIndex: bigint) =>
    Data.to(
      new Constr(0, [new Constr(0, [txHash, outputIndex])]),
    ),
  Burn: () => Data.to(new Constr(1, [])),
};

/** OrderType enum: LimitOrder=0, DCA=1, StopLoss=2 */
function mkOrderType(t: 'LIMIT' | 'DCA' | 'STOP_LOSS'): Constr<Data> {
  switch (t) {
    case 'LIMIT': return new Constr(0, []);
    case 'DCA': return new Constr(1, []);
    case 'STOP_LOSS': return new Constr(2, []);
  }
}

/** Build OrderDatum CBOR hex */
function buildOrderDatumCbor(p: {
  orderType: Constr<Data>;
  owner: Constr<Data>;
  assetIn: Constr<Data>;
  assetOut: Constr<Data>;
  params: Constr<Data>;
  orderToken: Constr<Data>;
}): string {
  return Data.to(
    new Constr(0, [
      p.orderType,
      p.owner,
      p.assetIn,
      p.assetOut,
      p.params,
      p.orderToken,
    ]),
  );
}

/** Build OrderParams datum 7 flat fields matching Aiken OrderParams */
function mkOrderParams(p: {
  priceNum: bigint;
  priceDen: bigint;
  amountPerInterval: bigint;
  minInterval: bigint;
  lastFillSlot: bigint;
  remainingBudget: bigint;
  deadline: bigint;
}): Constr<Data> {
  return new Constr(0, [
    p.priceNum,
    p.priceDen,
    p.amountPerInterval,
    p.minInterval,
    p.lastFillSlot,
    p.remainingBudget,
    p.deadline,
  ]);
}

/** OrderRedeemer variants */
const OrderRedeemer = {
  CancelOrder: () => Data.to(new Constr(0, [])),
  ExecuteOrder: (inputConsumed: bigint, outputDelivered: bigint) =>
    Data.to(new Constr(1, [inputConsumed, outputDelivered])),
};

/** LPRedeemer = MintOrBurnLP { pool_nft: AssetClass, amount: Int } */
function mkLPRedeemer(
  poolNftPolicyId: string,
  poolNftAssetName: string,
  amount: bigint,
): string {
  return Data.to(
    new Constr(0, [mkAssetClass(poolNftPolicyId, poolNftAssetName), amount]),
  );
}

/** FactoryRedeemer = CreatePool { asset_a, asset_b, initial_a, initial_b, fee_numerator } */
function mkFactoryCreatePoolRedeemer(
  assetA: Constr<Data>,
  assetB: Constr<Data>,
  initialA: bigint,
  initialB: bigint,
  feeNumerator: bigint,
): string {
  return Data.to(
    new Constr(0, [assetA, assetB, initialA, initialB, feeNumerator]),
  );
}

// â”€â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Convert AssetId string to Lucid unit ("policyId" + "assetName" hex or "lovelace") */
function assetIdToUnit(assetIdStr: string): string {
  if (assetIdStr === 'lovelace') return 'lovelace';
  const aid = AssetId.fromString(assetIdStr);
  if (aid.isAda) return 'lovelace';
  return toUnit(aid.policyId, aid.assetName);
}

/** Load Plutus blueprint from smartcontract/plutus.json */
function loadBlueprint(): PlutusBlueprint {
  // Try multiple paths (monorepo dev, Docker)
  const candidates = [
    resolve(process.cwd(), '..', 'smartcontract', 'plutus.json'),
    resolve(process.cwd(), 'smartcontract', 'plutus.json'),
    resolve(process.cwd(), 'plutus.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      // try next
    }
  }
  throw new ChainError(
    'Cannot load plutus.json blueprint. Ensure smartcontract/plutus.json exists.',
  );
}

/** Find a validator in the blueprint by title prefix */
function findValidator(
  bp: PlutusBlueprint,
  titlePrefix: string,
): BlueprintValidator {
  // Exact match first
  const exact = bp.validators.find((v) => v.title === titlePrefix);
  if (exact) return exact;
  // Prefix match
  const prefix = bp.validators.find((v) => v.title.startsWith(titlePrefix));
  if (prefix) return prefix;
  throw new ChainError(`Validator "${titlePrefix}" not found in blueprint`);
}

/** Minimum ADA for script outputs (5 ADA is safe for datum-bearing outputs) */
const MIN_SCRIPT_LOVELACE = 2_000_000n;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TxBuilder
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export class TxBuilder implements ITxBuilder {
  private readonly logger;
  private lucidPromise: Promise<LucidEvolution> | null = null;
  private blueprint: PlutusBlueprint | null = null;
  private readonly network: Network;
  private readonly adminVkh: string;

  // Cached resolved scripts (parameterized)
  private resolved: ResolvedScripts | null = null;

  // Backward-compatible cached fields (used by getEscrowScripts)
  private escrowScript: Script | null = null;
  private escrowAddr: string | null = null;
  private intentPolicyScript: Script | null = null;
  private intentPolicyId: string | null = null;

  constructor(
    private readonly networkId: 'preprod' | 'preview' | 'mainnet',
    private readonly blockfrostUrl: string,
    private readonly blockfrostProjectId: string,
    adminVkh?: string,
  ) {
    this.logger = getLogger().child({ service: 'tx-builder' });
    this.network = networkId === 'mainnet' ? 'Mainnet' : 'Preprod';
    // If adminVkh not provided, use a placeholder (will be set properly during init)
    this.adminVkh = adminVkh || '';
  }

  // â”€â”€ Lazy init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async getLucid(): Promise<LucidEvolution> {
    if (!this.lucidPromise) {
      this.lucidPromise = Lucid(
        new Blockfrost(this.blockfrostUrl, this.blockfrostProjectId),
        this.network,
      );
    }
    return this.lucidPromise;
  }

  private getBlueprint(): PlutusBlueprint {
    if (!this.blueprint) {
      this.blueprint = loadBlueprint();
      this.logger.info(
        { validators: this.blueprint.validators.length },
        'Loaded Plutus blueprint',
      );
    }
    return this.blueprint;
  }

  /** Get all resolved (parameterized) scripts. Cached after first call. */
  private getResolved(): ResolvedScripts {
    if (!this.resolved) {
      const bp = this.getBlueprint();
      this.resolved = resolveScripts(bp, this.network, this.adminVkh);
      // Also populate backward-compatible fields
      this.escrowScript = this.resolved.escrowScript;
      this.escrowAddr = this.resolved.escrowAddr;
      this.intentPolicyScript = this.resolved.intentPolicyScript;
      this.intentPolicyId = this.resolved.intentPolicyId;
      this.logger.info(
        {
          escrowAddr: this.resolved.escrowAddr,
          poolAddr: this.resolved.poolAddr,
          factoryAddr: this.resolved.factoryAddr,
          intentPolicyId: this.resolved.intentPolicyId,
          lpPolicyId: this.resolved.lpPolicyId,
          poolNftPolicyId: this.resolved.poolNftPolicyId,
        },
        'Resolved parameterized scripts',
      );
    }
    return this.resolved;
  }

  /**
   * Resolve the settings_validator script, applying the settings_nft parameter
   * if SETTINGS_NFT_POLICY_ID is configured in env.
   * The Aiken settings_validator(settings_nft: AssetClass) is parameterized.
   */
  private resolveSettingsScript(settingsBp: BlueprintValidator): Script {
    const settingsNftPolicy = process.env.SETTINGS_NFT_POLICY_ID || '';
    const settingsNftName = process.env.SETTINGS_NFT_ASSET_NAME || '';

    if (settingsNftPolicy) {
      // Apply settings_nft parameter: AssetClass = Constr(0, [policy_id, asset_name])
      const applied = applyParamsToScript(settingsBp.compiledCode, [
        Data.to(mkAssetClass(settingsNftPolicy, settingsNftName)),
      ]);
      return {
        type: 'PlutusV3' as const,
        script: applyDoubleCborEncoding(applied),
      };
    }

    // Fallback: no settings NFT configured (development mode)
    this.logger.warn(
      'SETTINGS_NFT_POLICY_ID not set — using un-parameterized settings validator. ' +
      'This will NOT work on-chain for updates. Set SETTINGS_NFT_POLICY_ID and SETTINGS_NFT_ASSET_NAME.',
    );
    return {
      type: 'PlutusV3' as const,
      script: applyDoubleCborEncoding(settingsBp.compiledCode),
    };
  }

  /** Build or retrieve the escrow validator + intent minting policy. */
  private getEscrowScripts(): {
    escrowScript: Script;
    escrowAddr: string;
    intentPolicyScript: Script;
    intentPolicyId: string;
  } {
    const r = this.getResolved();
    return {
      escrowScript: r.escrowScript,
      escrowAddr: r.escrowAddr,
      intentPolicyScript: r.intentPolicyScript,
      intentPolicyId: r.intentPolicyId,
    };
  }

  // 1. CREATE INTENT lock funds in escrow

  async buildCreateIntentTx(params: SwapTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { sender: params.senderAddress, input: params.inputAmount.toString() },
      'Building create intent TX',
    );

    try {
      const lucid = await this.getLucid();
      const { escrowScript, escrowAddr, intentPolicyScript, intentPolicyId } =
        this.getEscrowScripts();

      // Select wallet context from sender address
      const userUtxos = await lucid.utxosAt(params.senderAddress);
      if (userUtxos.length === 0) {
        throw new ChainError('No UTxOs at sender address wallet may be empty');
      }
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Use first UTxO as seed for intent token name derivation
      const seedUtxo = userUtxos[0];

      // Derive intent token name = blake2b_256(cbor(OutputReference))
      // Mirrors utils.ak: derive_token_name(utxo_ref) = blake2b_256(serialise_data(utxo_ref))
      // PlutusV3: OutputReference = Constr(0, [txHash_bytes, outputIndex_int])
      const outRefDatum = Data.to(
        new Constr(0, [seedUtxo.txHash, BigInt(seedUtxo.outputIndex)]),
      );
      const tokenNameHex = datumToHash(outRefDatum);
      const intentTokenUnit = toUnit(intentPolicyId, tokenNameHex);

      // Parse input/output assets
      const inputAsset = AssetId.fromString(params.inputAssetId);
      const outputAsset = AssetId.fromString(params.outputAssetId);
      const inputUnit = assetIdToUnit(params.inputAssetId);

      // Build escrow datum
      const escrowDatumCbor = buildEscrowDatumCbor({
        escrowToken: mkAssetClass(intentPolicyId, tokenNameHex),
        owner: addressToPlutusData(params.senderAddress),
        inputAsset: mkAssetClass(inputAsset.policyId, inputAsset.assetName),
        inputAmount: params.inputAmount,
        outputAsset: mkAssetClass(outputAsset.policyId, outputAsset.assetName),
        minOutput: params.minOutput,
        deadline: BigInt(params.deadline),
        maxPartialFills: params.partialFill ? 5n : 1n,
        fillCount: 0n,
        remainingInput: params.inputAmount,
      });

      // Build escrow output value
      const escrowAssets: Assets = { [intentTokenUnit]: 1n };
      if (inputUnit === 'lovelace') {
        escrowAssets.lovelace = params.inputAmount + MIN_SCRIPT_LOVELACE;
      } else {
        escrowAssets.lovelace = MIN_SCRIPT_LOVELACE;
        escrowAssets[inputUnit] = params.inputAmount;
      }

      // Build TX
      const tx = lucid
        .newTx()
        .collectFrom([seedUtxo])
        .mintAssets(
          { [intentTokenUnit]: 1n },
          IntentTokenRedeemer.Mint(seedUtxo.txHash, BigInt(seedUtxo.outputIndex)),
        )
        .attach.MintingPolicy(intentPolicyScript)
        .pay.ToContract(
          escrowAddr,
          { kind: 'inline', value: escrowDatumCbor },
          escrowAssets,
        )
        .addSigner(params.senderAddress)
        .validTo(params.deadline);

      const completed = await tx.complete({
        changeAddress: params.changeAddress,
      });

      const txHash = completed.toHash();
      const unsignedTx = completed.toCBOR();

      this.logger.info({ txHash }, 'Intent TX built');

      return { unsignedTx, txHash, estimatedFee: 0n };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build intent TX');
      throw new ChainError(`Failed to build intent TX: ${msg}`);
    }
  }

  // 2. CANCEL INTENT owner reclaims from escrow

  async buildCancelIntentTx(
    params: CancelIntentTxParams,
  ): Promise<BuildTxResult> {
    this.logger.info({ intentId: params.intentId }, 'Building cancel intent TX');

    try {
      const lucid = await this.getLucid();
      const { escrowScript, escrowAddr, intentPolicyScript, intentPolicyId } =
        this.getEscrowScripts();

      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find all UTxOs at escrow address
      const escrowUtxos = await lucid.utxosAt(escrowAddr);

      // Find the one with an intent token belonging to this policy
      const escrowUtxo = escrowUtxos.find((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(intentPolicyId)),
      );

      if (!escrowUtxo) {
        throw new ChainError(
          'Escrow UTxO not found on-chain. Intent may already be filled or cancelled.',
        );
      }

      // Identify the intent token unit
      const intentTokenUnit = Object.keys(escrowUtxo.assets).find((unit) =>
        unit.startsWith(intentPolicyId),
      )!;

      const tx = lucid
        .newTx()
        .collectFrom([escrowUtxo], EscrowRedeemer.Cancel())
        .attach.SpendingValidator(escrowScript)
        .mintAssets({ [intentTokenUnit]: -1n }, IntentTokenRedeemer.Burn())
        .attach.MintingPolicy(intentPolicyScript)
        .addSigner(params.senderAddress);

      const completed = await tx.complete({
        changeAddress: params.senderAddress,
      });

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build cancel TX');
      throw new ChainError(`Failed to build cancel TX: ${msg}`);
    }
  }

  // 3. CREATE POOL factory + NFT + LP mint

  async buildCreatePoolTx(params: CreatePoolTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { assetA: params.assetAId, assetB: params.assetBId },
      'Building create pool TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // Parse assets
      const assetA = AssetId.fromString(params.assetAId);
      const assetB = AssetId.fromString(params.assetBId);

      // User UTxOs
      const userUtxos = await lucid.utxosAt(params.creatorAddress);
      if (userUtxos.length === 0) {
        throw new ChainError('No UTxOs at creator address');
      }
      lucid.selectWallet.fromAddress(params.creatorAddress, userUtxos);
      const seedUtxo = userUtxos[0];

      // Pool NFT name from seed UTxO
      // PlutusV3: OutputReference = Constr(0, [txHash_bytes, outputIndex_int])
      const outRefDatum = Data.to(
        new Constr(0, [seedUtxo.txHash, BigInt(seedUtxo.outputIndex)]),
      );
      const poolNftNameHex = datumToHash(outRefDatum);
      const poolNftUnit = toUnit(r.poolNftPolicyId, poolNftNameHex);
      const lpTokenUnit = toUnit(r.lpPolicyId, poolNftNameHex);

      // Initial LP tokens: sqrt(a * b) - 1000 (Minimum Liquidity locked)
      const sqrtAB = BigInt(
        Math.floor(
          Math.sqrt(Number(params.initialAmountA * params.initialAmountB)),
        ),
      );
      const initialLp = sqrtAB - 1000n;
      if (initialLp <= 0n) {
        throw new ChainError('Initial liquidity too low');
      }

      // Build PoolDatum
      const poolDatumCbor = Data.to(
        new Constr(0, [
          mkAssetClass(r.poolNftPolicyId, poolNftNameHex), // pool_nft
          mkAssetClass(assetA.policyId, assetA.assetName), // asset_a
          mkAssetClass(assetB.policyId, assetB.assetName), // asset_b
          initialLp, // total_lp_tokens
          BigInt(params.feeNumerator), // fee_numerator
          0n, // protocol_fees_a
          0n, // protocol_fees_b
          sqrtAB, // last_root_k
        ]),
      );

      // Pool output value
      const poolAssets: Assets = {
        lovelace: MIN_SCRIPT_LOVELACE,
        [poolNftUnit]: 1n,
      };
      const unitA = assetA.isAda
        ? 'lovelace'
        : toUnit(assetA.policyId, assetA.assetName);
      const unitB = assetB.isAda
        ? 'lovelace'
        : toUnit(assetB.policyId, assetB.assetName);
      if (unitA === 'lovelace') {
        poolAssets.lovelace += params.initialAmountA;
      } else {
        poolAssets[unitA] = params.initialAmountA;
      }
      if (unitB === 'lovelace') {
        poolAssets.lovelace += params.initialAmountB;
      } else {
        poolAssets[unitB] = params.initialAmountB;
      }

      // Factory redeemer
      const factoryRedeemer = mkFactoryCreatePoolRedeemer(
        mkAssetClass(assetA.policyId, assetA.assetName),
        mkAssetClass(assetB.policyId, assetB.assetName),
        params.initialAmountA,
        params.initialAmountB,
        BigInt(params.feeNumerator),
      );

      // Try to find and spend factory UTxO (if deployed)
      const factoryUtxos = await lucid.utxosAt(r.factoryAddr);

      let tx = lucid.newTx().collectFrom([seedUtxo]);

      if (factoryUtxos.length > 0) {
        const factoryUtxo = factoryUtxos[0];
        tx = tx
          .collectFrom([factoryUtxo], factoryRedeemer)
          .attach.SpendingValidator(r.factoryScript);
        
        // Factory validator requires NFT continuity (thread token pattern).
        // Parse the existing factory datum to update pool_count and re-output.
        // FactoryDatum = Constr(0, [factory_nft, pool_count, admin, settings_utxo])
        if (factoryUtxo.datum) {
          const parsedDatum = Data.from(factoryUtxo.datum);
          // Reconstruct with pool_count + 1
          const fields = (parsedDatum as Constr<Data>).fields;
          const updatedFactoryDatum = Data.to(
            new Constr(0, [
              fields[0],                      // factory_nft (unchanged)
              (fields[1] as bigint) + 1n,     // pool_count + 1
              fields[2],                      // admin (unchanged)
              fields[3],                      // settings_utxo (unchanged)
            ]),
          );
          tx = tx.pay.ToContract(
            r.factoryAddr,
            { kind: 'inline', value: updatedFactoryDatum },
            factoryUtxo.assets,
          );
        }
      }

      tx = tx
        .mintAssets(
          { [poolNftUnit]: 1n },
          PoolNFTRedeemer.Mint(
            seedUtxo.txHash,
            BigInt(seedUtxo.outputIndex),
          ),
        )
        .attach.MintingPolicy(r.poolNftScript)
        .mintAssets(
          { [lpTokenUnit]: initialLp },
          mkLPRedeemer(r.poolNftPolicyId, poolNftNameHex, initialLp),
        )
        .attach.MintingPolicy(r.lpScript)
        .pay.ToContract(
          r.poolAddr,
          { kind: 'inline', value: poolDatumCbor },
          poolAssets,
        )
        .addSigner(params.creatorAddress);

      const completed = await tx.complete({
        changeAddress: params.changeAddress,
      });

      // R-13 fix: Determine pool output index based on TX construction order.
      // If factory UTxO was consumed, factory re-output is at index 0, pool at 1.
      // If no factory, pool output is at index 0.
      const poolOutputIdx = factoryUtxos.length > 0 ? 1 : 0;

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
        poolMeta: {
          poolNftPolicyId: r.poolNftPolicyId,
          poolNftAssetName: poolNftNameHex,
          lpPolicyId: r.lpPolicyId,
          initialLp,
          poolOutputIndex: poolOutputIdx,
        },
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build create pool TX');
      throw new ChainError(`Failed to build create pool TX: ${msg}`);
    }
  }

  // 4. DEPOSIT LIQUIDITY LP mint

  async buildDepositTx(params: DepositTxParams): Promise<BuildTxResult> {
    this.logger.info({ poolId: params.poolId }, 'Building deposit TX');

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // User wallet
      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find pool UTxO
      const poolUtxos = await lucid.utxosAt(r.poolAddr);
      if (poolUtxos.length === 0) {
        throw new ChainError('No pool UTxOs found on-chain');
      }

      // Select pool by its NFT
      const poolUtxo = poolUtxos.find((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(r.poolNftPolicyId)),
      );
      if (!poolUtxo) {
        throw new ChainError('Pool UTxO with NFT not found');
      }

      // Extract pool NFT asset name
      const poolNftUnit = Object.keys(poolUtxo.assets).find((unit) =>
        unit.startsWith(r.poolNftPolicyId),
      )!;
      const poolNftAssetName = poolNftUnit.slice(r.poolNftPolicyId.length);
      const lpTokenUnit = toUnit(r.lpPolicyId, poolNftAssetName);

      // Parse existing pool datum to get reserves and pool state
      // PoolDatum = Constr(0, [pool_nft, asset_a, asset_b, total_lp, fee_num, fees_a, fees_b, root_k])
      const existingDatumParsed = Data.from(poolUtxo.datum!) as Constr<Data>;
      const df = existingDatumParsed.fields;
      const totalLpOld = df[3] as bigint;
      const feeNumerator = df[4] as bigint;
      const protocolFeesA = df[5] as bigint;
      const protocolFeesB = df[6] as bigint;

      // Extract asset_a and asset_b from datum to determine which units to use
      const assetADatum = df[1] as Constr<Data>;
      const assetBDatum = df[2] as Constr<Data>;
      const assetAPolicyId = assetADatum.fields[0] as string;
      const assetAAssetName = assetADatum.fields[1] as string;
      const assetBPolicyId = assetBDatum.fields[0] as string;
      const assetBAssetName = assetBDatum.fields[1] as string;

      const unitA = assetAPolicyId === '' ? 'lovelace' : toUnit(assetAPolicyId, assetAAssetName);
      const unitB = assetBPolicyId === '' ? 'lovelace' : toUnit(assetBPolicyId, assetBAssetName);

      // Get current on-chain reserves (what the validator sees)
      const reserveAIn = unitA === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitA] || 0n);
      const reserveBIn = unitB === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitB] || 0n);

      // Compute LP tokens from on-chain state (must match pool validator's calculation)
      let lpToMint: bigint;
      if (totalLpOld === 0n) {
        // Initial deposit: sqrt(depositA * depositB) - 1000
        const sqrtAB = BigInt(
          Math.floor(Math.sqrt(Number(params.amountA * params.amountB))),
        );
        lpToMint = sqrtAB - 1000n;
      } else {
        // Subsequent deposit: min(totalLp * depositA / reserveA, totalLp * depositB / reserveB)
        const lpFromA = (totalLpOld * params.amountA) / reserveAIn;
        const lpFromB = (totalLpOld * params.amountB) / reserveBIn;
        lpToMint = lpFromA < lpFromB ? lpFromA : lpFromB;
      }
      if (lpToMint <= 0n) {
        throw new ChainError('Deposit amounts too small LP tokens to mint would be 0');
      }

      // Build new pool output value: existing + deposits
      const newPoolAssets: Assets = { ...poolUtxo.assets };
      if (unitA === 'lovelace') {
        newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) + params.amountA;
      } else {
        newPoolAssets[unitA] = (newPoolAssets[unitA] || 0n) + params.amountA;
      }
      if (unitB === 'lovelace') {
        newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) + params.amountB;
      } else {
        newPoolAssets[unitB] = (newPoolAssets[unitB] || 0n) + params.amountB;
      }

      // Compute new reserves for root_k
      const newReserveA = (unitA === 'lovelace'
        ? newPoolAssets.lovelace
        : newPoolAssets[unitA]) || 0n;
      const newReserveB = (unitB === 'lovelace'
        ? newPoolAssets.lovelace
        : newPoolAssets[unitB]) || 0n;
      // For lovelace pools, reserve_a excludes the min-utxo and pool NFT overhead
      // The get_reserve function in Aiken just checks quantity_of(value, policy, name)
      // For ADA it's quantity_of(value, #"", #"") which is the raw lovelace count.
      // So we use raw values directly.

      // Compute new root K = floor(sqrt(reserveA_out * reserveB_out))
      const newRootK = BigInt(
        Math.floor(Math.sqrt(Number(newReserveA * newReserveB))),
      );

      // Build updated pool datum
      const updatedPoolDatum = Data.to(
        new Constr(0, [
          df[0],                       // pool_nft (unchanged)
          df[1],                       // asset_a (unchanged)
          df[2],                       // asset_b (unchanged)
          totalLpOld + lpToMint,       // total_lp_tokens = old + minted
          feeNumerator,                // fee_numerator (unchanged)
          protocolFeesA,               // protocol_fees_a (unchanged)
          protocolFeesB,               // protocol_fees_b (unchanged)
          newRootK,                    // updated last_root_k
        ]),
      );

      const tx = lucid
        .newTx()
        .collectFrom([poolUtxo], PoolRedeemer.Deposit(params.minLpTokens))
        .attach.SpendingValidator(r.poolScript)
        .mintAssets(
          { [lpTokenUnit]: lpToMint },
          mkLPRedeemer(r.poolNftPolicyId, poolNftAssetName, lpToMint),
        )
        .attach.MintingPolicy(r.lpScript)
        .pay.ToContract(
          r.poolAddr,
          { kind: 'inline', value: updatedPoolDatum },
          newPoolAssets,
        )
        .addSigner(params.senderAddress);

      const completed = await tx.complete({
        changeAddress: params.changeAddress,
      });

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build deposit TX');
      throw new ChainError(`Failed to build deposit TX: ${msg}`);
    }
  }

  // 5. WITHDRAW LIQUIDITY LP burn

  async buildWithdrawTx(params: WithdrawTxParams): Promise<BuildTxResult> {
    this.logger.info({ poolId: params.poolId }, 'Building withdraw TX');

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // User wallet
      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find pool UTxO
      const poolUtxos = await lucid.utxosAt(r.poolAddr);
      const poolUtxo = poolUtxos.find((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(r.poolNftPolicyId)),
      );
      if (!poolUtxo) {
        throw new ChainError('Pool UTxO with NFT not found');
      }

      // Extract pool NFT asset name
      const poolNftUnit = Object.keys(poolUtxo.assets).find((unit) =>
        unit.startsWith(r.poolNftPolicyId),
      )!;
      const poolNftAssetName = poolNftUnit.slice(r.poolNftPolicyId.length);
      const lpTokenUnit = toUnit(r.lpPolicyId, poolNftAssetName);

      // Parse existing pool datum
      // PoolDatum = Constr(0, [pool_nft, asset_a, asset_b, total_lp, fee_num, fees_a, fees_b, root_k])
      const existingDatumParsed = Data.from(poolUtxo.datum!) as Constr<Data>;
      const df = existingDatumParsed.fields;
      const totalLpOld = df[3] as bigint;
      const feeNumerator = df[4] as bigint;
      const protocolFeesA = df[5] as bigint;
      const protocolFeesB = df[6] as bigint;

      // Extract asset units from datum
      const assetADatum = df[1] as Constr<Data>;
      const assetBDatum = df[2] as Constr<Data>;
      const assetAPolicyId = assetADatum.fields[0] as string;
      const assetAAssetName = assetADatum.fields[1] as string;
      const assetBPolicyId = assetBDatum.fields[0] as string;
      const assetBAssetName = assetBDatum.fields[1] as string;

      const unitA = assetAPolicyId === '' ? 'lovelace' : toUnit(assetAPolicyId, assetAAssetName);
      const unitB = assetBPolicyId === '' ? 'lovelace' : toUnit(assetBPolicyId, assetBAssetName);

      // Get current on-chain reserves
      const reserveAIn = unitA === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitA] || 0n);
      const reserveBIn = unitB === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitB] || 0n);

      const lpBurned = params.lpTokenAmount;
      if (lpBurned <= 0n) {
        throw new ChainError('LP tokens to burn must be positive');
      }
      if (lpBurned > totalLpOld) {
        throw new ChainError('Cannot burn more LP tokens than total supply');
      }

      // Calculate proportional withdrawal (must match Aiken calculate_withdrawal)
      // amount_a = reserve_a * lp_burned / total_lp (floor division)
      // amount_b = reserve_b * lp_burned / total_lp (floor division)
      const withdrawA = (reserveAIn * lpBurned) / totalLpOld;
      const withdrawB = (reserveBIn * lpBurned) / totalLpOld;

      // Build new pool output value: existing - withdrawn
      const newPoolAssets: Assets = { ...poolUtxo.assets };
      if (unitA === 'lovelace') {
        newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) - withdrawA;
      } else {
        newPoolAssets[unitA] = (newPoolAssets[unitA] || 0n) - withdrawA;
      }
      if (unitB === 'lovelace') {
        newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) - withdrawB;
      } else {
        newPoolAssets[unitB] = (newPoolAssets[unitB] || 0n) - withdrawB;
      }

      // New reserves after withdrawal
      const newReserveA = reserveAIn - withdrawA;
      const newReserveB = reserveBIn - withdrawB;

      // Compute new root K
      const newRootK = BigInt(
        Math.floor(Math.sqrt(Number(newReserveA * newReserveB))),
      );

      // Build updated pool datum
      const updatedPoolDatum = Data.to(
        new Constr(0, [
          df[0],                              // pool_nft (unchanged)
          df[1],                              // asset_a (unchanged)
          df[2],                              // asset_b (unchanged)
          totalLpOld - lpBurned,              // total_lp_tokens decremented
          feeNumerator,                       // fee_numerator (unchanged)
          protocolFeesA,                      // protocol_fees_a (unchanged)
          protocolFeesB,                      // protocol_fees_b (unchanged)
          newRootK,                           // updated last_root_k
        ]),
      );

      // Burn LP tokens
      const lpRedeemer = mkLPRedeemer(
        r.poolNftPolicyId,
        poolNftAssetName,
        -lpBurned,
      );

      const tx = lucid
        .newTx()
        .collectFrom(
          [poolUtxo],
          PoolRedeemer.Withdraw(lpBurned),
        )
        .attach.SpendingValidator(r.poolScript)
        .mintAssets({ [lpTokenUnit]: -lpBurned }, lpRedeemer)
        .attach.MintingPolicy(r.lpScript)
        .pay.ToContract(
          r.poolAddr,
          { kind: 'inline', value: updatedPoolDatum },
          newPoolAssets,
        )
        .addSigner(params.senderAddress);

      const completed = await tx.complete({
        changeAddress: params.changeAddress,
      });

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build withdraw TX');
      throw new ChainError(`Failed to build withdraw TX: ${msg}`);
    }
  }

  // 6. SETTLEMENT solver batch fills intents

  async buildSettlementTx(params: SettlementTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { intentCount: params.intentUtxoRefs.length },
      'Building settlement TX (escrow fill)',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();
      const { escrowScript, escrowAddr, intentPolicyScript, intentPolicyId } =
        this.getEscrowScripts();

      // Fetch all escrow UTxOs
      const escrowUtxos: LucidUTxO[] = [];
      for (const ref of params.intentUtxoRefs) {
        const refUtxos = await lucid.utxosByOutRef([
          { txHash: ref.txHash, outputIndex: ref.outputIndex },
        ]);
        if (refUtxos.length > 0) escrowUtxos.push(refUtxos[0]);
      }

      if (escrowUtxos.length === 0) {
        throw new ChainError('No escrow UTxOs found for settlement');
      }

      // Fetch pool UTxO
      const poolRef = params.poolUtxoRef;
      const poolUtxos = await lucid.utxosByOutRef([
        { txHash: poolRef.txHash, outputIndex: poolRef.outputIndex },
      ]);
      if (poolUtxos.length === 0) {
        throw new ChainError('Pool UTxO not found for settlement');
      }
      const poolUtxo = poolUtxos[0];

      // Parse pool datum
      // PoolDatum = Constr(0, [pool_nft, asset_a, asset_b, total_lp, fee_num, fees_a, fees_b, root_k])
      const poolDatumParsed = Data.from(poolUtxo.datum!) as Constr<Data>;
      const pdf = poolDatumParsed.fields;
      const feeNumerator = pdf[4] as bigint;
      let protocolFeesA = pdf[5] as bigint;
      let protocolFeesB = pdf[6] as bigint;

      // Extract asset_a and asset_b from pool datum
      const assetADatum = pdf[1] as Constr<Data>;
      const assetBDatum = pdf[2] as Constr<Data>;
      const assetAPolicyId = assetADatum.fields[0] as string;
      const assetAAssetName = assetADatum.fields[1] as string;
      const assetBPolicyId = assetBDatum.fields[0] as string;
      const assetBAssetName = assetBDatum.fields[1] as string;

      const unitA = assetAPolicyId === '' ? 'lovelace' : toUnit(assetAPolicyId, assetAAssetName);
      const unitB = assetBPolicyId === '' ? 'lovelace' : toUnit(assetBPolicyId, assetBAssetName);

      // Current on-chain pool reserves
      let reserveA = unitA === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitA] || 0n);
      let reserveB = unitB === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitB] || 0n);

      // Select solver wallet
      const solverUtxos = await lucid.utxosAt(params.solverAddress);
      lucid.selectWallet.fromAddress(params.solverAddress, solverUtxos);

      let tx = lucid.newTx();

      // Process each escrow UTxO
      const burnAssets: Assets = {};
      const ownerPayments: Array<{ address: string; assets: Assets }> = [];

      for (const eu of escrowUtxos) {
        // Parse escrow datum
        // EscrowDatum = Constr(0, [escrow_token, owner, input_asset, input_amount,
        //                          output_asset, min_output, deadline, max_partial_fills,
        //                          fill_count, remaining_input])
        const escrowDatum = Data.from(eu.datum!) as Constr<Data>;
        const edf = escrowDatum.fields;
        const owner = edf[1] as Constr<Data>; // Plutus Address
        const inputAssetClass = edf[2] as Constr<Data>;
        const inputAmount = edf[3] as bigint;
        const outputAssetClass = edf[4] as Constr<Data>;
        const minOutput = edf[5] as bigint;
        const remainingInput = edf[9] as bigint;

        // Determine swap direction by comparing input asset with pool's asset_a
        const inputPolicyId = inputAssetClass.fields[0] as string;
        const inputAssetName = inputAssetClass.fields[1] as string;
        const isInputA = inputPolicyId === assetAPolicyId && inputAssetName === assetAAssetName;
        const direction: 'AToB' | 'BToA' = isInputA ? 'AToB' : 'BToA';

        // Calculate swap output using constant product formula
        // output = (reserve_out * input) / (reserve_in + input)
        // This is equivalent to: new_reserve_in * new_reserve_out >= old_reserve_in * old_reserve_out
        const inputConsumed = remainingInput; // Complete fill
        const maxPartialFills = edf[7] as bigint;
        const fillCount = edf[8] as bigint;
        const isPartialFill = maxPartialFills > 0n && fillCount < maxPartialFills;
        // For partial fills with multiple escrows in a batch, the solver
        // can choose to consume only part of remainingInput. For now,
        // always do a complete fill per-intent. Partial fill support is
        // activated when pool liquidity is insufficient — see below.
        let actualInput = inputConsumed;
        let outputAmount: bigint;

        if (direction === 'AToB') {
          // Selling A for B: input is A, output is B
          // Fee deduction: effective_input = input * (10000 - fee) / 10000
          const effectiveInput = (actualInput * (10000n - feeNumerator)) / 10000n;
          outputAmount = (reserveB * effectiveInput) / (reserveA + effectiveInput);

          // Partial fill check: if output would drain too much of reserve, cap it
          if (outputAmount >= reserveB && isPartialFill) {
            // Reserve can't fully satisfy — cap at 50% of reserve, re-derive input
            const maxOutput = reserveB / 2n;
            // reverse AMM: input = (reserveA * maxOutput) / ((reserveB - maxOutput) * (10000 - fee) / 10000)
            const denominator = ((reserveB - maxOutput) * (10000n - feeNumerator)) / 10000n;
            actualInput = denominator > 0n ? (reserveA * maxOutput) / denominator : 0n;
            if (actualInput <= 0n) {
              throw new ChainError(`Pool has insufficient liquidity for escrow ${eu.txHash}`);
            }
            const recalcEffective = (actualInput * (10000n - feeNumerator)) / 10000n;
            outputAmount = (reserveB * recalcEffective) / (reserveA + recalcEffective);
          }
          
          // Protocol fee accrues on input side (A)
          const protocolFee = (actualInput * feeNumerator / 10000n) / 6n; // protocol_fee_share = 6
          protocolFeesA += protocolFee;
          
          // Update reserves
          reserveA += actualInput;
          reserveB -= outputAmount;
        } else {
          // Selling B for A: input is B, output is A
          const effectiveInput = (actualInput * (10000n - feeNumerator)) / 10000n;
          outputAmount = (reserveA * effectiveInput) / (reserveB + effectiveInput);

          // Partial fill check
          if (outputAmount >= reserveA && isPartialFill) {
            const maxOutput = reserveA / 2n;
            const denominator = ((reserveA - maxOutput) * (10000n - feeNumerator)) / 10000n;
            actualInput = denominator > 0n ? (reserveB * maxOutput) / denominator : 0n;
            if (actualInput <= 0n) {
              throw new ChainError(`Pool has insufficient liquidity for escrow ${eu.txHash}`);
            }
            const recalcEffective = (actualInput * (10000n - feeNumerator)) / 10000n;
            outputAmount = (reserveA * recalcEffective) / (reserveB + recalcEffective);
          }
          
          const protocolFee = (actualInput * feeNumerator / 10000n) / 6n;
          protocolFeesB += protocolFee;
          
          reserveB += actualInput;
          reserveA -= outputAmount;
        }

        const isCompleteFill = actualInput >= remainingInput;

        // Check minimum output (slippage protection)
        // min_required = min_output * input_consumed / input_amount
        const minRequired = (minOutput * actualInput) / inputAmount;
        if (outputAmount < minRequired) {
          throw new ChainError(
            `Swap output ${outputAmount} below minimum ${minRequired} for escrow ${eu.txHash}`,
          );
        }

        // Collect escrow UTxO with Fill redeemer
        tx = tx.collectFrom(
          [eu],
          EscrowRedeemer.Fill(actualInput, outputAmount),
        );

        if (isCompleteFill) {
          // Burn intent token on complete fill
          for (const unit of Object.keys(eu.assets)) {
            if (unit.startsWith(intentPolicyId)) {
              burnAssets[unit] = (burnAssets[unit] || 0n) - 1n;
            }
          }
        } else {
          // Partial fill: re-output escrow with updated datum
          const newRemainingInput = remainingInput - actualInput;
          const newFillCount = fillCount + 1n;
          const updatedEscrowDatum = Data.to(
            new Constr(0, [
              edf[0], // escrow_token
              edf[1], // owner
              edf[2], // input_asset
              edf[3], // input_amount (original, unchanged)
              edf[4], // output_asset
              edf[5], // min_output
              edf[6], // deadline
              edf[7], // max_partial_fills
              newFillCount,
              newRemainingInput,
            ]),
          );

          // Re-output escrow with reduced input amount
          const inputUnit = inputPolicyId === '' ? 'lovelace' : toUnit(inputPolicyId, inputAssetName);
          const newEscrowAssets: Assets = { ...eu.assets };
          if (inputUnit === 'lovelace') {
            newEscrowAssets.lovelace = newRemainingInput + MIN_SCRIPT_LOVELACE;
          } else {
            newEscrowAssets[inputUnit] = newRemainingInput;
          }

          tx = tx.pay.ToContract(
            escrowAddr,
            { kind: 'inline', value: updatedEscrowDatum },
            newEscrowAssets,
          );
        }

        // Resolve owner address for payment output
        // Convert Plutus Address data back to bech32 using our reverse helper
        const ownerBech32 = plutusAddressToAddress(owner, this.network);
        
        // Build owner payment deliver output asset
        const outputPolicyId = (outputAssetClass.fields[0] as string);
        const outputAssetName = (outputAssetClass.fields[1] as string);
        const outputUnit = outputPolicyId === '' ? 'lovelace' : toUnit(outputPolicyId, outputAssetName);
        
        const ownerAssets: Assets = {};
        if (outputUnit === 'lovelace') {
          ownerAssets.lovelace = outputAmount;
        } else {
          ownerAssets.lovelace = MIN_SCRIPT_LOVELACE; // min ADA for native token UTxO
          ownerAssets[outputUnit] = outputAmount;
        }

        ownerPayments.push({
          address: ownerBech32,
          assets: ownerAssets,
        });
      }

      tx = tx.attach.SpendingValidator(escrowScript);

      // Burn intent tokens
      if (Object.keys(burnAssets).length > 0) {
        tx = tx
          .mintAssets(burnAssets, IntentTokenRedeemer.Burn())
          .attach.MintingPolicy(intentPolicyScript);
      }

      // Determine overall swap direction for pool redeemer
      // For single settlement, use the first escrow's direction; for batch, need aggregation
      // The pool validator Swap redeemer only takes one direction, so batch must be same direction
      const firstEscrowDatum = Data.from(escrowUtxos[0].datum!) as Constr<Data>;
      const firstInputAsset = firstEscrowDatum.fields[2] as Constr<Data>;
      const firstInputPolicy = firstInputAsset.fields[0] as string;
      const firstInputName = firstInputAsset.fields[1] as string;
      const overallDirection: 'AToB' | 'BToA' =
        (firstInputPolicy === assetAPolicyId && firstInputName === assetAAssetName)
          ? 'AToB' : 'BToA';

      // Consume pool UTxO with Swap redeemer
      tx = tx
        .collectFrom([poolUtxo], PoolRedeemer.Swap(overallDirection, 0n))
        .attach.SpendingValidator(r.poolScript);

      // Build updated pool datum
      const newRootK = BigInt(
        Math.floor(Math.sqrt(Number(reserveA * reserveB))),
      );
      const updatedPoolDatum = Data.to(
        new Constr(0, [
          pdf[0],          // pool_nft (unchanged)
          pdf[1],          // asset_a (unchanged)
          pdf[2],          // asset_b (unchanged)
          pdf[3],          // total_lp_tokens (unchanged swap doesn't affect LP)
          feeNumerator,    // fee_numerator (unchanged)
          protocolFeesA,   // updated protocol_fees_a
          protocolFeesB,   // updated protocol_fees_b
          newRootK,        // updated last_root_k
        ]),
      );

      // Build new pool output assets
      const newPoolAssets: Assets = { ...poolUtxo.assets };
      if (unitA === 'lovelace') {
        newPoolAssets.lovelace = reserveA;
      } else {
        newPoolAssets[unitA] = reserveA;
      }
      if (unitB === 'lovelace') {
        newPoolAssets.lovelace = reserveB;
      } else {
        newPoolAssets[unitB] = reserveB;
      }

      // Re-output pool with updated datum and reserves
      tx = tx.pay.ToContract(
        r.poolAddr,
        { kind: 'inline', value: updatedPoolDatum },
        newPoolAssets,
      );

      // Pay outputs to escrow owners
      // The escrow validator's check_payment_output verifies that an output exists
      // with: address == datum.owner AND asset_quantity >= output_delivered
      for (const payment of ownerPayments) {
        tx = tx.pay.ToAddress(payment.address, payment.assets);
      }

      tx = tx
        .addSigner(params.solverAddress)
        .validTo(Date.now() + 15 * 60 * 1000); // 15min validity

      const completed = await tx.complete({
        changeAddress: params.solverAddress,
      });

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build settlement TX');
      throw new ChainError(`Failed to build settlement TX: ${msg}`);
    }
  }

  // 7. CREATE ORDER lock funds in order validator

  async buildOrderTx(params: OrderTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { type: params.orderType, input: params.inputAmount.toString() },
      'Building create order TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      const userUtxos = await lucid.utxosAt(params.senderAddress);
      if (userUtxos.length === 0) {
        throw new ChainError('No UTxOs at sender address');
      }
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      const seedUtxo = userUtxos[0];

      // Derive order token name via hash of consumed UTxO
      // PlutusV3: OutputReference = Constr(0, [txHash_bytes, outputIndex_int])
      const outRefDatum = Data.to(
        new Constr(0, [seedUtxo.txHash, BigInt(seedUtxo.outputIndex)]),
      );
      const tokenNameHex = datumToHash(outRefDatum);
      const orderTokenUnit = toUnit(r.intentPolicyId, tokenNameHex);

      const inputAsset = AssetId.fromString(params.inputAssetId);
      const outputAsset = AssetId.fromString(params.outputAssetId);
      const inputUnit = assetIdToUnit(params.inputAssetId);

      // Budget amount depends on order type
      const budget = params.totalBudget ?? params.inputAmount;

      // Build OrderParams datum
      const orderParams = mkOrderParams({
        priceNum: params.priceNumerator,
        priceDen: params.priceDenominator,
        amountPerInterval: params.amountPerInterval ?? 0n,
        minInterval: BigInt(params.intervalSlots ?? 0),
        lastFillSlot: 0n,
        remainingBudget: budget,
        deadline: BigInt(params.deadline),
      });

      // Build OrderDatum
      const orderDatumCbor = buildOrderDatumCbor({
        orderType: mkOrderType(params.orderType),
        owner: addressToPlutusData(params.senderAddress),
        assetIn: mkAssetClass(inputAsset.policyId, inputAsset.assetName),
        assetOut: mkAssetClass(outputAsset.policyId, outputAsset.assetName),
        params: orderParams,
        orderToken: mkAssetClass(r.intentPolicyId, tokenNameHex),
      });

      // Build order output value
      const orderAssets: Assets = { [orderTokenUnit]: 1n };
      if (inputUnit === 'lovelace') {
        orderAssets.lovelace = budget + MIN_SCRIPT_LOVELACE;
      } else {
        orderAssets.lovelace = MIN_SCRIPT_LOVELACE;
        orderAssets[inputUnit] = budget;
      }

      const tx = lucid
        .newTx()
        .collectFrom([seedUtxo])
        .mintAssets(
          { [orderTokenUnit]: 1n },
          IntentTokenRedeemer.Mint(seedUtxo.txHash, BigInt(seedUtxo.outputIndex)),
        )
        .attach.MintingPolicy(r.intentPolicyScript)
        .pay.ToContract(
          r.orderAddr,
          { kind: 'inline', value: orderDatumCbor },
          orderAssets,
        )
        .addSigner(params.senderAddress)
        .validTo(params.deadline);

      const completed = await tx.complete({
        changeAddress: params.changeAddress,
      });

      this.logger.info({ txHash: completed.toHash() }, 'Order TX built');

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build order TX');
      throw new ChainError(`Failed to build order TX: ${msg}`);
    }
  }

  // 8. CANCEL ORDER owner reclaims from order validator

  async buildCancelOrderTx(params: CancelOrderTxParams): Promise<BuildTxResult> {
    this.logger.info({ orderId: params.orderId }, 'Building cancel order TX');

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find order UTxO by txHash + outputIndex
      const orderUtxos = await lucid.utxosAt(r.orderAddr);
      const orderUtxo = orderUtxos.find(
        (u) => u.txHash === params.escrowTxHash && u.outputIndex === params.escrowOutputIndex,
      );

      if (!orderUtxo) {
        throw new ChainError('Order UTxO not found on-chain');
      }

      // Find and burn order auth token
      const orderTokenUnit = Object.keys(orderUtxo.assets).find((unit) =>
        unit.startsWith(r.intentPolicyId),
      );

      const burnAssets: Assets = {};
      if (orderTokenUnit) {
        burnAssets[orderTokenUnit] = -1n;
      }

      let tx = lucid
        .newTx()
        .collectFrom([orderUtxo], OrderRedeemer.CancelOrder())
        .attach.SpendingValidator(r.orderScript)
        .addSigner(params.senderAddress);

      if (Object.keys(burnAssets).length > 0) {
        tx = tx
          .mintAssets(burnAssets, IntentTokenRedeemer.Burn())
          .attach.MintingPolicy(r.intentPolicyScript);
      }

      const completed = await tx.complete({
        changeAddress: params.senderAddress,
      });

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build cancel order TX');
      throw new ChainError(`Failed to build cancel order TX: ${msg}`);
    }
  }

  // 9. RECLAIM permissionless reclaim of expired escrow

  async buildReclaimTx(params: ReclaimTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { escrowTxHash: params.escrowTxHash, ownerAddress: params.ownerAddress },
      'Building reclaim TX for expired escrow',
    );

    try {
      const lucid = await this.getLucid();
      const { escrowScript, escrowAddr, intentPolicyScript, intentPolicyId } =
        this.getEscrowScripts();

      // Keeper pays fees select keeper UTxOs
      const keeperUtxos = await lucid.utxosAt(params.keeperAddress);
      if (keeperUtxos.length === 0) {
        throw new ChainError('No UTxOs at keeper address keeper wallet may be empty');
      }
      lucid.selectWallet.fromAddress(params.keeperAddress, keeperUtxos);

      // Find escrow UTxO by txHash + outputIndex
      const escrowUtxos = await lucid.utxosAt(escrowAddr);
      const escrowUtxo = escrowUtxos.find(
        (u) =>
          u.txHash === params.escrowTxHash &&
          u.outputIndex === params.escrowOutputIndex,
      );

      if (!escrowUtxo) {
        throw new ChainError(
          'Escrow UTxO not found on-chain. May already be reclaimed or filled.',
        );
      }

      // Identify the intent token unit to burn
      const intentTokenUnit = Object.keys(escrowUtxo.assets).find((unit) =>
        unit.startsWith(intentPolicyId),
      );

      if (!intentTokenUnit) {
        throw new ChainError('Escrow UTxO has no intent token cannot reclaim');
      }

      // Parse the inline datum to extract owner + remaining input info
      // We need the datum to compute the owner payment output.
      // The escrow datum is inline, so we can read from the UTxO.
      // For now, we build the TX and let the validator+Lucid resolve it via datum.
      //
      // The validator requires:
      //  1. check_after_deadline set validFrom to now (after deadline)
      //  2. check_burn_one burn the intent token
      //  3. check_payment_output remaining input to owner
      //
      // We pay ALL non-ADA assets from the escrow to the owner.
      // The keeper gets the ADA change minus min-ADA that goes to owner.

      // Build owner payment: all assets from escrow UTxO except the intent token
      const ownerPayment: Assets = {};
      for (const [unit, qty] of Object.entries(escrowUtxo.assets)) {
        if (unit === intentTokenUnit) continue; // will be burned
        if (unit === 'lovelace') {
          // Send min-ADA + remaining locked ADA to owner
          ownerPayment.lovelace = qty;
        } else {
          ownerPayment[unit] = qty;
        }
      }

      // Ensure owner gets at least min ADA
      if (!ownerPayment.lovelace || ownerPayment.lovelace < MIN_SCRIPT_LOVELACE) {
        ownerPayment.lovelace = MIN_SCRIPT_LOVELACE;
      }

      const tx = lucid
        .newTx()
        .collectFrom([escrowUtxo], EscrowRedeemer.Reclaim())
        .attach.SpendingValidator(escrowScript)
        .mintAssets({ [intentTokenUnit]: -1n }, IntentTokenRedeemer.Burn())
        .attach.MintingPolicy(intentPolicyScript)
        .pay.ToAddress(params.ownerAddress, ownerPayment)
        .validFrom(Date.now()); // Reclaim is only valid AFTER deadline

      const completed = await tx.complete({
        changeAddress: params.keeperAddress,
      });

      this.logger.info({ txHash: completed.toHash() }, 'Reclaim TX built');

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build reclaim TX');
      throw new ChainError(`Failed to build reclaim TX: ${msg}`);
    }
  }

  // 10. COLLECT FEES admin collects protocol fees from pool(s)

  async buildCollectFeesTx(params: CollectFeesTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { admin: params.adminAddress, poolCount: params.poolIds.length },
      'Building collect fees TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // Admin wallet
      const adminUtxos = await lucid.utxosAt(params.adminAddress);
      if (adminUtxos.length === 0) {
        throw new ChainError('No UTxOs at admin address');
      }
      lucid.selectWallet.fromAddress(params.adminAddress, adminUtxos);

      // Find all pool UTxOs on-chain
      const allPoolUtxos = await lucid.utxosAt(r.poolAddr);

      // Index pool UTxOs by their NFT asset name for O(1) lookup
      const poolUtxoByNftName = new Map<string, LucidUTxO>();
      for (const u of allPoolUtxos) {
        const nftUnit = Object.keys(u.assets).find((unit) =>
          unit.startsWith(r.poolNftPolicyId),
        );
        if (nftUnit) {
          const nftAssetName = nftUnit.slice(r.poolNftPolicyId.length);
          poolUtxoByNftName.set(nftAssetName, u);
        }
      }

      let tx = lucid.newTx();
      let processedCount = 0;

      for (const poolId of params.poolIds) {
        // Find pool UTxO by matching poolId to pool NFT asset name
        // poolId format is "pool_<nft_asset_name_prefix>"
        const poolNftAssetName = poolId.startsWith('pool_')
          ? poolId.slice(5) // Remove "pool_" prefix
          : poolId;
        
        // Find by prefix match (poolId may be truncated)
        let poolUtxo: LucidUTxO | undefined;
        for (const [name, utxo] of poolUtxoByNftName) {
          if (name.startsWith(poolNftAssetName) || poolNftAssetName.startsWith(name)) {
            poolUtxo = utxo;
            break;
          }
        }
        // Fallback: if only one pool, use it
        if (!poolUtxo && poolUtxoByNftName.size === 1) {
          poolUtxo = poolUtxoByNftName.values().next().value as LucidUTxO;
        }

        if (!poolUtxo) {
          this.logger.warn({ poolId }, 'Pool UTxO not found, skipping');
          continue;
        }

        // Parse existing pool datum
        // PoolDatum = Constr(0, [pool_nft, asset_a, asset_b, total_lp, fee_num, fees_a, fees_b, root_k])
        const existingDatumParsed = Data.from(poolUtxo.datum!) as Constr<Data>;
        const df = existingDatumParsed.fields;
        const protocolFeesA = df[5] as bigint;
        const protocolFeesB = df[6] as bigint;

        if (protocolFeesA === 0n && protocolFeesB === 0n) {
          this.logger.info({ poolId }, 'No fees to collect, skipping');
          continue;
        }

        // Extract asset units from datum
        const assetADatum = df[1] as Constr<Data>;
        const assetBDatum = df[2] as Constr<Data>;
        const assetAPolicyId = assetADatum.fields[0] as string;
        const assetAAssetName = assetADatum.fields[1] as string;
        const assetBPolicyId = assetBDatum.fields[0] as string;
        const assetBAssetName = assetBDatum.fields[1] as string;

        const unitA = assetAPolicyId === '' ? 'lovelace' : toUnit(assetAPolicyId, assetAAssetName);
        const unitB = assetBPolicyId === '' ? 'lovelace' : toUnit(assetBPolicyId, assetBAssetName);

        // Build updated pool datum zero the protocol fee counters
        // Validator requires: new_datum.protocol_fees_a == 0, new_datum.protocol_fees_b == 0
        // and last_root_k preserved (fee collection doesn't change trading reserves)
        const updatedPoolDatum = Data.to(
          new Constr(0, [
            df[0],    // pool_nft (unchanged)
            df[1],    // asset_a (unchanged)
            df[2],    // asset_b (unchanged)
            df[3],    // total_lp_tokens (unchanged)
            df[4],    // fee_numerator (unchanged)
            0n,       // protocol_fees_a = 0 (zeroed after collection)
            0n,       // protocol_fees_b = 0 (zeroed after collection)
            df[7],    // last_root_k (unchanged fee collection doesn't affect K)
          ]),
        );

        // Build new pool output assets: subtract collected fees
        // Validator requires: fees_a == old_datum.protocol_fees_a, fees_b == old_datum.protocol_fees_b
        const newPoolAssets: Assets = { ...poolUtxo.assets };
        if (unitA === 'lovelace') {
          newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) - protocolFeesA;
        } else {
          newPoolAssets[unitA] = (newPoolAssets[unitA] || 0n) - protocolFeesA;
        }
        if (unitB === 'lovelace') {
          newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) - protocolFeesB;
        } else {
          newPoolAssets[unitB] = (newPoolAssets[unitB] || 0n) - protocolFeesB;
        }

        // Collect from pool with CollectFees redeemer
        tx = tx
          .collectFrom([poolUtxo], PoolRedeemer.CollectFees())
          .attach.SpendingValidator(r.poolScript);

        // Re-output pool with zeroed fees and reduced assets
        tx = tx.pay.ToContract(
          r.poolAddr,
          { kind: 'inline', value: updatedPoolDatum },
          newPoolAssets,
        );

        processedCount++;
      }

      if (processedCount === 0) {
        throw new ChainError('No pools with collectable fees found');
      }

      tx = tx.addSigner(params.adminAddress);

      const completed = await tx.complete({
        changeAddress: params.adminAddress,
      });

      this.logger.info({ txHash: completed.toHash(), processedCount }, 'Collect fees TX built');

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build collect fees TX');
      throw new ChainError(`Failed to build collect fees TX: ${msg}`);
    }
  }

  // 11. UPDATE SETTINGS admin updates global protocol settings

  async buildUpdateSettingsTx(params: UpdateSettingsTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { admin: params.adminAddress, settings: params.newSettings },
      'Building update settings TX',
    );

    try {
      const lucid = await this.getLucid();
      const bp = this.getBlueprint();

      // Load settings validator (parameterized by settings_nft: AssetClass)
      const settingsBp = findValidator(bp, 'settings_validator.settings_validator');
      const settingsScript = this.resolveSettingsScript(settingsBp);
      const settingsAddr = validatorToAddress(this.network, settingsScript);

      // Admin wallet
      const adminUtxos = await lucid.utxosAt(params.adminAddress);
      if (adminUtxos.length === 0) {
        throw new ChainError('No UTxOs at admin address');
      }
      lucid.selectWallet.fromAddress(params.adminAddress, adminUtxos);

      // Find settings UTxO on-chain
      const settingsUtxos = await lucid.utxosAt(settingsAddr);
      if (settingsUtxos.length === 0) {
        throw new ChainError('Settings UTxO not found on-chain');
      }
      const settingsUtxo = settingsUtxos[0];

      // UpdateProtocolSettings redeemer = Constr(0, [])
      const updateRedeemer = Data.to(new Constr(0, []));

      // Build new SettingsDatum with updated values
      // SettingsDatum { admin, protocol_fee_bps, min_pool_liquidity,
      //                 min_intent_size, solver_bond, fee_collector, version }
      const adminDetails = getAddressDetails(params.adminAddress);
      const adminVkh = adminDetails.paymentCredential!.hash;

      const newSettingsDatum = Data.to(
        new Constr(0, [
          adminVkh,                                          // admin VKH
          BigInt(params.newSettings.maxProtocolFeeBps),       // protocol_fee_bps
          params.newSettings.minPoolLiquidity,                // min_pool_liquidity
          1000000n,                                           // min_intent_size (1 ADA)
          5000000n,                                           // solver_bond (5 ADA)
          adminVkh,                                           // fee_collector (same as admin)
          BigInt(params.newSettings.nextVersion),              // version
        ]),
      );

      const tx = lucid
        .newTx()
        .collectFrom([settingsUtxo], updateRedeemer)
        .attach.SpendingValidator(settingsScript)
        .pay.ToContract(
          settingsAddr,
          { kind: 'inline', value: newSettingsDatum },
          settingsUtxo.assets,
        )
        .addSigner(params.adminAddress);

      const completed = await tx.complete({
        changeAddress: params.adminAddress,
      });

      this.logger.info({ txHash: completed.toHash() }, 'Update settings TX built');

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build update settings TX');
      throw new ChainError(`Failed to build update settings TX: ${msg}`);
    }
  }

  // 12. UPDATE FACTORY ADMIN transfer factory admin to new VKH

  async buildUpdateFactoryAdminTx(params: UpdateFactoryAdminTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { currentAdmin: params.currentAdminAddress, newVkh: params.newAdminVkh },
      'Building update factory admin TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // Admin wallet
      const adminUtxos = await lucid.utxosAt(params.currentAdminAddress);
      if (adminUtxos.length === 0) {
        throw new ChainError('No UTxOs at admin address');
      }
      lucid.selectWallet.fromAddress(params.currentAdminAddress, adminUtxos);

      // Find factory UTxO
      const factoryUtxos = await lucid.utxosAt(r.factoryAddr);
      if (factoryUtxos.length === 0) {
        throw new ChainError('Factory UTxO not found on-chain');
      }
      const factoryUtxo = factoryUtxos[0];

      // UpdateSettings redeemer for factory = Constr(1, [])
      const updateRedeemer = Data.to(new Constr(1, []));

      // Parse existing factory datum to preserve immutable fields
      // FactoryDatum = Constr(0, [factory_nft, pool_count, admin, settings_utxo])
      // Factory validator's UpdateSettings requires:
      //   - new_datum.factory_nft == old_datum.factory_nft (preserved)
      //   - new_datum.pool_count == old_datum.pool_count (preserved)
      //   - check_signer(tx, old_datum.admin) (signed by current admin)
      // Only admin and settings_utxo may change.
      const existingDatumParsed = Data.from(factoryUtxo.datum!) as Constr<Data>;
      const fdf = existingDatumParsed.fields;

      const newFactoryDatum = Data.to(
        new Constr(0, [
          fdf[0],                // factory_nft (preserved from existing)
          fdf[1],                // pool_count (preserved)
          params.newAdminVkh,    // new admin VKH 
          fdf[3],                // settings_utxo (preserved)
        ]),
      );

      const tx = lucid
        .newTx()
        .collectFrom([factoryUtxo], updateRedeemer)
        .attach.SpendingValidator(r.factoryScript)
        .pay.ToContract(
          r.factoryAddr,
          { kind: 'inline', value: newFactoryDatum },
          factoryUtxo.assets,
        )
        .addSigner(params.currentAdminAddress);

      const completed = await tx.complete({
        changeAddress: params.currentAdminAddress,
      });

      this.logger.info({ txHash: completed.toHash() }, 'Update factory admin TX built');

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build update factory admin TX');
      throw new ChainError(`Failed to build update factory admin TX: ${msg}`);
    }
  }

  // 13. BURN POOL NFT admin closes pool by burning NFT

  async buildBurnPoolNFTTx(params: BurnPoolNFTTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { admin: params.adminAddress, poolId: params.poolId },
      'Building burn pool NFT TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // Admin wallet
      const adminUtxos = await lucid.utxosAt(params.adminAddress);
      if (adminUtxos.length === 0) {
        throw new ChainError('No UTxOs at admin address');
      }
      lucid.selectWallet.fromAddress(params.adminAddress, adminUtxos);

      // Find pool UTxO on-chain
      const allPoolUtxos = await lucid.utxosAt(r.poolAddr);
      const poolUtxo = allPoolUtxos.find((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(r.poolNftPolicyId)),
      );

      if (!poolUtxo) {
        throw new ChainError('Pool UTxO with NFT not found on-chain');
      }

      // Identify pool NFT unit and LP token unit
      const poolNftUnit = Object.keys(poolUtxo.assets).find((unit) =>
        unit.startsWith(r.poolNftPolicyId),
      )!;
      const poolNftAssetName = poolNftUnit.slice(r.poolNftPolicyId.length);

      // BurnPoolNFT redeemer = Constr(1, [])
      const burnNftRedeemer = PoolNFTRedeemer.Burn();

      let tx = lucid
        .newTx()
        .collectFrom([poolUtxo], PoolRedeemer.ClosePool())
        .attach.SpendingValidator(r.poolScript)
        .mintAssets({ [poolNftUnit]: -1n }, burnNftRedeemer)
        .attach.MintingPolicy(r.poolNftScript);

      // Also burn any LP tokens that remain in the pool UTxO
      const lpTokenUnit = Object.keys(poolUtxo.assets).find((unit) =>
        unit.startsWith(r.lpPolicyId),
      );
      if (lpTokenUnit && poolUtxo.assets[lpTokenUnit]) {
        const lpAmount = poolUtxo.assets[lpTokenUnit];
        const lpRedeemer = mkLPRedeemer(r.poolNftPolicyId, poolNftAssetName, -lpAmount);
        tx = tx
          .mintAssets({ [lpTokenUnit]: -lpAmount }, lpRedeemer)
          .attach.MintingPolicy(r.lpScript);
      }

      tx = tx.addSigner(params.adminAddress);

      const completed = await tx.complete({
        changeAddress: params.adminAddress,
      });

      this.logger.info({ txHash: completed.toHash() }, 'Burn pool NFT TX built');

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build burn pool NFT TX');
      throw new ChainError(`Failed to build burn pool NFT TX: ${msg}`);
    }
  }

  // 14. EXECUTE ORDER solver executes a pending order against pool

  async buildExecuteOrderTx(params: ExecuteOrderTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { solver: params.solverAddress, orderRef: params.orderUtxoRef },
      'Building execute order TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();

      // Solver wallet
      const solverUtxos = await lucid.utxosAt(params.solverAddress);
      if (solverUtxos.length === 0) {
        throw new ChainError('No UTxOs at solver address');
      }
      lucid.selectWallet.fromAddress(params.solverAddress, solverUtxos);

      // Fetch order UTxO
      const orderUtxos = await lucid.utxosByOutRef([
        { txHash: params.orderUtxoRef.txHash, outputIndex: params.orderUtxoRef.outputIndex },
      ]);
      if (orderUtxos.length === 0) {
        throw new ChainError('Order UTxO not found on-chain');
      }
      const orderUtxo = orderUtxos[0];

      // Parse order datum
      // OrderDatum = Constr(0, [order_type, owner, asset_in, asset_out, params, order_token])
      const orderDatum = Data.from(orderUtxo.datum!) as Constr<Data>;
      const odf = orderDatum.fields;
      const orderTypeConstr = odf[0] as Constr<Data>;
      const owner = odf[1] as Constr<Data>; // Plutus Address
      const assetIn = odf[2] as Constr<Data>; // AssetClass
      const assetOut = odf[3] as Constr<Data>; // AssetClass
      const orderParamsConstr = odf[4] as Constr<Data>; // OrderParams
      const orderToken = odf[5] as Constr<Data>; // AssetClass

      // Extract OrderParams fields
      const targetPriceNum = orderParamsConstr.fields[0] as bigint;
      const targetPriceDen = orderParamsConstr.fields[1] as bigint;
      const amountPerInterval = orderParamsConstr.fields[2] as bigint;
      const minInterval = orderParamsConstr.fields[3] as bigint;
      const lastFillSlot = orderParamsConstr.fields[4] as bigint;
      const remainingBudget = orderParamsConstr.fields[5] as bigint;
      const deadline = orderParamsConstr.fields[6] as bigint;

      // Determine order type: 0=Limit, 1=DCA, 2=StopLoss
      const orderTypeIdx = orderTypeConstr.index;

      // Calculate amount to consume
      let amountConsumed: bigint;
      if (orderTypeIdx === 1) {
        // DCA: consume exactly amountPerInterval (or remaining if less)
        amountConsumed = remainingBudget < amountPerInterval
          ? remainingBudget
          : amountPerInterval;
      } else {
        // Limit / StopLoss: consume all remaining budget
        amountConsumed = remainingBudget;
      }

      // Fetch pool UTxO
      const poolRefUtxos = await lucid.utxosByOutRef([
        { txHash: params.poolUtxoRef.txHash, outputIndex: params.poolUtxoRef.outputIndex },
      ]);
      if (poolRefUtxos.length === 0) {
        throw new ChainError('Pool UTxO not found for order execution');
      }
      const poolUtxo = poolRefUtxos[0];

      // Parse pool datum
      const poolDatumParsed = Data.from(poolUtxo.datum!) as Constr<Data>;
      const pdf = poolDatumParsed.fields;
      const feeNumerator = pdf[4] as bigint;
      let protocolFeesA = pdf[5] as bigint;
      let protocolFeesB = pdf[6] as bigint;

      const assetADatum = pdf[1] as Constr<Data>;
      const assetBDatum = pdf[2] as Constr<Data>;
      const assetAPolicyId = assetADatum.fields[0] as string;
      const assetAAssetName = assetADatum.fields[1] as string;
      const assetBPolicyId = assetBDatum.fields[0] as string;
      const assetBAssetName = assetBDatum.fields[1] as string;

      const unitA = assetAPolicyId === '' ? 'lovelace' : toUnit(assetAPolicyId, assetAAssetName);
      const unitB = assetBPolicyId === '' ? 'lovelace' : toUnit(assetBPolicyId, assetBAssetName);

      let reserveA = unitA === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitA] || 0n);
      let reserveB = unitB === 'lovelace'
        ? (poolUtxo.assets.lovelace || 0n)
        : (poolUtxo.assets[unitB] || 0n);

      // Determine swap direction based on order's asset_in vs pool's asset_a
      const inPolicyId = assetIn.fields[0] as string;
      const inAssetName = assetIn.fields[1] as string;
      const isInputA = inPolicyId === assetAPolicyId && inAssetName === assetAAssetName;
      const direction: 'AToB' | 'BToA' = isInputA ? 'AToB' : 'BToA';

      // Calculate output via constant product with fee
      let outputDelivered: bigint;
      if (direction === 'AToB') {
        const effectiveInput = (amountConsumed * (10000n - feeNumerator)) / 10000n;
        outputDelivered = (reserveB * effectiveInput) / (reserveA + effectiveInput);
        const protocolFee = (amountConsumed * feeNumerator / 10000n) / 6n;
        protocolFeesA += protocolFee;
        reserveA += amountConsumed;
        reserveB -= outputDelivered;
      } else {
        const effectiveInput = (amountConsumed * (10000n - feeNumerator)) / 10000n;
        outputDelivered = (reserveA * effectiveInput) / (reserveB + effectiveInput);
        const protocolFee = (amountConsumed * feeNumerator / 10000n) / 6n;
        protocolFeesB += protocolFee;
        reserveA -= outputDelivered;
        reserveB += amountConsumed;
      }

      // For Limit orders, verify price meets target
      // meets_limit_price: output_delivered * target_price_den >= amount_consumed * target_price_num
      if (orderTypeIdx === 0) {
        if (outputDelivered * targetPriceDen < amountConsumed * targetPriceNum) {
          throw new ChainError(
            'Current pool price does not meet limit order target price',
          );
        }
      }

      const isCompleteFill = amountConsumed === remainingBudget;
      const newRemainingBudget = remainingBudget - amountConsumed;

      // Build pool datum update
      const newRootK = BigInt(
        Math.floor(Math.sqrt(Number(reserveA * reserveB))),
      );
      const updatedPoolDatum = Data.to(
        new Constr(0, [
          pdf[0], pdf[1], pdf[2], pdf[3],
          feeNumerator, protocolFeesA, protocolFeesB, newRootK,
        ]),
      );

      // Build new pool assets
      const newPoolAssets: Assets = { ...poolUtxo.assets };
      if (unitA === 'lovelace') {
        newPoolAssets.lovelace = reserveA;
      } else {
        newPoolAssets[unitA] = reserveA;
      }
      if (unitB === 'lovelace') {
        newPoolAssets.lovelace = reserveB;
      } else {
        newPoolAssets[unitB] = reserveB;
      }

      // Build TX
      let tx = lucid.newTx();

      // Spend order UTxO with ExecuteOrder redeemer
      tx = tx
        .collectFrom(
          [orderUtxo],
          OrderRedeemer.ExecuteOrder(amountConsumed, outputDelivered),
        )
        .attach.SpendingValidator(r.orderScript);

      // Spend pool UTxO with Swap redeemer
      tx = tx
        .collectFrom([poolUtxo], PoolRedeemer.Swap(direction, 0n))
        .attach.SpendingValidator(r.poolScript);

      // Re-output pool
      tx = tx.pay.ToContract(
        r.poolAddr,
        { kind: 'inline', value: updatedPoolDatum },
        newPoolAssets,
      );

      // Deliver output to owner — reconstruct bech32 from Plutus Address datum
      const ownerBech32 = plutusAddressToAddress(owner, this.network);
      const outPolicyId = assetOut.fields[0] as string;
      const outAssetName = assetOut.fields[1] as string;
      const outUnit = outPolicyId === '' ? 'lovelace' : toUnit(outPolicyId, outAssetName);
      const ownerPayment: Assets = {};
      if (outUnit === 'lovelace') {
        ownerPayment.lovelace = outputDelivered;
      } else {
        ownerPayment.lovelace = MIN_SCRIPT_LOVELACE;
        ownerPayment[outUnit] = outputDelivered;
      }

      // Pay to owner address (validator checks datum.owner matches output address)
      tx = tx.pay.ToAddress(ownerBech32, ownerPayment);

      if (isCompleteFill) {
        // Burn order auth token
        const orderTokenUnit = Object.keys(orderUtxo.assets).find((unit) =>
          unit.startsWith(r.intentPolicyId),
        );
        if (orderTokenUnit) {
          tx = tx
            .mintAssets({ [orderTokenUnit]: -1n }, IntentTokenRedeemer.Burn())
            .attach.MintingPolicy(r.intentPolicyScript);
        }
      } else {
        // Partial fill continue order with updated datum
        const updatedOrderDatum = Data.to(
          new Constr(0, [
            odf[0], // order_type
            odf[1], // owner
            odf[2], // asset_in
            odf[3], // asset_out
            // Updated params
            new Constr(0, [
              targetPriceNum,
              targetPriceDen,
              amountPerInterval,
              minInterval,
              BigInt(Date.now()), // updated last_fill_slot
              newRemainingBudget, // updated remaining_budget
              deadline,
            ]),
            odf[5], // order_token
          ]),
        );

        // Re-output order with updated datum and reduced budget
        const newOrderAssets: Assets = { ...orderUtxo.assets };
        const inUnit = inPolicyId === '' ? 'lovelace' : toUnit(inPolicyId, inAssetName);
        if (inUnit === 'lovelace') {
          newOrderAssets.lovelace = newRemainingBudget + MIN_SCRIPT_LOVELACE;
        } else {
          newOrderAssets[inUnit] = newRemainingBudget;
        }

        tx = tx.pay.ToContract(
          r.orderAddr,
          { kind: 'inline', value: updatedOrderDatum },
          newOrderAssets,
        );
      }

      tx = tx
        .addSigner(params.solverAddress)
        .validTo(Number(deadline));

      const completed = await tx.complete({
        changeAddress: params.solverAddress,
      });

      this.logger.info(
        {
          txHash: completed.toHash(),
          amountConsumed: amountConsumed.toString(),
          outputDelivered: outputDelivered.toString(),
          isCompleteFill,
        },
        'Execute order TX built',
      );

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build execute order TX');
      throw new ChainError(`Failed to build execute order TX: ${msg}`);
    }
  }

  // 16. DEPLOY SETTINGS bootstrap settings UTxO

  async buildDeploySettingsTx(params: DeploySettingsTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { admin: params.adminAddress },
      'Building deploy settings TX',
    );

    try {
      const lucid = await this.getLucid();
      const bp = this.getBlueprint();

      // Load settings validator (parameterized by settings_nft: AssetClass)
      const settingsBp = findValidator(bp, 'settings_validator.settings_validator');
      const settingsScript = this.resolveSettingsScript(settingsBp);
      const settingsAddr = validatorToAddress(this.network, settingsScript);

      // Admin wallet
      const adminUtxos = await lucid.utxosAt(params.adminAddress);
      if (adminUtxos.length === 0) {
        throw new ChainError('No UTxOs at admin address');
      }
      lucid.selectWallet.fromAddress(params.adminAddress, adminUtxos);

      // Check no settings UTxO already exists
      const existingSettings = await lucid.utxosAt(settingsAddr);
      if (existingSettings.length > 0) {
        throw new ChainError('Settings UTxO already exists on-chain');
      }

      // Build SettingsDatum
      // SettingsDatum { admin, protocol_fee_bps, min_pool_liquidity,
      //                 min_intent_size, solver_bond, fee_collector, version }
      const adminDetails = getAddressDetails(params.adminAddress);
      const adminVkh = adminDetails.paymentCredential!.hash;

      const settingsDatum = Data.to(
        new Constr(0, [
          adminVkh,                                               // admin
          BigInt(params.protocolFeeBps ?? 5),                     // protocol_fee_bps (0.05%)
          params.minPoolLiquidity ?? 2_000_000n,                  // min_pool_liquidity
          params.minIntentSize ?? 1_000_000n,                     // min_intent_size (1 ADA)
          params.solverBond ?? 5_000_000n,                        // solver_bond (5 ADA)
          addressToPlutusData(params.feeCollectorAddress ?? params.adminAddress),  // fee_collector
          1n,                                                     // version
        ]),
      );

      const settingsAssets: Assets = {
        lovelace: MIN_SCRIPT_LOVELACE,
      };

      const tx = lucid
        .newTx()
        .pay.ToContract(
          settingsAddr,
          { kind: 'inline', value: settingsDatum },
          settingsAssets,
        )
        .addSigner(params.adminAddress);

      const completed = await tx.complete({
        changeAddress: params.adminAddress,
      });

      this.logger.info(
        { txHash: completed.toHash(), settingsAddr },
        'Deploy settings TX built',
      );

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build deploy settings TX');
      throw new ChainError(`Failed to build deploy settings TX: ${msg}`);
    }
  }

  async buildDeployFactoryTx(params: import('../../domain/ports/ITxBuilder.js').DeployFactoryTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { admin: params.adminAddress },
      'Building deploy factory TX',
    );

    try {
      const lucid = await this.getLucid();
      const resolved = this.getResolved();

      const factoryAddr = resolved.factoryAddr;

      // Admin wallet
      const adminUtxos = await lucid.utxosAt(params.adminAddress);
      if (adminUtxos.length === 0) {
        throw new ChainError('No UTxOs at admin address');
      }
      lucid.selectWallet.fromAddress(params.adminAddress, adminUtxos);

      // Check no factory UTxO already exists
      const existingFactory = await lucid.utxosAt(factoryAddr);
      if (existingFactory.length > 0) {
        throw new ChainError('Factory UTxO already exists on-chain');
      }

      // Build a simple factory datum — empty pool list
      // FactoryDatum { pools: List<AssetClass> }
      const factoryDatum = Data.to(new Constr(0, [[]]));

      const factoryAssets: Assets = {
        lovelace: MIN_SCRIPT_LOVELACE,
      };

      const tx = lucid
        .newTx()
        .pay.ToContract(
          factoryAddr,
          { kind: 'inline', value: factoryDatum },
          factoryAssets,
        )
        .addSigner(params.adminAddress);

      const completed = await tx.complete({
        changeAddress: params.adminAddress,
      });

      this.logger.info(
        { txHash: completed.toHash(), factoryAddr },
        'Deploy factory TX built',
      );

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build deploy factory TX');
      throw new ChainError(`Failed to build deploy factory TX: ${msg}`);
    }
  }
}
