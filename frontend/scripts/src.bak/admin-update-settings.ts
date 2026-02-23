/**
 * CLI Admin: Update protocol settings (fee rates, pool liquidity min, version)
 * Usage: npx tsx src/admin-update-settings.ts --feeNumerator=30 --minLiquidity=2000000 --version=2
 *
 * Supported args:
 *   --feeNumerator=<n>    Max protocol fee in basis points (e.g. 30 = 0.3%)
 *   --minLiquidity=<n>    Minimum initial pool liquidity in lovelace
 *   --version=<n>         Next protocol version number
 *
 * Calls POST /v1/admin/settings/build-update-global to build the TX,
 * then signs and submits.
 *
 * Environment:
 *   WALLET_SEED, BLOCKFROST_URL, BLOCKFROST_PROJECT_ID
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

  console.log(`Admin address: ${address}`);

  // Fetch current settings first
  const current = await apiFetch<any>('/admin/settings/current');
  log('Current settings', current.global_settings);

  // Build new_settings payload from args (merge with current)
  const newSettings = {
    max_protocol_fee_bps: args.feeNumerator
      ? Number(args.feeNumerator)
      : current.global_settings.max_protocol_fee_bps,
    min_pool_liquidity: args.minLiquidity
      ? Number(args.minLiquidity)
      : current.global_settings.min_pool_liquidity,
    next_version: args.version
      ? Number(args.version)
      : current.global_settings.current_version + 1,
  };

  const hasChanges = (
    newSettings.max_protocol_fee_bps !== current.global_settings.max_protocol_fee_bps ||
    newSettings.min_pool_liquidity !== current.global_settings.min_pool_liquidity ||
    newSettings.next_version !== current.global_settings.current_version
  );

  if (!hasChanges && !args.feeNumerator && !args.minLiquidity && !args.version) {
    console.error('\nNo settings to update. Provide at least one of:');
    console.error('  --feeNumerator=30');
    console.error('  --minLiquidity=2000000');
    console.error('  --version=2');
    process.exit(1);
  }

  log('New settings', newSettings);

  // POST to correct admin endpoint
  const result = await apiFetch<any>('/admin/settings/build-update-global', {
    method: 'POST',
    body: JSON.stringify({
      admin_address: address,
      new_settings: newSettings,
    }),
  });

  log('Backend response', result);

  if (result.unsignedTx) {
    console.log('\nSigning TX (on-chain settings update)...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, action: 'update_settings' }),
    }).catch(() => console.warn('Confirm call failed (non-critical)'));

    log('Settings updated on-chain!', {
      txHash,
      explorerUrl: `https://preprod.cardanoscan.io/transaction/${txHash}`,
    });
  } else {
    console.log('\nNote: The settings update TX building is not yet implemented (501).');
    console.log('Requires settings_validator smart contract interaction.');
    log('Response', result);
  }
}

main().catch((err) => {
  console.error('\n❌ Update settings failed:', err.message || err);
  process.exit(1);
});
