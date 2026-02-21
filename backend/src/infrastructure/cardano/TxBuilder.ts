/**
 * Transaction Builder — Lucid Evolution implementation
 * Constructs unsigned Cardano transactions for all protocol operations.
 *
 * Uses @lucid-evolution/lucid v0.4 with Blockfrost provider on Preprod.
 * Reads compiled validators from smartcontract/plutus.json (Aiken CIP-57 blueprint).
 *
 * Flow: Backend builds unsigned TX → returns CBOR hex → frontend signs via CIP-30.
 */
import {
  Lucid,
  Blockfrost,
  Data,
  Constr,
  toUnit,
  getAddressDetails,
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
  BuildTxResult,
} from '../../domain/ports/ITxBuilder.js';
import { getLogger } from '../../config/logger.js';
import { ChainError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Plutus Blueprint Types ──────────────────

interface BlueprintValidator {
  title: string;
  compiledCode: string;
  hash: string;
}

interface PlutusBlueprint {
  preamble: { title: string; version: string };
  validators: BlueprintValidator[];
}

// ─── Script Resolver ─────────────────────────
// Resolves parameterized validators from the Aiken blueprint
// in DAG order (no circular dependencies).
//
// Resolution order:
// 1. escrow_validator (no params) → escrow_hash
// 2. pool_validator(admin_vkh) → pool_hash
// 3. intent_token_policy(escrow_hash) → intent_policy_id
// 4. factory_validator(pool_hash) → factory_hash
// 5. lp_token_policy(pool_hash, factory_hash) → lp_id
// 6. pool_nft_policy(factory_hash, admin_vkh) → nft_id
// 7. order_validator(intent_policy_id)
// 8. settings_validator(settings_nft) — deferred

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
  // Step 1: escrow_validator — NO parameters
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

  // Step 3: intent_token_policy — NO parameters (standalone one-shot policy)
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

// ─── Datum / Redeemer helpers ────────────────
// These mirror Aiken types from lib/solvernet/types.ak

/** AssetClass { policy_id, asset_name } — Constr(0, [bytes, bytes]) */
function mkAssetClass(policyId: string, assetName: string): Constr<Data> {
  return new Constr(0, [policyId, assetName]);
}

/** Convert Address bech32 → Plutus Address data (payment cred, optional stake cred) */
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

/** PoolNFTRedeemer — MintPoolNFT { consumed_utxo } | BurnPoolNFT */
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

/** Build OrderParams datum — 7 flat fields matching Aiken OrderParams */
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

// ─── Utilities ───────────────────────────────

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

// ═══════════════════════════════════════════════
// TxBuilder
// ═══════════════════════════════════════════════

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

  // ── Lazy init ──────────────────────────────

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

  // ═══════════════════════════════════════════
  // 1. CREATE INTENT — lock funds in escrow
  // ═══════════════════════════════════════════

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
        throw new ChainError('No UTxOs at sender address — wallet may be empty');
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

  // ═══════════════════════════════════════════
  // 2. CANCEL INTENT — owner reclaims from escrow
  // ═══════════════════════════════════════════

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

  // ═══════════════════════════════════════════
  // 3. CREATE POOL — factory + NFT + LP mint
  // ═══════════════════════════════════════════

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

      return {
        unsignedTx: completed.toCBOR(),
        txHash: completed.toHash(),
        estimatedFee: 0n,
        poolMeta: {
          poolNftPolicyId: r.poolNftPolicyId,
          poolNftAssetName: poolNftNameHex,
          lpPolicyId: r.lpPolicyId,
          initialLp,
        },
      };
    } catch (error) {
      if (error instanceof ChainError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to build create pool TX');
      throw new ChainError(`Failed to build create pool TX: ${msg}`);
    }
  }

  // ═══════════════════════════════════════════
  // 4. DEPOSIT LIQUIDITY — LP mint
  // ═══════════════════════════════════════════

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
        throw new ChainError('Deposit amounts too small — LP tokens to mint would be 0');
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

  // ═══════════════════════════════════════════
  // 5. WITHDRAW LIQUIDITY — LP burn
  // ═══════════════════════════════════════════

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

  // ═══════════════════════════════════════════
  // 6. SETTLEMENT — solver batch fills intents
  // ═══════════════════════════════════════════

  async buildSettlementTx(params: SettlementTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { intentCount: params.intentUtxoRefs.length },
      'Building settlement TX',
    );

    try {
      const lucid = await this.getLucid();
      const r = this.getResolved();
      const { escrowScript, intentPolicyScript, intentPolicyId } =
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

      // Select solver wallet
      const solverUtxos = await lucid.utxosAt(params.solverAddress);
      lucid.selectWallet.fromAddress(params.solverAddress, solverUtxos);

      let tx = lucid.newTx();

      // Collect each escrow UTxO with Fill redeemer + burn their intent tokens
      const burnAssets: Assets = {};
      for (const eu of escrowUtxos) {
        tx = tx.collectFrom(
          [eu],
          EscrowRedeemer.Fill(0n, 0n),
        );
        // Find and burn intent token
        for (const unit of Object.keys(eu.assets)) {
          if (unit.startsWith(intentPolicyId)) {
            burnAssets[unit] = (burnAssets[unit] || 0n) - 1n;
          }
        }
      }
      tx = tx.attach.SpendingValidator(escrowScript);

      // Burn intent tokens
      if (Object.keys(burnAssets).length > 0) {
        tx = tx
          .mintAssets(burnAssets, IntentTokenRedeemer.Burn())
          .attach.MintingPolicy(intentPolicyScript);
      }

      // Consume pool UTxO with Swap redeemer
      tx = tx
        .collectFrom([poolUtxo], PoolRedeemer.Swap('AToB', 0n))
        .attach.SpendingValidator(r.poolScript);

      // Re-output pool
      tx = tx.pay.ToContract(
        r.poolAddr,
        { kind: 'inline', value: poolUtxo.datum! },
        poolUtxo.assets,
      );

      tx = tx.addSigner(params.solverAddress);

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

  // ═══════════════════════════════════════════
  // 7. CREATE ORDER — lock funds in order validator
  // ═══════════════════════════════════════════

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

  // ═══════════════════════════════════════════
  // 8. CANCEL ORDER — owner reclaims from order validator
  // ═══════════════════════════════════════════

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

  // ═══════════════════════════════════════════
  // 9. RECLAIM — permissionless reclaim of expired escrow
  // ═══════════════════════════════════════════

  async buildReclaimTx(params: ReclaimTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { escrowTxHash: params.escrowTxHash, ownerAddress: params.ownerAddress },
      'Building reclaim TX for expired escrow',
    );

    try {
      const lucid = await this.getLucid();
      const { escrowScript, escrowAddr, intentPolicyScript, intentPolicyId } =
        this.getEscrowScripts();

      // Keeper pays fees — select keeper UTxOs
      const keeperUtxos = await lucid.utxosAt(params.keeperAddress);
      if (keeperUtxos.length === 0) {
        throw new ChainError('No UTxOs at keeper address — keeper wallet may be empty');
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
        throw new ChainError('Escrow UTxO has no intent token — cannot reclaim');
      }

      // Parse the inline datum to extract owner + remaining input info
      // We need the datum to compute the owner payment output.
      // The escrow datum is inline, so we can read from the UTxO.
      // For now, we build the TX and let the validator+Lucid resolve it via datum.
      //
      // The validator requires:
      //  1. check_after_deadline — set validFrom to now (after deadline)
      //  2. check_burn_one — burn the intent token
      //  3. check_payment_output — remaining input to owner
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

  // ═══════════════════════════════════════════
  // 10. COLLECT FEES — admin collects protocol fees from pool(s)
  // ═══════════════════════════════════════════

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

      let tx = lucid.newTx();

      for (const _poolId of params.poolIds) {
        // Find pool UTxO by its NFT
        const poolUtxo = allPoolUtxos.find((u) =>
          Object.keys(u.assets).some((unit) => unit.startsWith(r.poolNftPolicyId)),
        );

        if (!poolUtxo) {
          this.logger.warn({ poolId: _poolId }, 'Pool UTxO not found, skipping');
          continue;
        }

        // Collect from pool with CollectFees redeemer
        tx = tx
          .collectFrom([poolUtxo], PoolRedeemer.CollectFees())
          .attach.SpendingValidator(r.poolScript);

        tx = tx.pay.ToContract(
          r.poolAddr,
          { kind: 'inline', value: poolUtxo.datum! },
          poolUtxo.assets,
        );
      }

      tx = tx.addSigner(params.adminAddress);

      const completed = await tx.complete({
        changeAddress: params.adminAddress,
      });

      this.logger.info({ txHash: completed.toHash() }, 'Collect fees TX built');

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

  // ═══════════════════════════════════════════
  // 11. UPDATE SETTINGS — admin updates global protocol settings
  // ═══════════════════════════════════════════

  async buildUpdateSettingsTx(params: UpdateSettingsTxParams): Promise<BuildTxResult> {
    this.logger.info(
      { admin: params.adminAddress, settings: params.newSettings },
      'Building update settings TX',
    );

    try {
      const lucid = await this.getLucid();
      const bp = this.getBlueprint();

      // Load settings validator
      const settingsBp = findValidator(bp, 'settings_validator.settings_validator');
      const settingsScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(settingsBp.compiledCode),
      };
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

  // ═══════════════════════════════════════════
  // 12. UPDATE FACTORY ADMIN — transfer factory admin to new VKH
  // ═══════════════════════════════════════════

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

      // Build new FactoryDatum with updated admin VKH
      const newFactoryDatum = Data.to(
        new Constr(0, [
          new Constr(0, ['', '']),  // factory_nft (preserved from existing)
          0n,                       // pool_count (preserved)
          params.newAdminVkh,       // new admin VKH
          new Constr(0, ['', '']),  // settings_utxo (preserved)
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

  // ═══════════════════════════════════════════
  // 13. BURN POOL NFT — admin closes pool by burning NFT
  // ═══════════════════════════════════════════

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
}
