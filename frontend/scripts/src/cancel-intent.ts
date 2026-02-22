/**
 * CLI: Cancel an intent
 * Usage: npx tsx src/cancel-intent.ts --intentId=abc123
 */
import { Lucid, Blockfrost, type LucidEvolution } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const intentId = args.intentId;
  if (!intentId) {
    console.error('Usage: npx tsx src/cancel-intent.ts --intentId=<id>');
    process.exit(1);
  }

  const seed = requireEnv(args.wallet || 'WALLET_SEED');
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  console.log('Wallet address:', address);

  console.log(`Cancelling intent: ${intentId}`);
  const result = await apiFetch<any>(`/intents/${intentId}`, {
    method: 'DELETE',
    body: JSON.stringify({ senderAddress: address }),
  });

  log('Backend response', result);

  if (result.unsignedTx) {
    console.log('\nSigning cancel TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, intentId, action: 'cancel' }),
    }).catch(() => {});

    log('Intent cancelled', { intentId, txHash });
  }
}

main().catch(console.error);
