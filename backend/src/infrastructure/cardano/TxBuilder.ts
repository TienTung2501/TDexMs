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
};

/** IntentTokenRedeemer matching Aiken types:
 *  MintIntentToken { consumed_utxo: OutputReference }
 *  BurnIntentToken
 */
const IntentTokenRedeemer = {
  Mint: (txHash: string, outputIndex: bigint) =>
    Data.to(
      new Constr(0, [new Constr(0, [new Constr(0, [txHash]), outputIndex])]),
    ),
  Burn: () => Data.to(new Constr(1, [])),
};

/** PoolNFTRedeemer — MintPoolNFT { consumed_utxo } | BurnPoolNFT */
const PoolNFTRedeemer = {
  Mint: (txHash: string, outputIndex: bigint) =>
    Data.to(
      new Constr(0, [new Constr(0, [new Constr(0, [txHash]), outputIndex])]),
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

/** Build OrderParams datum */
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
    new Constr(0, [p.priceNum, p.priceDen]),
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

  // Cached scripts
  private escrowScript: Script | null = null;
  private escrowAddr: string | null = null;
  private intentPolicyScript: Script | null = null;
  private intentPolicyId: string | null = null;

  constructor(
    private readonly networkId: 'preprod' | 'preview' | 'mainnet',
    private readonly blockfrostUrl: string,
    private readonly blockfrostProjectId: string,
  ) {
    this.logger = getLogger().child({ service: 'tx-builder' });
    this.network = networkId === 'mainnet' ? 'Mainnet' : 'Preprod';
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

  /** Build or retrieve the escrow validator + intent minting policy. */
  private getEscrowScripts(): {
    escrowScript: Script;
    escrowAddr: string;
    intentPolicyScript: Script;
    intentPolicyId: string;
  } {
    if (
      this.escrowScript &&
      this.escrowAddr &&
      this.intentPolicyScript &&
      this.intentPolicyId
    ) {
      return {
        escrowScript: this.escrowScript,
        escrowAddr: this.escrowAddr,
        intentPolicyScript: this.intentPolicyScript,
        intentPolicyId: this.intentPolicyId,
      };
    }

    const bp = this.getBlueprint();

    // --- Intent token policy (parameterized with escrow_validator_hash) ---
    const intentBp = findValidator(bp, 'intent_token_policy.intent_token_policy');
    // The escrow validator (parameterized with intent_token_policy_id) — circular dep.
    // Resolve: use the un-applied compiled code first to derive hashes,
    // then apply params to get the final scripts.
    const escrowBp = findValidator(bp, 'escrow_validator.escrow_validator');

    // Step 1: Build intent policy with escrow hash placeholder → derive its hash
    // Step 2: Apply that hash as param to escrow validator
    // Step 3: Re-derive escrow hash → apply to intent policy
    //
    // In practice the Aiken compiler already applied params during codegen
    // if they were hardcoded. For blueprint validators with `parameters`,
    // the compiledCode is un-applied UPLC. We apply params via applyParamsToScript.
    //
    // However for this project, let's first try using the compiled code directly
    // (the blueprint hashes are pre-computed by Aiken).
    // If the validators are truly parameterized and need runtime application,
    // we would use applyParamsToScript. Let's handle both cases.

    // Use the compiled code directly as PlutusV3 scripts.
    // The blueprint hash is what we need for address derivation.
    this.escrowScript = {
      type: 'PlutusV3',
      script: applyDoubleCborEncoding(escrowBp.compiledCode),
    };

    this.intentPolicyScript = {
      type: 'PlutusV3',
      script: applyDoubleCborEncoding(intentBp.compiledCode),
    };

    this.intentPolicyId = mintingPolicyToId(this.intentPolicyScript);
    this.escrowAddr = validatorToAddress(this.network, this.escrowScript);

    this.logger.info(
      {
        escrowAddr: this.escrowAddr,
        intentPolicyId: this.intentPolicyId,
        escrowHash: escrowBp.hash,
      },
      'Initialized escrow scripts',
    );

    return {
      escrowScript: this.escrowScript,
      escrowAddr: this.escrowAddr,
      intentPolicyScript: this.intentPolicyScript,
      intentPolicyId: this.intentPolicyId,
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
      const outRefDatum = Data.to(
        new Constr(0, [new Constr(0, [seedUtxo.txHash]), BigInt(seedUtxo.outputIndex)]),
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
      const bp = this.getBlueprint();

      // Load all pool-related scripts
      const poolBp = findValidator(bp, 'pool_validator.pool_validator');
      const poolScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolBp.compiledCode),
      };
      const poolAddr = validatorToAddress(this.network, poolScript);

      const factoryBp = findValidator(bp, 'factory_validator.factory_validator');
      const factoryScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(factoryBp.compiledCode),
      };
      const factoryAddr = validatorToAddress(this.network, factoryScript);

      const poolNftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
      const poolNftScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolNftBp.compiledCode),
      };
      const poolNftPolicyId = mintingPolicyToId(poolNftScript);

      const lpBp = findValidator(bp, 'lp_token_policy.lp_token_policy');
      const lpScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(lpBp.compiledCode),
      };
      const lpPolicyId = mintingPolicyToId(lpScript);

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
      const outRefDatum = Data.to(
        new Constr(0, [new Constr(0, [seedUtxo.txHash]), BigInt(seedUtxo.outputIndex)]),
      );
      const poolNftNameHex = datumToHash(outRefDatum);
      const poolNftUnit = toUnit(poolNftPolicyId, poolNftNameHex);
      const lpTokenUnit = toUnit(lpPolicyId, poolNftNameHex);

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
          mkAssetClass(poolNftPolicyId, poolNftNameHex), // pool_nft
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
      const factoryUtxos = await lucid.utxosAt(factoryAddr);

      let tx = lucid.newTx().collectFrom([seedUtxo]);

      if (factoryUtxos.length > 0) {
        tx = tx
          .collectFrom([factoryUtxos[0]], factoryRedeemer)
          .attach.SpendingValidator(factoryScript);
      }

      tx = tx
        .mintAssets(
          { [poolNftUnit]: 1n },
          PoolNFTRedeemer.Mint(
            seedUtxo.txHash,
            BigInt(seedUtxo.outputIndex),
          ),
        )
        .attach.MintingPolicy(poolNftScript)
        .mintAssets(
          { [lpTokenUnit]: initialLp },
          mkLPRedeemer(poolNftPolicyId, poolNftNameHex, initialLp),
        )
        .attach.MintingPolicy(lpScript)
        .pay.ToContract(
          poolAddr,
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
      const bp = this.getBlueprint();

      const poolBp = findValidator(bp, 'pool_validator.pool_validator');
      const poolScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolBp.compiledCode),
      };
      const poolAddr = validatorToAddress(this.network, poolScript);

      const lpBp = findValidator(bp, 'lp_token_policy.lp_token_policy');
      const lpScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(lpBp.compiledCode),
      };
      const lpPolicyId = mintingPolicyToId(lpScript);

      const poolNftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
      const poolNftScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolNftBp.compiledCode),
      };
      const poolNftPolicyId = mintingPolicyToId(poolNftScript);

      // User wallet
      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find pool UTxO
      const poolUtxos = await lucid.utxosAt(poolAddr);
      if (poolUtxos.length === 0) {
        throw new ChainError('No pool UTxOs found on-chain');
      }

      // Select pool by its NFT
      const poolUtxo = poolUtxos.find((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(poolNftPolicyId)),
      );
      if (!poolUtxo) {
        throw new ChainError('Pool UTxO with NFT not found');
      }

      // Extract pool NFT asset name
      const poolNftUnit = Object.keys(poolUtxo.assets).find((unit) =>
        unit.startsWith(poolNftPolicyId),
      )!;
      const poolNftAssetName = poolNftUnit.slice(poolNftPolicyId.length);
      const lpTokenUnit = toUnit(lpPolicyId, poolNftAssetName);

      // New pool output: existing assets + deposited amounts
      const newPoolAssets: Assets = { ...poolUtxo.assets };
      // amountA and amountB need to be added to the correct slots.
      // The use-case passes generic amounts; we add them as lovelace + native.
      // In a production system, we'd parse the pool datum to know asset_a and asset_b.
      newPoolAssets.lovelace = (newPoolAssets.lovelace || 0n) + params.amountA;
      // For multi-asset pools, amountB goes to the other token.

      // Keep the existing datum (pool validator checks datum continuity)
      const existingDatum = poolUtxo.datum!;

      const tx = lucid
        .newTx()
        .collectFrom([poolUtxo], PoolRedeemer.Deposit(params.minLpTokens))
        .attach.SpendingValidator(poolScript)
        .mintAssets(
          { [lpTokenUnit]: params.minLpTokens },
          mkLPRedeemer(poolNftPolicyId, poolNftAssetName, params.minLpTokens),
        )
        .attach.MintingPolicy(lpScript)
        .pay.ToContract(
          poolAddr,
          { kind: 'inline', value: existingDatum },
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
      const bp = this.getBlueprint();

      const poolBp = findValidator(bp, 'pool_validator.pool_validator');
      const poolScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolBp.compiledCode),
      };
      const poolAddr = validatorToAddress(this.network, poolScript);

      const lpBp = findValidator(bp, 'lp_token_policy.lp_token_policy');
      const lpScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(lpBp.compiledCode),
      };
      const lpPolicyId = mintingPolicyToId(lpScript);

      const poolNftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
      const poolNftScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolNftBp.compiledCode),
      };
      const poolNftPolicyId = mintingPolicyToId(poolNftScript);

      // User wallet
      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find pool UTxO
      const poolUtxos = await lucid.utxosAt(poolAddr);
      const poolUtxo = poolUtxos.find((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(poolNftPolicyId)),
      );
      if (!poolUtxo) {
        throw new ChainError('Pool UTxO with NFT not found');
      }

      // Extract pool NFT asset name
      const poolNftUnit = Object.keys(poolUtxo.assets).find((unit) =>
        unit.startsWith(poolNftPolicyId),
      )!;
      const poolNftAssetName = poolNftUnit.slice(poolNftPolicyId.length);
      const lpTokenUnit = toUnit(lpPolicyId, poolNftAssetName);

      // Pool output after withdrawal (validator enforces proportional reduction)
      const newPoolAssets: Assets = { ...poolUtxo.assets };

      // Burn LP tokens
      const lpRedeemer = mkLPRedeemer(
        poolNftPolicyId,
        poolNftAssetName,
        -params.lpTokenAmount,
      );

      const tx = lucid
        .newTx()
        .collectFrom(
          [poolUtxo],
          PoolRedeemer.Withdraw(params.lpTokenAmount),
        )
        .attach.SpendingValidator(poolScript)
        .mintAssets({ [lpTokenUnit]: -params.lpTokenAmount }, lpRedeemer)
        .attach.MintingPolicy(lpScript)
        .pay.ToContract(
          poolAddr,
          { kind: 'inline', value: poolUtxo.datum! },
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
      const bp = this.getBlueprint();
      const { escrowScript, intentPolicyScript, intentPolicyId } =
        this.getEscrowScripts();

      const poolBp = findValidator(bp, 'pool_validator.pool_validator');
      const poolScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolBp.compiledCode),
      };

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
        // TODO: Parse datum to calculate exact fill amounts
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
        .attach.SpendingValidator(poolScript);

      // Re-output pool (validator ensures continuity)
      const poolNftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
      const poolNftScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(poolNftBp.compiledCode),
      };
      const poolAddr = validatorToAddress(this.network, poolScript);
      tx = tx.pay.ToContract(
        poolAddr,
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
      const bp = this.getBlueprint();

      // Load order validator scripts
      const orderBp = findValidator(bp, 'order_validator.order_validator');
      const orderScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(orderBp.compiledCode),
      };
      const orderAddr = validatorToAddress(this.network, orderScript);

      // Reuse intent token policy for order auth tokens
      const { intentPolicyScript, intentPolicyId } = this.getEscrowScripts();

      const userUtxos = await lucid.utxosAt(params.senderAddress);
      if (userUtxos.length === 0) {
        throw new ChainError('No UTxOs at sender address');
      }
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      const seedUtxo = userUtxos[0];

      // Derive order token name via hash of consumed UTxO
      const outRefDatum = Data.to(
        new Constr(0, [new Constr(0, [seedUtxo.txHash]), BigInt(seedUtxo.outputIndex)]),
      );
      const tokenNameHex = datumToHash(outRefDatum);
      const orderTokenUnit = toUnit(intentPolicyId, tokenNameHex);

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
        orderToken: mkAssetClass(intentPolicyId, tokenNameHex),
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
        .attach.MintingPolicy(intentPolicyScript)
        .pay.ToContract(
          orderAddr,
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
      const bp = this.getBlueprint();

      const orderBp = findValidator(bp, 'order_validator.order_validator');
      const orderScript: Script = {
        type: 'PlutusV3',
        script: applyDoubleCborEncoding(orderBp.compiledCode),
      };
      const orderAddr = validatorToAddress(this.network, orderScript);

      const { intentPolicyScript, intentPolicyId } = this.getEscrowScripts();

      const userUtxos = await lucid.utxosAt(params.senderAddress);
      lucid.selectWallet.fromAddress(params.senderAddress, userUtxos);

      // Find order UTxO by txHash + outputIndex
      const orderUtxos = await lucid.utxosAt(orderAddr);
      const orderUtxo = orderUtxos.find(
        (u) => u.txHash === params.escrowTxHash && u.outputIndex === params.escrowOutputIndex,
      );

      if (!orderUtxo) {
        throw new ChainError('Order UTxO not found on-chain');
      }

      // Find and burn order auth token
      const orderTokenUnit = Object.keys(orderUtxo.assets).find((unit) =>
        unit.startsWith(intentPolicyId),
      );

      const burnAssets: Assets = {};
      if (orderTokenUnit) {
        burnAssets[orderTokenUnit] = -1n;
      }

      let tx = lucid
        .newTx()
        .collectFrom([orderUtxo], OrderRedeemer.CancelOrder())
        .attach.SpendingValidator(orderScript)
        .addSigner(params.senderAddress);

      if (Object.keys(burnAssets).length > 0) {
        tx = tx
          .mintAssets(burnAssets, IntentTokenRedeemer.Burn())
          .attach.MintingPolicy(intentPolicyScript);
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
}
