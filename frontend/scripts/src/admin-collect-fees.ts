/**
 * CLI Admin: Collect accumulated fees from a pool
 * Usage: npx tsx src/admin-collect-fees.ts --poolId=<id>
 *
 * This script calls the backend admin endpoint to build a fee-collection TX,
 * signs it with the admin wallet, and submits.
 *
 * Environment:
 *   WALLET_SEED       - Admin wallet mnemonic
 *   BLOCKFROST_URL    - Blockfrost endpoint
 *   BLOCKFROST_PROJECT_ID - Blockfrost project key
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const poolId = args.poolId;
  if (!poolId) {
    console.error('Usage: npx tsx src/admin-collect-fees.ts --poolId=<id>');
    process.exit(1);
  }

  const seed = requireEnv('WALLET_SEED');
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();

  console.log(`Admin address: ${address}`);
  console.log(`Collecting fees from pool: ${poolId}`);

  // First get pool info
  const pool = await apiFetch<any>(`/pools/${poolId}`);
  log('Pool info', {
    pair: `${pool.assetA} / ${pool.assetB}`,
    reserveA: pool.reserveA,
    reserveB: pool.reserveB,
    tvlAda: pool.tvlAda,
    accumulatedFees: pool.accumulatedFees ?? 'N/A',
  });

  // Build collect-fees TX
  const result = await apiFetch<any>(`/pools/${poolId}/collect-fees`, {
    method: 'POST',
    body: JSON.stringify({
      adminAddress: address,
      changeAddress: address,
    }),
  });

  log('Backend response', result);

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, poolId, action: 'collect_fees' }),
    }).catch(() => console.warn('Confirm call failed (non-critical)'));

    log('Fees collected!', {
      poolId,
      txHash,
      explorerUrl: `https://preprod.cardanoscan.io/transaction/${txHash}`,
    });
  } else {
    console.log('No fees to collect or endpoint not available yet.');
    console.log('Note: The collect-fees backend endpoint may need to be implemented.');
  }
}

main().catch((err) => {
  console.error('\n❌ Collect fees failed:', err.message || err);
  process.exit(1);
});
