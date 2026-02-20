/**
 * CLI: Deposit liquidity to a pool
 * Usage: npx tsx src/deposit-liquidity.ts --poolId=abc123 --amountA=5000000 --amountB=100
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const poolId = args.poolId;
  if (!poolId) {
    console.error('Usage: npx tsx src/deposit-liquidity.ts --poolId=<id> --amountA=<n> --amountB=<n>');
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

  console.log(`Depositing to pool: ${poolId}`);
  const result = await apiFetch<any>(`/pools/${poolId}/deposit`, {
    method: 'POST',
    body: JSON.stringify({
      amountA: args.amountA || '5000000',
      amountB: args.amountB || '100',
      minLpTokens: '0',
      senderAddress: address,
      changeAddress: address,
    }),
  });

  log('Backend response', result);

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();

    await apiFetch('/tx/confirm', {
      method: 'POST',
      body: JSON.stringify({ txHash, action: 'deposit' }),
    }).catch(() => {});

    log('Deposit submitted', { poolId, txHash });
  }
}

main().catch(console.error);
