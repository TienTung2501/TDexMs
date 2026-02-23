/**
 * CLI: View portfolio for an address (all endpoints)
 * Usage: npx tsx src/portfolio.ts [--address=addr_test1...]
 *
 * Tests all portfolio endpoints:
 *   GET /portfolio/summary          — aggregated balance + allocation
 *   GET /portfolio/open-orders      — active open orders
 *   GET /portfolio/history          — completed orders
 *   GET /portfolio/liquidity        — LP positions
 *   GET /portfolio/:address         — legacy summary (intent/order counts)
 *   GET /portfolio/:address/transactions — recent TXs
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  let address = args.address;

  // If no address provided, derive from seed
  if (!address) {
    const seed = requireEnv('WALLET_SEED');
    const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
    const lucid = await Lucid(
      new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
      network,
    );
    lucid.selectWallet.fromSeed(seed);
    address = await lucid.wallet().address();
  }

  console.log('Address:', address);

  // ── New portfolio endpoints ──

  console.log('\n── Summary ──');
  try {
    const summary = await apiFetch<any>('/portfolio/summary', {
      params: { wallet_address: address },
    });
    log('Portfolio Summary', {
      total_balance_usd: summary.total_balance_usd,
      total_balance_ada: summary.total_balance_ada,
      locked_in_orders: summary.status_breakdown?.locked_in_orders,
      locked_in_lp: summary.status_breakdown?.locked_in_lp,
      allocation: summary.allocation_chart?.length ?? 0,
    });
  } catch (err: any) {
    console.error('  Summary: ❌', err.message);
  }

  console.log('\n── Open Orders ──');
  try {
    const openOrders = await apiFetch<any[]>('/portfolio/open-orders', {
      params: { wallet_address: address, limit: '10' },
    });
    console.log(`  ${openOrders.length} open orders`);
    for (const order of openOrders.slice(0, 5)) {
      console.log(`  ${order.utxo_ref?.slice(0, 16)}... | ${order.type} | ${order.pair} | ${order.budget?.progress_text} | action: ${order.available_action}`);
    }
  } catch (err: any) {
    console.error('  Open Orders: ❌', err.message);
  }

  console.log('\n── History ──');
  try {
    const history = await apiFetch<any[]>('/portfolio/history', {
      params: { wallet_address: address, limit: '10' },
    });
    console.log(`  ${history.length} history entries`);
    for (const entry of history.slice(0, 5)) {
      console.log(`  ${entry.order_id?.slice(0, 16)}... | ${entry.type} | ${entry.status} | ${entry.pair} | $${entry.execution?.total_value_usd?.toFixed(2)}`);
    }
  } catch (err: any) {
    console.error('  History: ❌', err.message);
  }

  console.log('\n── LP Positions ──');
  try {
    const lp = await apiFetch<any[]>('/portfolio/liquidity', {
      params: { wallet_address: address },
    });
    console.log(`  ${lp.length} LP positions`);
    for (const pos of lp) {
      console.log(`  ${pos.pool_id?.slice(0, 16)}... | ${pos.pair} | LP: ${pos.lp_balance} | share: ${pos.share_percent?.toFixed(2)}%`);
    }
  } catch (err: any) {
    console.error('  LP: ❌', err.message);
  }

  // ── Legacy endpoints ──

  console.log('\n── Legacy Portfolio ──');
  try {
    const portfolio = await apiFetch<any>(`/portfolio/${address}`);
    log('Legacy Portfolio', portfolio);
  } catch (err: any) {
    console.error('  Legacy: ❌', err.message);
  }

  console.log('\n── Transactions ──');
  try {
    const txs = await apiFetch<any>(`/portfolio/${address}/transactions`, {
      params: { limit: '10' },
    });
    console.log(`  ${txs.items?.length ?? 0} recent transactions (total: ${txs.total ?? '?'})`);
    for (const tx of (txs.items ?? []).slice(0, 5)) {
      console.log(`  ${tx.id?.slice(0, 16)}... | ${tx.type} | ${tx.status} | ${tx.inputAmount} ${tx.inputAsset?.split('.')[1] || 'ADA'}`);
    }
  } catch (err: any) {
    console.error('  Transactions: ❌', err.message);
  }
}

main().catch(console.error);
