/**
 * Debug script: Simulate TxBuilder.buildCreatePoolTx locally
 * to find exact "Cannot convert undefined to a BigInt" error.
 */
import {
  Lucid,
  Blockfrost,
  Data,
  Constr,
  toUnit,
  getAddressDetails,
  validatorToAddress,
  mintingPolicyToId,
  datumToHash,
  applyDoubleCborEncoding,
  type Script,
  type Assets,
} from '@lucid-evolution/lucid';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { requireEnv, parseArgs } from './shared.js';

function mkAssetClass(policyId: string, assetName: string): Constr<any> {
  return new Constr(0, [policyId, assetName]);
}

interface PlutusBlueprint {
  preamble: any;
  validators: Array<{
    title: string;
    hash: string;
    compiledCode: string;
    datum?: any;
    redeemer?: any;
  }>;
}

function loadBlueprint(): PlutusBlueprint {
  const candidates = [
    resolve(process.cwd(), '..', '..', 'smartcontract', 'plutus.json'),
    resolve(process.cwd(), '..', 'smartcontract', 'plutus.json'),
    resolve(process.cwd(), 'smartcontract', 'plutus.json'),
  ];
  for (const p of candidates) {
    try {
      console.log(`  Trying blueprint: ${p}`);
      const bp = JSON.parse(readFileSync(p, 'utf-8'));
      console.log(`  ✅ Loaded from: ${p}`);
      return bp;
    } catch {
      // try next
    }
  }
  throw new Error('Cannot load plutus.json');
}

function findValidator(bp: PlutusBlueprint, titlePrefix: string) {
  const exact = bp.validators.find((v) => v.title === titlePrefix);
  if (exact) return exact;
  const prefix = bp.validators.find((v) => v.title.startsWith(titlePrefix));
  if (prefix) return prefix;
  throw new Error(`Validator "${titlePrefix}" not found. Available: ${bp.validators.map((v) => v.title).join(', ')}`);
}

class AssetId {
  constructor(public readonly policyId: string, public readonly assetName: string) {}
  get id() {
    if (this.policyId === '' && this.assetName === '') return 'lovelace';
    return `${this.policyId}.${this.assetName}`;
  }
  get isAda() {
    return this.policyId === '' && this.assetName === '';
  }
  static fromString(id: string) {
    if (id === 'lovelace') return new AssetId('', '');
    const parts = id.split('.');
    return new AssetId(parts[0] ?? '', parts[1] ?? '');
  }
}

const MIN_SCRIPT_LOVELACE = 2_000_000n;

