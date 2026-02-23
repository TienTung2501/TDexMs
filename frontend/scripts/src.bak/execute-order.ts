/**
 * CLI: Solver executes a pending order (Limit/DCA/StopLoss) against a pool
 * Usage: npx tsx src/execute-order.ts --orderTxHash=<hash> --orderOutputIndex=0 --poolTxHash=<hash> --poolOutputIndex=0
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
  console.log('Solver wallet address:', address);

  const orderTxHash = args.orderTxHash;
  const orderOutputIndex = parseInt(args.orderOutputIndex || '0', 10);
  const poolTxHash = args.poolTxHash;
  const poolOutputIndex = parseInt(args.poolOutputIndex || '0', 10);

  if (!orderTxHash || !poolTxHash) {
    console.error('Required: --orderTxHash=<hash> --poolTxHash=<hash>');
    console.error('Optional: --orderOutputIndex=0 --poolOutputIndex=0');
    process.exit(1);
  }

  console.log(`\nExecuting order ${orderTxHash}#${orderOutputIndex}`);
  console.log(`Against pool ${poolTxHash}#${poolOutputIndex}`);

  // 1. Build unsigned TX via backend
  const result = await apiFetch<any>('/solver/execute-order', {
    method: 'POST',
    body: JSON.stringify({
      solver_address: address,
      order_utxo_ref: {
        tx_hash: orderTxHash,
        output_index: orderOutputIndex,
      },
      pool_utxo_ref: {
        tx_hash: poolTxHash,
        output_index: poolOutputIndex,
      },
    }),
  });

  log('Backend response', { txHash: result.txHash });

  if (result.unsignedTx) {
    console.log('\nSigning TX...');
    const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
    const txHash = await signed.submit();
    console.log('TX submitted:', txHash);
    log('Order execution completed', { txHash });
  }
}

main().catch(console.error);
