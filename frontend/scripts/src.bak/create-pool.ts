/**
 * CLI: Create a new liquidity pool
 * Usage: npx tsx src/create-pool.ts --assetA=lovelace --assetB=<policyId.assetName> --amountA=50000000 --amountB=10000 --fee=30
 * 
 * Example (ADA/tBTC pool with 50 ADA and 10000 tBTC units):
 *   npx tsx src/create-pool.ts --amountA=50000000 --amountB=10000
 *
 * Environment:
 *   WALLET_SEED       - Mnemonic seed phrase for signing
 *   BLOCKFROST_URL    - Blockfrost endpoint (Preprod)
 *   BLOCKFROST_PROJECT_ID - Blockfrost project key
 *   NETWORK           - Preprod | Preview | Mainnet (default: Preprod)
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();

  const seed = requireEnv('WALLET_SEED');
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();

  const assetA = args.assetA || 'lovelace';
  const assetB = args.assetB || '';
  const amountA = args.amountA || '50000000'; // 50 ADA default
  const amountB = args.amountB || '10000';
  const feeNumerator = Number(args.fee || '30'); // 0.3% default

  if (!assetB) {
    console.error('Usage: npx tsx src/create-pool.ts --assetB=<policyId.assetName> [--assetA=lovelace] [--amountA=50000000] [--amountB=10000] [--fee=30]');
    console.error('\nThe --assetB flag is required. Use a minted test token policy ID + asset name.');
    console.error('Example: --assetB=abc123def456.744254430a');
    process.exit(1);
  }

  console.log(`Creator address: ${address}`);
  console.log(`Creating pool: ${assetA} / ${assetB}`);
  console.log(`Initial liquidity: ${amountA} / ${amountB}`);
  console.log(`Fee: ${feeNumerator / 100}% (numerator=${feeNumerator}, denominator=10000)`);

  const result = await apiFetch<any>('/pools/create', {
    method: 'POST',
    body: JSON.stringify({
      assetA,
      assetB,
      initialAmountA: amountA,
      initialAmountB: amountB,
      feeNumerator,
      creatorAddress: address,
      changeAddress: address,
    }),
  });

  log('Backend response', result);

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    // Confirm TX on backend
    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, poolId: result.poolId, action: 'create_pool' }),
    }).catch(() => console.warn('Confirm call failed (non-critical)'));

    log('Pool created!', {
      poolId: result.poolId,
      txHash,
      explorerUrl: `https://preprod.cardanoscan.io/transaction/${txHash}`,
    });
  } else {
    log('Pool registered (no TX required)', { poolId: result.poolId });
  }
}

main().catch((err) => {
  console.error('\n❌ Create pool failed:', err.message || err);
  process.exit(1);
});
