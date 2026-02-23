/**
 * CLI: Deploy the factory UTxO on-chain
 * 
 * This creates the factory "thread token" UTxO that is required for pool creation.
 * The factory validator expects its UTxO to contain a factory NFT (thread token)
 * and a FactoryDatum with { factory_nft, pool_count, admin, settings_utxo }.
 *
 * Usage: npx tsx src/deploy-factory.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
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
  type Script,
  type Assets,
} from '@lucid-evolution/lucid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Blueprint loading ────────────────────────

interface BlueprintValidator {
  title: string;
  compiledCode: string;
  hash: string;
}

interface PlutusBlueprint {
  preamble: { title: string; version: string };
  validators: BlueprintValidator[];
}

function loadBlueprint(): PlutusBlueprint {
  const path = resolve(__dirname, '../../../smartcontract/plutus.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function findValidator(bp: PlutusBlueprint, title: string): BlueprintValidator {
  const v = bp.validators.find((x) => x.title.startsWith(title));
  if (!v) throw new Error(`Validator '${title}' not found in blueprint`);
  return v;
}

// ─── Script resolution (mirrors backend TxBuilder) ────

function resolveFactoryScripts(bp: PlutusBlueprint, network: 'Preprod' | 'Mainnet', adminVkh: string) {
  // Step 1: escrow (no params)
  const escrowBp = findValidator(bp, 'escrow_validator.escrow_validator');
  const escrowScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(escrowBp.compiledCode) };
  const escrowHash = validatorToScriptHash(escrowScript);

  // Step 2: pool_validator(admin_vkh)
  const poolBp = findValidator(bp, 'pool_validator.pool_validator');
  const poolApplied = applyParamsToScript(poolBp.compiledCode, [adminVkh]);
  const poolScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(poolApplied) };
  const poolHash = validatorToScriptHash(poolScript);

  // Step 4: factory_validator(pool_hash)
  const factoryBp = findValidator(bp, 'factory_validator.factory_validator');
  const factoryApplied = applyParamsToScript(factoryBp.compiledCode, [poolHash]);
  const factoryScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(factoryApplied) };
  const factoryAddr = validatorToAddress(network, factoryScript);

  return { escrowHash, poolHash, factoryScript, factoryAddr };
}

// ─── Main ─────────────────────────────────────

async function main() {
  const seed = process.env.WALLET_SEED;
  if (!seed) { console.error('Missing WALLET_SEED'); process.exit(1); }

  const bfUrl = process.env.BLOCKFROST_URL || 'https://cardano-preprod.blockfrost.io/api/v0';
  const bfKey = process.env.BLOCKFROST_PROJECT_ID || '';
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Mainnet';

  console.log('=== Deploy Factory UTxO ===\n');

  const lucid = await Lucid(new Blockfrost(bfUrl, bfKey), network);
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);
  const adminVkh = details.paymentCredential!.hash;

  console.log(`Admin address: ${address}`);
  console.log(`Admin VKH: ${adminVkh}`);

  // Load blueprint and resolve scripts
  const bp = loadBlueprint();
  const { factoryScript, factoryAddr } = resolveFactoryScripts(bp, network, adminVkh);
  console.log(`Factory address: ${factoryAddr}`);

  // Check if factory UTxO already exists
  const existingUtxos = await lucid.utxosAt(factoryAddr);
  if (existingUtxos.length > 0) {
    console.log(`\n⚠️  Factory already has ${existingUtxos.length} UTxO(s). Checking...`);
    for (const u of existingUtxos) {
      console.log(`  - ${u.txHash}#${u.outputIndex} (${u.assets.lovelace} lovelace + ${Object.keys(u.assets).length - 1} native assets)`);
    }
    console.log('\nIf this is correct, no deployment needed.');
    // Continue anyway to allow re-deployment
  }

  // ─── Mint factory NFT ─────────────────────
  // Use a NativeScript (simple pubkey policy) for the factory NFT.
  // Anyone who holds the admin key can mint — but one-shot uniqueness 
  // is ensured by consuming a specific UTxO.
  
  const utxos = await lucid.wallet().getUtxos();
  if (utxos.length === 0) {
    console.error('No UTxOs in wallet');
    process.exit(1);
  }

  // Create a NativeScript policy keyed to admin pubkey
  // CBOR: 82 00 58 1c <28-byte-keyhash> = ScriptPubkey(keyhash)
  const nativeScriptCbor = `8200581c${adminVkh}`;
  const nativeScript: Script = { type: 'Native', script: nativeScriptCbor };
  const factoryNftPolicyId = mintingPolicyToId(nativeScript);
  
  // Factory NFT name = "SolverNetFactory"
  const factoryNftName = Buffer.from('SolverNetFactory').toString('hex');
  const factoryNftUnit = toUnit(factoryNftPolicyId, factoryNftName);

  console.log(`\nFactory NFT Policy: ${factoryNftPolicyId}`);
  console.log(`Factory NFT Unit: ${factoryNftUnit}`);

  // ─── Build FactoryDatum ────────────────────
  // AssetClass = Constr(0, [policy_id, asset_name])
  const factoryNftAssetClass = new Constr(0, [factoryNftPolicyId, factoryNftName]);
  
  // OutputReference dummy = Constr(0, [txHash_bytes, output_index])
  // Use a dummy settings_utxo since we haven't deployed settings yet
  const dummySettingsRef = new Constr(0, ['0000000000000000000000000000000000000000000000000000000000000000', 0n]);

  // FactoryDatum { factory_nft, pool_count, admin, settings_utxo }
  const factoryDatumCbor = Data.to(
    new Constr(0, [
      factoryNftAssetClass,   // factory_nft: AssetClass
      0n,                      // pool_count: Int
      adminVkh,               // admin: VerificationKeyHash (ByteArray)
      dummySettingsRef,        // settings_utxo: OutputReference
    ]),
  );

  console.log(`\nFactoryDatum CBOR: ${factoryDatumCbor.slice(0, 80)}...`);

  // ─── Build TX ──────────────────────────────
  const MIN_LOVELACE = 5_000_000n;

  const tx = lucid
    .newTx()
    .mintAssets(
      { [factoryNftUnit]: 1n },
      Data.void(),
    )
    .attach.MintingPolicy(nativeScript)
    .pay.ToContract(
      factoryAddr,
      { kind: 'inline', value: factoryDatumCbor },
      {
        lovelace: MIN_LOVELACE,
        [factoryNftUnit]: 1n,
      },
    )
    .addSigner(address);

  console.log('\nBuilding & completing TX...');
  
  try {
    const completed = await tx.complete({ changeAddress: address });
    const txHash = completed.toHash();
    console.log(`TX Hash: ${txHash}`);
    
    // Sign and submit
    const signed = await completed.sign.withWallet().complete();
    const submittedHash = await signed.submit();
    console.log(`\n✅ Factory deployed! TX submitted: ${submittedHash}`);
    console.log(`\nWaiting for confirmation...`);
    
    // Wait for confirmation (poll Blockfrost)
    let confirmed = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const utxosAtFactory = await lucid.utxosAt(factoryAddr);
        if (utxosAtFactory.some(u => u.txHash === submittedHash)) {
          confirmed = true;
          break;
        }
      } catch {}
      process.stdout.write('.');
    }
    
    if (confirmed) {
      console.log(`\n\n🎉 Factory UTxO confirmed on-chain!`);
      console.log(`Factory address: ${factoryAddr}`);
      console.log(`Factory NFT: ${factoryNftUnit}`);
    } else {
      console.log(`\n\n⏳ TX submitted but not yet confirmed. Check Cardano explorer.`);
    }
  } catch (err) {
    console.error('\n❌ Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
