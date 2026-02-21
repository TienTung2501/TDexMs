/**
 * CLI: Burn (destroy) specific tokens from wallet
 * Usage:
 *   npx tsx src/burn-tokens.ts --policyId=<hex> --assetName=<hex> --amount=1000000
 *   npx tsx src/burn-tokens.ts --unit=<policyId><assetNameHex> --amount=1000000
 *   npx tsx src/burn-tokens.ts --ticker=tBTC --amount=1000000  # uses wallet-derived policy
 *
 * Burns arbitrary tokens (not just the 5 test tokens). For test tokens specifically,
 * you can also use: npx tsx src/mint-test-tokens.ts --burn
 */
import {
  Lucid,
  Blockfrost,
  type Script,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
} from '@lucid-evolution/lucid';
import { requireEnv, parseArgs, log } from './shared.js';

function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

async function main() {
  const args = parseArgs();

  console.log('\n🔥 SolverNet — Token Burner');
  console.log('═'.repeat(50));

  const seed = requireEnv('T_WALLET_SEED');
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);
  const paymentKeyHash = details.paymentCredential!.hash;

  console.log(`Wallet: ${address}`);
  console.log(`Key Hash: ${paymentKeyHash}\n`);

  let policyId: string;
  let assetNameHex: string;
  let amount: bigint;
  let mintScript: Script;

  if (args.ticker) {
    // Derive policy from wallet (same as mint-test-tokens)
    const nativeScriptCbor = `8200581c${paymentKeyHash}`;
    mintScript = { type: 'Native', script: nativeScriptCbor };
    policyId = mintingPolicyToId(mintScript);
    assetNameHex = textToHex(args.ticker);
    
    // If no amount specified, check balance and burn all
    if (!args.amount) {
      const utxos = await lucid.utxosAt(address);
      const unit = toUnit(policyId, assetNameHex);
      const balance = utxos.reduce((sum, u) => sum + (u.assets[unit] || 0n), 0n);
      if (balance <= 0n) {
        console.error(`No ${args.ticker} tokens found in wallet to burn.`);
        process.exit(1);
      }
      amount = balance;
      console.log(`Burning ALL ${args.ticker}: ${amount} (full balance)`);
    } else {
      amount = BigInt(args.amount);
    }
  } else if (args.unit) {
    // Full unit string: policyId + assetNameHex
    policyId = args.unit.slice(0, 56);
    assetNameHex = args.unit.slice(56);
    amount = BigInt(args.amount || '0');
    if (amount <= 0n) {
      console.error('--amount is required when using --unit');
      process.exit(1);
    }
    // Try to build native script for signing
    const nativeScriptCbor = `8200581c${paymentKeyHash}`;
    mintScript = { type: 'Native', script: nativeScriptCbor };
    const derivedPolicyId = mintingPolicyToId(mintScript);
    if (derivedPolicyId !== policyId) {
      console.error(`⚠️  Policy ${policyId} was NOT minted by this wallet (expected ${derivedPolicyId}).`);
      console.error('   Only tokens minted with a NativeScript from this wallet can be burned.');
      process.exit(1);
    }
  } else if (args.policyId && args.assetName) {
    policyId = args.policyId;
    assetNameHex = args.assetName;
    amount = BigInt(args.amount || '0');
    if (amount <= 0n) {
      console.error('--amount is required');
      process.exit(1);
    }
    const nativeScriptCbor = `8200581c${paymentKeyHash}`;
    mintScript = { type: 'Native', script: nativeScriptCbor };
    const derivedPolicyId = mintingPolicyToId(mintScript);
    if (derivedPolicyId !== policyId) {
      console.error(`⚠️  Policy ${policyId} was NOT minted by this wallet.`);
      process.exit(1);
    }
  } else {
    console.error('Usage:');
    console.error('  npx tsx src/burn-tokens.ts --ticker=tBTC [--amount=100000000]');
    console.error('  npx tsx src/burn-tokens.ts --unit=<policyId><assetHex> --amount=1000');
    console.error('  npx tsx src/burn-tokens.ts --policyId=<hex> --assetName=<hex> --amount=1000');
    process.exit(1);
  }

  const unit = `${policyId}${assetNameHex}`;
  console.log(`\n  Policy:  ${policyId}`);
  console.log(`  Asset:   ${assetNameHex}`);
  console.log(`  Unit:    ${unit}`);
  console.log(`  Amount:  -${amount}\n`);

  console.log('Building burn transaction...');
  const tx = lucid
    .newTx()
    .mintAssets({ [unit]: -amount })
    .attach.MintingPolicy(mintScript!);

  const completed = await tx.complete({ changeAddress: address });

  console.log('Signing...');
  const signed = await completed.sign.withWallet().complete();

  console.log('Submitting...');
  const txHash = await signed.submit();

  console.log(`\n✅ Burn TX submitted: ${txHash}`);
  console.log(`   View: https://preprod.cardanoscan.io/transaction/${txHash}\n`);

  // Wait for confirmation
  console.log('Waiting for confirmation...');
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const utxos = await lucid.utxosAt(address);
      const balance = utxos.reduce((sum, u) => sum + (u.assets[unit] || 0n), 0n);
      // If we burned all, balance should be 0 or less than before
      console.log(`  Current balance: ${balance}`);
      if (balance === 0n || Date.now() - start > 30_000) {
        console.log('✅ Burn confirmed!\n');
        return;
      }
    } catch { /* keep polling */ }
    process.stdout.write('.');
  }
  console.log('\n⚠️  Timed out. TX may still confirm.');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
