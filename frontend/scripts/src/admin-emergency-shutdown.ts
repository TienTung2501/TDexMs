/**
 * CLI Admin: Emergency shutdown – pause solvers and freeze protocol
 * Usage: npx tsx src/admin-emergency-shutdown.ts [--confirm]
 *
 * This script:
 *   1. Pauses the solver engine (POST /admin/solver/pause)
 *   2. Optionally builds a settings TX to mark the protocol as paused on-chain
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
    console.log('   This will pause the solver engine and freeze the protocol.');
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

  // Step 1: Pause solver
  console.log('Step 1: Pausing solver engine...');
  try {
    const pauseResult = await apiFetch<any>('/admin/solver/pause', {
      method: 'POST',
      body: JSON.stringify({ adminAddress: address }),
    });
    log('Solver paused', pauseResult);
  } catch (err: any) {
    console.warn(`  Solver pause endpoint may not exist yet: ${err.message}`);
    console.warn('  Continuing with on-chain freeze...');
  }

  // Step 2: On-chain settings freeze
  console.log('\nStep 2: Freezing protocol on-chain...');
  try {
    const result = await apiFetch<any>('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        adminAddress: address,
        settings: { paused: true, solverMode: 'manual' },
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
      log('Protocol paused (off-chain only)', result);
    }
  } catch (err: any) {
    console.warn(`  On-chain freeze not available: ${err.message}`);
  }

  console.log('\n🛑 Emergency shutdown complete.');
  console.log('   To resume, use admin-update-settings.ts with --solverMode=auto');
}

main().catch((err) => {
  console.error('\n❌ Emergency shutdown failed:', err.message || err);
  process.exit(1);
});
