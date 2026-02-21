/**
 * CLI: Direct pool swap (no escrow) — builds TX on backend, signs locally
 * Usage: npx tsx src/direct-swap.ts --inputAsset=lovelace --outputAsset=<policyId.assetName> --inputAmount=5000000 --minOutput=1
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
  console.log('Wallet address:', address);

  const inputAsset = args.inputAsset || 'lovelace';
  const outputAsset = args.outputAsset;
  const inputAmount = args.inputAmount || '5000000';
  const minOutput = args.minOutput || '1';
  const deadline = Date.now() + 15 * 60 * 1000; // 15 min

  if (!outputAsset) {
    console.error('--outputAsset is required (e.g., --outputAsset=<policyId>.<assetName>)');
    process.exit(1);
  }

  console.log(`\nDirect swap: ${inputAmount} ${inputAsset} → ${outputAsset} (minOutput: ${minOutput})`);

  // 1. Build unsigned TX via backend
  const result = await apiFetch<any>('/swap/build', {
    method: 'POST',
    body: JSON.stringify({
      sender_address: address,
      change_address: address,
      input_asset_id: inputAsset,
      input_amount: inputAmount,
      output_asset_id: outputAsset,
      min_output: minOutput,
      deadline,
    }),
  });

  log('Backend response', { txHash: result.txHash });

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();
    console.log('TX submitted:', txHash);
    log('Direct swap completed', { txHash });
  }
}

main().catch(console.error);
