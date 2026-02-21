/**
 * CLI: Check wallet balances for both test wallets
 * Usage: npx tsx src/wallet-balance.ts [--wallet=1|2|both]
 *
 * Shows ADA balance and all token balances for test wallets.
 * Useful for verifying mint results and tracking state across tests.
 */
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
  mintingPolicyToId,
} from '@lucid-evolution/lucid';
import { requireEnv, parseArgs } from './shared.js';

function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

function hexToText(hex: string): string {
  return Buffer.from(hex, 'hex').toString('utf-8');
}

const TEST_TICKERS = ['tBTC', 'tUSDT', 'tPOLYGON', 'tNEAR', 'tSOL'];

async function showWalletBalance(label: string, seed: string) {
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);
  const keyHash = details.paymentCredential!.hash;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  Address: ${address}`);
  console.log(`  Key Hash: ${keyHash}`);
  console.log('═'.repeat(60));

  const utxos = await lucid.utxosAt(address);
  console.log(`  UTxOs: ${utxos.length}`);

  // ADA balance
  const lovelace = utxos.reduce((sum, u) => sum + (u.assets['lovelace'] || 0n), 0n);
  console.log(`  ADA: ${(Number(lovelace) / 1_000_000).toFixed(6)} (${lovelace} lovelace)`);

  // Derive test token policy
  const nativeScriptCbor = `8200581c${keyHash}`;
  const policyId = mintingPolicyToId({ type: 'Native', script: nativeScriptCbor });
  console.log(`  Test Token Policy: ${policyId}`);

  // Check test tokens
  console.log('\n  Test Tokens:');
  let hasTokens = false;
  for (const ticker of TEST_TICKERS) {
    const assetHex = textToHex(ticker);
    const unit = `${policyId}${assetHex}`;
    const balance = utxos.reduce((sum, u) => sum + (u.assets[unit] || 0n), 0n);
    if (balance > 0n) {
      hasTokens = true;
      console.log(`    ${ticker}: ${balance.toLocaleString()}`);
    }
  }
  if (!hasTokens) {
    console.log('    (no test tokens found)');
  }

  // Check for any other native assets
  const allAssets: Record<string, bigint> = {};
  for (const utxo of utxos) {
    for (const [unit, qty] of Object.entries(utxo.assets)) {
      if (unit === 'lovelace') continue;
      if (unit.startsWith(policyId)) continue; // skip test tokens already shown
      allAssets[unit] = (allAssets[unit] || 0n) + qty;
    }
  }

  if (Object.keys(allAssets).length > 0) {
    console.log('\n  Other Native Assets:');
    for (const [unit, qty] of Object.entries(allAssets)) {
      const policy = unit.slice(0, 56);
      const assetHex = unit.slice(56);
      let assetName: string;
      try {
        assetName = hexToText(assetHex);
      } catch {
        assetName = assetHex;
      }
      console.log(`    ${policy.slice(0, 12)}...${assetName}: ${qty.toLocaleString()}`);
    }
  }

  return { address, keyHash, policyId, lovelace };
}

async function main() {
  const args = parseArgs();
  const wallet = args.wallet || 'both';

  console.log('\n💰 SolverNet — Wallet Balance Checker');

  if (wallet === '1' || wallet === 'both') {
    try {
      await showWalletBalance('Wallet 1 (T_WALLET_SEED)', requireEnv('T_WALLET_SEED'));
    } catch (err: any) {
      console.error(`  Wallet 1 error: ${err.message}`);
    }
  }

  if (wallet === '2' || wallet === 'both') {
    try {
      await showWalletBalance('Wallet 2 (T_WALLET_SEED2)', requireEnv('T_WALLET_SEED2'));
    } catch (err: any) {
      console.error(`  Wallet 2 error: ${err.message}`);
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
