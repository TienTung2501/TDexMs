/**
 * CLI: List all pools
 * Usage: npx tsx src/list-pools.ts [--search=ADA] [--sortBy=tvl]
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const params: Record<string, string> = {
    state: 'ACTIVE',
    limit: args.limit || '20',
  };
  if (args.search) params.search = args.search;
  if (args.sortBy) params.sortBy = args.sortBy;

  const pools = await apiFetch<any>('/pools', { params });
  log(`Pools (${pools.data?.length ?? 0} results)`, pools);
}

main().catch(console.error);
