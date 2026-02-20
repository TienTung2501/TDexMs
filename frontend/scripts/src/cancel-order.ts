/**
 * CLI: Cancel an advanced order
 * Usage: npx tsx src/cancel-order.ts --orderId=abc123
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const orderId = args.orderId;
  if (!orderId) {
    console.error('Usage: npx tsx src/cancel-order.ts --orderId=<id>');
    process.exit(1);
  }

  const seed = requireEnv('WALLET_SEED');
  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();

  console.log(`Cancelling order: ${orderId}`);
  const result = await apiFetch<any>(`/orders/${orderId}`, {
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
      body: JSON.stringify({ txHash, action: 'cancel_order' }),
    }).catch(() => {});

    log('Order cancelled', { orderId, txHash });
  }
}

main().catch(console.error);
