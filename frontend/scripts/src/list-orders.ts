/**
 * CLI: List orders
 * Usage: npx tsx src/list-orders.ts [--creator=addr_test1...] [--type=LIMIT] [--status=ACTIVE]
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const params: Record<string, string> = {
    limit: args.limit || '20',
  };
  if (args.creator) params.creator = args.creator;
  if (args.type) params.type = args.type;
  if (args.status) params.status = args.status;

  const orders = await apiFetch<any>('/orders', { params });
  log(`Orders (${orders.items?.length ?? 0} results)`, orders);
}

main().catch(console.error);
