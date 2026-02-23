/**
 * CLI: Check backend health
 * Usage: npx tsx src/health.ts
 */
import { apiFetch, log } from './shared.js';

async function main() {
  const health = await apiFetch<any>('/health');
  log('Health Check', health);
}

main().catch(console.error);
