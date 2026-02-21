/**
 * CLI: Get trade quote
 * Usage: npx tsx src/quote.ts --inputAsset=lovelace --outputAsset=test0001.74425443 --inputAmount=10000000
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const params = {
    inputAsset: args.inputAsset || 'lovelace',
    outputAsset: args.outputAsset || 'test0001.74425443',
    inputAmount: args.inputAmount || '10000000',
    slippage: args.slippage || '50', // 50 basis points = 0.5%
  };

  console.log('Fetching quote with params:', params);
  const quote = await apiFetch<any>('/quote', { params });
  log('Quote', quote);
}

main().catch(console.error);
