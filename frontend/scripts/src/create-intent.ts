/**
 * CLI: Create a swap intent (builds TX on backend, signs with local wallet)
 * Usage: npx tsx src/create-intent.ts --inputAsset=lovelace --outputAsset=test0001.74425443 --inputAmount=5000000
 */
import { Lucid, Blockfrost, type LucidEvolution } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function getWallet(): Promise<{ lucid: LucidEvolution; address: string }> {
  const args = parseArgs();
  const walletKey = args.wallet || 'WALLET_SEED';
  const seed = requireEnv(walletKey);
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
  const outputAsset = args.outputAsset || 'test0001.74425443';
  const inputAmount = args.inputAmount || '5000000';
  const deadline = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now (milliseconds)

  console.log(`\nCreating intent: ${inputAmount} ${inputAsset} → ${outputAsset}`);

  // 1. Build unsigned TX via backend
  const result = await apiFetch<any>('/intents', {
    method: 'POST',
    body: JSON.stringify({
      senderAddress: address,
      inputAsset,
      inputAmount,
      outputAsset,
      minOutput: args.minOutput || '1',
      deadline,
      partialFill: false,
      changeAddress: address,
    }),
  });

  log('Backend response', { intentId: result.intentId, txHash: result.txHash });

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();
    console.log('TX submitted:', txHash);

    // 3. Confirm on backend
    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, intentId: result.intentId, action: 'create_intent' }),
    }).catch(() => console.warn('TX confirm call failed (non-critical)'));

    log('Intent created successfully', { intentId: result.intentId, txHash });
  }
}

main().catch(console.error);
