/**
 * CLI: List intents
 * Usage: npx tsx src/list-intents.ts [--address=addr_test1...] [--status=ACTIVE]
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const params: Record<string, string> = {
    limit: args.limit || '20',
  };
  if (args.address) params.address = args.address;
  if (args.status) params.status = args.status;

  const intents = await apiFetch<any>('/intents', { params });
  log(`Intents (${intents.data?.length ?? 0} results)`, intents);
}

main().catch(console.error);