async function main() {
  const args = parseArgs();
  const assetAStr = args.assetA || 'lovelace';
  const assetBStr = args.assetB || '';
  const amountA = BigInt(args.amountA || '50000000');
  const amountB = BigInt(args.amountB || '100000000');
  const feeNumerator = Number(args.fee || '30');

  if (!assetBStr) {
    console.error('Usage: npx tsx src/debug-create-pool.ts --assetB=<policyId.assetName>');
    process.exit(1);
  }

  console.log('\n🔍 Debug: Simulating TxBuilder.buildCreatePoolTx locally\n');

  // Step 1: Initialize Lucid
  console.log('Step 1: Initializing Lucid...');
  const seed = requireEnv('WALLET_SEED');
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  console.log(`  Address: ${address}`);

  // Step 2: Load blueprint
  console.log('\nStep 2: Loading blueprint...');
  const bp = loadBlueprint();
  console.log(`  Validators: ${bp.validators.map((v) => v.title).join(', ')}`);

  // Step 3: Load validators
  console.log('\nStep 3: Loading pool validators...');
  try {
    const poolBp = findValidator(bp, 'pool_validator.pool_validator');
    console.log(`  pool_validator: hash=${poolBp.hash}, code=${poolBp.compiledCode.slice(0, 40)}...`);
    const poolScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(poolBp.compiledCode) };
    const poolAddr = validatorToAddress(network, poolScript);
    console.log(`  Pool address: ${poolAddr}`);

    const factoryBp = findValidator(bp, 'factory_validator.factory_validator');
    console.log(`  factory_validator: hash=${factoryBp.hash}`);

    const poolNftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
    const poolNftScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(poolNftBp.compiledCode) };
    const poolNftPolicyId = mintingPolicyToId(poolNftScript);
    console.log(`  Pool NFT policy: ${poolNftPolicyId}`);

    const lpBp = findValidator(bp, 'lp_token_policy.lp_token_policy');
    const lpScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(lpBp.compiledCode) };
    const lpPolicyId = mintingPolicyToId(lpScript);
    console.log(`  LP token policy: ${lpPolicyId}`);

    // Step 4: Parse assets
    console.log('\nStep 4: Parsing assets...');
    const assetA = AssetId.fromString(assetAStr);
    const assetB = AssetId.fromString(assetBStr);
    console.log(`  assetA: policyId="${assetA.policyId}", assetName="${assetA.assetName}", isAda=${assetA.isAda}`);
    console.log(`  assetB: policyId="${assetB.policyId}", assetName="${assetB.assetName}", isAda=${assetB.isAda}`);

    // Step 5: Get UTxOs
    console.log('\nStep 5: Fetching UTxOs...');
    const userUtxos = await lucid.utxosAt(address);
    console.log(`  UTxO count: ${userUtxos.length}`);
    if (userUtxos.length === 0) throw new Error('No UTxOs');

    const seedUtxo = userUtxos[0];
    console.log(`  Seed UTxO: txHash=${seedUtxo.txHash}, outputIndex=${seedUtxo.outputIndex}`);
    console.log(`  typeof outputIndex: ${typeof seedUtxo.outputIndex}`);

    // Step 6: Build outRefDatum
    console.log('\nStep 6: Building outRefDatum...');
    console.log(`  BigInt(seedUtxo.outputIndex) = ${BigInt(seedUtxo.outputIndex)}`);
    const outRefDatum = Data.to(
      new Constr(0, [new Constr(0, [seedUtxo.txHash]), BigInt(seedUtxo.outputIndex)]),
    );
    console.log(`  outRefDatum CBOR: ${outRefDatum.slice(0, 60)}...`);

    // Step 7: datumToHash
    console.log('\nStep 7: datumToHash...');
    const poolNftNameHex = datumToHash(outRefDatum);
    console.log(`  poolNftNameHex: ${poolNftNameHex}`);
    console.log(`  typeof: ${typeof poolNftNameHex}`);

    const poolNftUnit = toUnit(poolNftPolicyId, poolNftNameHex);
    const lpTokenUnit = toUnit(lpPolicyId, poolNftNameHex);
    console.log(`  poolNftUnit: ${poolNftUnit}`);
    console.log(`  lpTokenUnit: ${lpTokenUnit}`);

    // Step 8: Calculate LP tokens
    console.log('\nStep 8: Calculating initial LP...');
    const sqrtAB = BigInt(Math.floor(Math.sqrt(Number(amountA * amountB))));
    const initialLp = sqrtAB - 1000n;
    console.log(`  amountA*amountB = ${amountA * amountB}`);
    console.log(`  sqrtAB = ${sqrtAB}`);
    console.log(`  initialLp = ${initialLp}`);

    // Step 9: Build PoolDatum
    console.log('\nStep 9: Building PoolDatum...');
    const datumFields = [
      mkAssetClass(poolNftPolicyId, poolNftNameHex),
      mkAssetClass(assetA.policyId, assetA.assetName),
      mkAssetClass(assetB.policyId, assetB.assetName),
      initialLp,
      BigInt(feeNumerator),
      0n,
      0n,
      sqrtAB,
    ];
    console.log('  Datum fields:');
    datumFields.forEach((f, i) => {
      console.log(`    [${i}]: type=${typeof f}, value=${f instanceof Constr ? `Constr(${f.index}, [...])` : String(f)}`);
    });

    const poolDatumCbor = Data.to(new Constr(0, datumFields));
    console.log(`  PoolDatum CBOR: ${poolDatumCbor.slice(0, 60)}...`);

    // Step 10: Build pool assets
    console.log('\nStep 10: Building pool assets...');
    const poolAssets: Assets = {
      lovelace: MIN_SCRIPT_LOVELACE,
      [poolNftUnit]: 1n,
    };
    const unitA = assetA.isAda ? 'lovelace' : toUnit(assetA.policyId, assetA.assetName);
    const unitB = assetB.isAda ? 'lovelace' : toUnit(assetB.policyId, assetB.assetName);
    console.log(`  unitA: ${unitA}`);
    console.log(`  unitB: ${unitB}`);
    if (unitA === 'lovelace') {
      poolAssets.lovelace += amountA;
    } else {
      poolAssets[unitA] = amountA;
    }
    if (unitB === 'lovelace') {
      poolAssets.lovelace += amountB;
    } else {
      poolAssets[unitB] = amountB;
    }
    console.log('  Pool assets:', Object.entries(poolAssets).map(([k, v]) => `${k.slice(0, 20)}...=${v}`).join(', '));

    // Step 11: Build factory redeemer
    console.log('\nStep 11: Building factory redeemer...');
    const factoryRedeemer = Data.to(
      new Constr(0, [
        mkAssetClass(assetA.policyId, assetA.assetName),
        mkAssetClass(assetB.policyId, assetB.assetName),
        amountA,
        amountB,
        BigInt(feeNumerator),
      ]),
    );
    console.log(`  Factory redeemer: ${factoryRedeemer.slice(0, 60)}...`);

    // Step 12: Mint redeemers
    console.log('\nStep 12: Building mint redeemers...');
    const poolNftRedeemer = Data.to(
      new Constr(0, [new Constr(0, [new Constr(0, [seedUtxo.txHash]), BigInt(seedUtxo.outputIndex)])]),
    );
    console.log(`  PoolNFT redeemer: ${poolNftRedeemer.slice(0, 60)}...`);

    const lpRedeemer = Data.to(
      new Constr(0, [mkAssetClass(poolNftPolicyId, poolNftNameHex), initialLp]),
    );
    console.log(`  LP redeemer: ${lpRedeemer.slice(0, 60)}...`);

    // Step 13: Build complete transaction
    console.log('\nStep 13: Building transaction...');
    const factoryScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(factoryBp.compiledCode) };
    const factoryAddr = validatorToAddress(network, factoryScript);
    const factoryUtxos = await lucid.utxosAt(factoryAddr);
    console.log(`  Factory UTxOs: ${factoryUtxos.length}`);

    let tx = lucid.newTx().collectFrom([seedUtxo]);

    if (factoryUtxos.length > 0) {
      tx = tx
        .collectFrom([factoryUtxos[0]], factoryRedeemer)
        .attach.SpendingValidator(factoryScript);
    }

    tx = tx
      .mintAssets({ [poolNftUnit]: 1n }, poolNftRedeemer)
      .attach.MintingPolicy(poolNftScript)
      .mintAssets({ [lpTokenUnit]: initialLp }, lpRedeemer)
      .attach.MintingPolicy(lpScript)
      .pay.ToContract(
        poolAddr,
        { kind: 'inline', value: poolDatumCbor },
        poolAssets,
      )
      .addSigner(address);

    console.log('  TX builder assembled, completing...');

    const completed = await tx.complete({ changeAddress: address });
    console.log(`  TX completed! Hash: ${completed.toHash()}`);
    console.log(`  CBOR length: ${completed.toCBOR().length}`);

    // Step 14: Sign and submit
    console.log('\nStep 14: Signing and submitting...');
    const signed = await completed.sign.withWallet().complete();
    const txHash = await signed.submit();
    console.log(`\n✅ Pool created! TX: ${txHash}`);
    console.log(`   Explorer: https://preprod.cardanoscan.io/transaction/${txHash}`);
  } catch (error: any) {
    console.error(`\n❌ Error at step: ${error.message}`);
    console.error(error.stack);
  }
}

main().catch(console.error);
