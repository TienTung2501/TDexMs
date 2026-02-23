/**
 * CLI: Submit a signed TX directly
 * Usage: npx tsx src/submit-tx.ts --signedTx=<cbor_hex> [--intentId=abc]
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  if (!args.signedTx) {
    console.error('Usage: npx tsx src/submit-tx.ts --signedTx=<cbor_hex>');
    process.exit(1);
  }

  const result = await apiFetch<any>('/tx/submit', {
    method: 'POST',
    body: JSON.stringify({
      signedTx: args.signedTx,
      intentId: args.intentId,
    }),
  });

  log('TX Submit Result', result);
}

main().catch(console.error);
