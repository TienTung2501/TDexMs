/**
 * CLI: Transfer factory admin to a new address
 * Usage: npx tsx src/admin-transfer-factory.ts --newAdmin=<addr_test1...>
 *
 * Calls: POST /admin/settings/build-update-factory
 * Then signs and submits the TX.
 *
 * NOTE: Backend currently returns 501 for this endpoint.
 */
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
} from '@lucid-evolution/lucid';
import { apiFetch, requireEnv, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const newAdminAddress = args.newAdmin || args.to;

  if (!newAdminAddress) {
    console.error('Usage: npx tsx src/admin-transfer-factory.ts --newAdmin=<addr_test1...>');
    console.error('\nTransfers factory admin rights to a new address.');
    process.exit(1);
  }

  console.log('\n🔑 SolverNet — Transfer Factory Admin');
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
  const adminVkh = details.paymentCredential!.hash;

  const newDetails = getAddressDetails(newAdminAddress);
  const newAdminVkh = newDetails.paymentCredential!.hash;

  console.log(`Current admin: ${address}`);
  console.log(`New admin:     ${newAdminAddress}`);
  console.log(`New VKH:       ${newAdminVkh}\n`);

  try {
    const result = await apiFetch<any>('/admin/settings/build-update-factory', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: address,
        admin_vkh: adminVkh,
        new_admin_vkh: newAdminVkh,
      }),
    });

    log('Build Transfer Factory TX', result);

    if (result.tx_cbor) {
      console.log('\nSigning TX...');
      const signed = await lucid.fromTx(result.tx_cbor).sign.withWallet().complete();
      console.log('Submitting...');
      const txHash = await signed.submit();
      console.log(`\n✅ Factory admin transferred! TX: ${txHash}`);
    }
  } catch (err: any) {
    if (err.message?.includes('501')) {
      console.log('⚠️  Backend returned 501 — factory transfer TX building not yet implemented.');
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
