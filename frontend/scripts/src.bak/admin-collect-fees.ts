/**
 * CLI Admin: Collect accumulated fees from pool(s)
 * Usage: npx tsx src/admin-collect-fees.ts --poolId=<id>
 *
 * Calls POST /v1/admin/revenue/build-collect to build a fee-collection TX,
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

  // First get pool info (assetA/B are objects: { policyId, assetName })
  const pool = await apiFetch<any>(`/pools/${poolId}`);
  const pairA = pool.assetA?.assetName || (pool.assetA?.policyId === '' ? 'ADA' : '?');
  const pairB = pool.assetB?.assetName || '?';
  log('Pool info', {
    pair: `${pairA} / ${pairB}`,
    reserveA: pool.reserveA,
    reserveB: pool.reserveB,
    tvlAda: pool.tvlAda,
  });

  // Check pending fees for this pool
  try {
    const fees = await apiFetch<any[]>('/admin/revenue/pending');
    const poolFee = fees.find((e) => e.pool_id === poolId);
    if (poolFee) {
      log('Pending fees for this pool', poolFee.pending_fees);
    } else {
      console.log('  No pending fee data for this pool');
    }
  } catch {
    console.warn('  Could not fetch pending fees (non-critical)');
  }

  // Build collect-fees TX via correct admin endpoint
  const result = await apiFetch<any>('/admin/revenue/build-collect', {
    method: 'POST',
    body: JSON.stringify({
      admin_address: address,
      pool_ids: [poolId],
    }),
  });

  log('Backend response', result);

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, action: 'collect_fees' }),
    }).catch(() => console.warn('Confirm call failed (non-critical)'));

    log('Fees collected!', {
      poolId,
      txHash,
      explorerUrl: `https://preprod.cardanoscan.io/transaction/${txHash}`,
    });
  } else {
    console.log('\nNote: The build-collect endpoint returns 501 — fee collection TX building');
    console.log('requires dedicated smart contract interaction (not yet implemented).');
  }
}

main().catch((err) => {
  console.error('\n❌ Collect fees failed:', err.message || err);
  process.exit(1);
});
