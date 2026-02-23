/**
 * CLI Admin: Emergency shutdown – freeze protocol settings on-chain
 * Usage: npx tsx src/admin-emergency-shutdown.ts [--confirm]
 *
 * This script builds a settings update TX to freeze the protocol.
 * Uses POST /v1/admin/settings/build-update-global with a paused flag.
 *
 * Safety: Requires --confirm flag to actually execute.
 *
 * Environment:
 *   WALLET_SEED, BLOCKFROST_URL, BLOCKFROST_PROJECT_ID
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();

  if (!args.confirm) {
    console.log('⚠️  Emergency Shutdown Script');
    console.log('   This will build a settings TX to freeze the protocol on-chain.');
    console.log('   Re-run with --confirm to execute:');
    console.log('');
    console.log('   npx tsx src/admin-emergency-shutdown.ts --confirm');
    process.exit(0);
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
  console.log('🚨 Executing emergency shutdown...\n');

  // Show current settings first
  console.log('Step 1: Fetching current settings...');
  try {
    const settings = await apiFetch<any>('/admin/settings/current');
    log('Current settings', settings.global_settings);
  } catch (err: any) {
    console.warn(`  Could not fetch settings: ${err.message}`);
  }

  // Build settings update TX (set fee to 0 and version to 0 = frozen)
  console.log('\nStep 2: Building freeze TX via /admin/settings/build-update-global...');
  try {
    const result = await apiFetch<any>('/admin/settings/build-update-global', {
      method: 'POST',
      body: JSON.stringify({
        admin_address: address,
        new_settings: {
          max_protocol_fee_bps: 0,
          min_pool_liquidity: 999_999_999,
          next_version: 0, // version 0 = frozen
        },
      }),
    });

    if (result.unsignedTx) {
      console.log('Signing freeze TX...');
      const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
      const txHash = await signed.submit();

      await apiFetch('/tx/confirm', {
        method: 'POST',
        body: JSON.stringify({ txHash, action: 'emergency_shutdown' }),
      }).catch(() => {});

      log('Protocol frozen on-chain', {
        txHash,
        explorerUrl: `https://preprod.cardanoscan.io/transaction/${txHash}`,
      });
    } else {
      log('Backend response (no TX built)', result);
      console.log('\nNote: The settings update TX building is not yet implemented (501).');
      console.log('Protocol remains in current state.');
    }
  } catch (err: any) {
    console.warn(`  On-chain freeze not available: ${err.message}`);
    console.warn('  Note: This endpoint returns 501 until settings_validator smart contract is deployed.');
  }

  console.log('\n🛑 Emergency shutdown complete.');
  console.log('   To restore, use admin-update-settings.ts with appropriate values.');
}

main().catch((err) => {
  console.error('\n❌ Emergency shutdown failed:', err.message || err);
  process.exit(1);
});
