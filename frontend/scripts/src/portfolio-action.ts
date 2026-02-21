/**
 * CLI: Build and execute portfolio actions (cancel order, reclaim, withdraw LP)
 * Usage:
 *   npx tsx src/portfolio-action.ts --action=CANCEL --utxoRef=<txHash#index>
 *   npx tsx src/portfolio-action.ts --action=RECLAIM --utxoRef=<txHash#index>
 *   npx tsx src/portfolio-action.ts --withdraw --poolId=<poolId> --lpAmount=<amount>
 *
 * Tests:
 *   POST /portfolio/build-action  — build cancel/reclaim TX
 *   POST /portfolio/build-withdraw — build LP withdraw TX
 */
import {
  Lucid,
  Blockfrost,
} from '@lucid-evolution/lucid';
import { apiFetch, requireEnv, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();

  console.log('\n📋 SolverNet — Portfolio Action Builder');
  console.log('═'.repeat(50));

  const seed = requireEnv('T_WALLET_SEED');
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  console.log(`Wallet: ${address}\n`);

  if (args.withdraw === 'true') {
    // LP withdraw action
    const poolId = args.poolId || args.pool;
    const lpAmount = args.lpAmount || args.amount;
    if (!poolId || !lpAmount) {
      console.error('Usage: npx tsx src/portfolio-action.ts --withdraw --poolId=<id> --lpAmount=<amount>');
      process.exit(1);
    }

    console.log(`Withdraw LP from pool: ${poolId}`);
    console.log(`LP amount: ${lpAmount}\n`);

    try {
      const result = await apiFetch<any>('/portfolio/build-withdraw', {
        method: 'POST',
        body: JSON.stringify({
          wallet_address: address,
          pool_id: poolId,
          lp_amount: lpAmount,
        }),
      });

      log('Build Withdraw TX', result);

      if (result.tx_cbor) {
        const signed = await lucid.fromTx(result.tx_cbor).sign.withWallet().complete();
        const txHash = await signed.submit();
        console.log(`\n✅ Withdrew LP! TX: ${txHash}`);
      }
    } catch (err: any) {
      if (err.message?.includes('501')) {
        console.log('⚠️  Backend returned 501 — not yet implemented.');
      } else {
        throw err;
      }
    }
  } else {
    // Cancel/reclaim action
    const action = args.action || 'CANCEL';
    const utxoRef = args.utxoRef || args.utxo;

    if (!utxoRef) {
      console.error('Usage: npx tsx src/portfolio-action.ts --action=CANCEL --utxoRef=<txHash#index>');
      console.error('       npx tsx src/portfolio-action.ts --action=RECLAIM --utxoRef=<txHash#index>');
      process.exit(1);
    }

    console.log(`Action: ${action}`);
    console.log(`UTxO: ${utxoRef}\n`);

    try {
      const result = await apiFetch<any>('/portfolio/build-action', {
        method: 'POST',
        body: JSON.stringify({
          wallet_address: address,
          utxo_ref: utxoRef,
          action: action.toUpperCase(),
        }),
      });

      log('Build Action TX', result);

      if (result.tx_cbor) {
        const signed = await lucid.fromTx(result.tx_cbor).sign.withWallet().complete();
        const txHash = await signed.submit();
        console.log(`\n✅ Action '${action}' completed! TX: ${txHash}`);
      }
    } catch (err: any) {
      if (err.message?.includes('501') || err.message?.includes('404')) {
        console.log(`⚠️  Backend returned error — portfolio build-action may not be fully implemented.`);
        console.log(`   Error: ${err.message}`);
      } else {
        throw err;
      }
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
