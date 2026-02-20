/**
 * CLI: Create an advanced order (Limit / DCA / StopLoss)
 * Usage: npx tsx src/create-order.ts --type=LIMIT --inputAsset=lovelace --outputAsset=test0001.74425443 --inputAmount=5000000 --priceNum=100 --priceDen=1
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
  console.log('Wallet address:', address);

  const body: Record<string, unknown> = {
    type: args.type || 'LIMIT',
    inputAsset: args.inputAsset || 'lovelace',
    outputAsset: args.outputAsset || 'test0001.74425443',
    inputAmount: args.inputAmount || '5000000',
    priceNumerator: args.priceNum || '100',
    priceDenominator: args.priceDen || '1',
    deadline: Date.now() + 24 * 60 * 60 * 1000,
    senderAddress: address,
    changeAddress: address,
  };

  // DCA-specific fields
  if (args.type === 'DCA') {
    body.totalBudget = args.totalBudget || args.inputAmount || '5000000';
    body.amountPerInterval = args.amountPerInterval || '1000000';
    body.intervalSlots = parseInt(args.intervalSlots || '7200'); // ~2 hours
  }

  console.log(`Creating ${body.type} order...`);
  const result = await apiFetch<any>('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  log('Backend response', { orderId: result.orderId, txHash: result.txHash });

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, action: 'create_order' }),
    }).catch(() => {});

    log('Order created', { orderId: result.orderId, txHash });
  }
}

main().catch(console.error);
