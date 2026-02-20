/**
 * CLI: View portfolio for an address
 * Usage: npx tsx src/portfolio.ts [--address=addr_test1...]
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

  const portfolio = await apiFetch<any>(`/portfolio/${address}`);
  log('Portfolio', portfolio);

  const txs = await apiFetch<any>(`/portfolio/${address}/transactions?limit=10`);
  log('Recent Transactions', txs);
}

main().catch(console.error);
