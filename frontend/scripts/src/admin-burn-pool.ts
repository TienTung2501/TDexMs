/**
 * CLI: Burn/Cancel a pool by burning its pool NFT
 * Usage: npx tsx src/admin-burn-pool.ts --poolId=<poolId>
 *
 * Calls: POST /admin/pools/build-burn
 * Then signs and submits the TX.
 *
 * NOTE: Backend currently returns 501 for this endpoint.
 *       This script handles 501 gracefully for testing purposes.
 */
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
} from '@lucid-evolution/lucid';
import { apiFetch, requireEnv, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const poolId = args.poolId || args.pool;

  if (!poolId) {
    console.error('Usage: npx tsx src/admin-burn-pool.ts --poolId=<poolId>');
    console.error('\nThis burns the pool NFT, effectively removing the pool.');
    process.exit(1);
  }

  console.log('\n🔥 SolverNet — Burn Pool NFT');
  console.log('═'.repeat(50));

  // Setup wallet
  const seed = requireEnv('T_WALLET_SEED');
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);
  const adminVkh = details.paymentCredential!.hash;

  console.log(`Admin wallet: ${address}`);
  console.log(`Pool to burn: ${poolId}\n`);

  // Call build-burn endpoint
  try {
    const result = await apiFetch<any>('/admin/pools/build-burn', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: address,
        pool_id: poolId,
      }),
    });

    log('Build Burn TX Result', result);

    if (result.unsignedTx) {
      console.log('\nSigning TX...');
      const signed = await lucid
        .fromTx(result.unsignedTx)
        .sign.withWallet()
        .complete();

      console.log('Submitting...');
      const txHash = await signed.submit();
      console.log(`\n✅ Pool burned! TX: ${txHash}`);
      console.log(`   View: https://preprod.cardanoscan.io/transaction/${txHash}`);
    } else {
      console.log('⚠️ No unsigned TX returned');
    }
  } catch (err: any) {
    if (err.message?.includes('501')) {
      console.log('⚠️  Backend returned 501 — burn pool TX building not yet implemented.');
      console.log('   The endpoint exists but requires smart contract integration.');
      console.log('   This is expected behavior during development.\n');
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
