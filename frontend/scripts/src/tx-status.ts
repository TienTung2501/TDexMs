/**
 * CLI: Check transaction status
 * Usage: npx tsx src/tx-status.ts --hash=<txHash>
 *
 * Tests:
 *   GET /tx/:txHash/status — Transaction status
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const txHash = args.hash;

  if (!txHash) {
    console.error('Usage: npx tsx src/tx-status.ts --hash=<txHash>');
    process.exit(1);
  }

  console.log(`Checking TX: ${txHash}`);

  try {
    const status = await apiFetch<any>(`/tx/${txHash}/status`);
    log('TX Status', status);
  } catch (err: any) {
    console.error('  ❌', err.message);
  }
}

main().catch(console.error);
