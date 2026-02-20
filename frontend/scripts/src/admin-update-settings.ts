/**
 * CLI Admin: Update protocol settings (fee rates, deadlines, etc.)
 * Usage: npx tsx src/admin-update-settings.ts --key=maxDeadlineMs --value=604800000
 *
 * Supported settings:
 *   --feeNumerator=<n>    Update global fee numerator (e.g. 30 = 0.3%)
 *   --maxDeadlineMs=<n>   Max intent deadline in milliseconds
 *   --minLiquidity=<n>    Minimum liquidity for new pools
 *   --solverMode=<auto|manual>  Solver execution mode
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

  // Build settings payload from args
  const settings: Record<string, string | number> = {};
  const settingsKeys = ['feeNumerator', 'maxDeadlineMs', 'minLiquidity', 'solverMode'];

  for (const key of settingsKeys) {
    if (args[key]) {
      settings[key] = isNaN(Number(args[key])) ? args[key] : Number(args[key]);
    }
  }

  if (Object.keys(settings).length === 0) {
    console.error('No settings to update. Provide at least one of:');
    console.error('  --feeNumerator=30');
    console.error('  --maxDeadlineMs=604800000');
    console.error('  --minLiquidity=1000');
    console.error('  --solverMode=auto');
    process.exit(1);
  }

  log('Settings to update', settings);

  // POST to admin/settings endpoint
  const result = await apiFetch<any>('/admin/settings', {
    method: 'POST',
    body: JSON.stringify({
      adminAddress: address,
      settings,
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
    log('Settings updated (off-chain)', result);
  }
}

main().catch((err) => {
  console.error('\n❌ Update settings failed:', err.message || err);
  console.error('\nNote: The /admin/settings endpoint may need to be implemented in the backend.');
  process.exit(1);
});
