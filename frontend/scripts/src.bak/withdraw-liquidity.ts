/**
 * CLI: Withdraw liquidity from a pool
 * Usage: npx tsx src/withdraw-liquidity.ts --poolId=abc123 --percent=50
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const poolId = args.poolId;
  if (!poolId) {
    console.error('Usage: npx tsx src/withdraw-liquidity.ts --poolId=<id> --percent=<1-100>');
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

  // Get pool info to calculate LP tokens
  const pool = await apiFetch<any>(`/pools/${poolId}`);
  const percent = parseFloat(args.percent || '100');
  const lpAmount = Math.floor(Number(pool.totalLpTokens) * (percent / 100)).toString();

  console.log(`Withdrawing ${percent}% from pool ${poolId} (LP: ${lpAmount})`);
  const result = await apiFetch<any>(`/pools/${poolId}/withdraw`, {
    method: 'POST',
    body: JSON.stringify({
      lpTokenAmount: lpAmount,
      minAmountA: '0',
      minAmountB: '0',
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
      body: JSON.stringify({ txHash, action: 'withdraw' }),
    }).catch(() => {});

    log('Withdrawal submitted', { poolId, txHash });
  }
}

main().catch(console.error);
