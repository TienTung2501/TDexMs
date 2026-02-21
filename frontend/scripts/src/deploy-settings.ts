/**
 * CLI: Deploy initial settings UTxO (admin bootstrap)
 * Usage: npx tsx src/deploy-settings.ts [--protocolFeeBps=5] [--minPoolLiquidity=2000000]
 */
import { Lucid, Blockfrost, type LucidEvolution } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function getWallet(): Promise<{ lucid: LucidEvolution; address: string }> {
  const seed = requireEnv('WALLET_SEED');
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  return { lucid, address };
}

async function main() {
  const args = parseArgs();
  const { lucid, address } = await getWallet();
  console.log('Admin wallet address:', address);

  const protocolFeeBps = args.protocolFeeBps ? parseInt(args.protocolFeeBps, 10) : 5;
  const minPoolLiquidity = args.minPoolLiquidity || '2000000';
  const minIntentSize = args.minIntentSize || '1000000';
  const solverBond = args.solverBond || '5000000';

  console.log(`\nDeploying settings UTxO:`);
  console.log(`  protocolFeeBps: ${protocolFeeBps}`);
  console.log(`  minPoolLiquidity: ${minPoolLiquidity}`);
  console.log(`  minIntentSize: ${minIntentSize}`);
  console.log(`  solverBond: ${solverBond}`);

  // 1. Build unsigned TX via backend
  const result = await apiFetch<any>('/admin/settings/build-deploy', {
    method: 'POST',
    body: JSON.stringify({
      admin_address: address,
      protocol_fee_bps: protocolFeeBps,
      min_pool_liquidity: minPoolLiquidity,
      min_intent_size: minIntentSize,
      solver_bond: solverBond,
      fee_collector_address: address,
    }),
  });

  log('Backend response', { txHash: result.txHash });

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();
    console.log('TX submitted:', txHash);
    log('Settings deployed successfully', { txHash });
  }
}

main().catch(console.error);
