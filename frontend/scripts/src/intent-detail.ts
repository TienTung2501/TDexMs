/**
 * CLI: Get intent detail by ID
 * Usage: npx tsx src/intent-detail.ts --id=<intentId>
 *
 * Tests: GET /intents/:intentId
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const intentId = args.id || args.intentId;

  if (!intentId) {
    // List recent intents and pick the first one
    console.log('No --id provided. Fetching recent intents...\n');
    const intents = await apiFetch<any>('/intents?limit=5');
    const items = intents.data ?? [];
    if (items.length === 0) {
      console.log('No intents found. Create one first with: npx tsx src/create-intent.ts');
      process.exit(0);
    }
    for (const i of items) {
      console.log(`  ${i.id?.slice(0, 16)}... | ${i.status} | ${i.inputAsset?.slice(0, 16)}... → ${i.outputAsset?.slice(0, 16)}...`);
    }
    console.log(`\nPass --id=<intentId> to view details.`);
    return;
  }

  console.log(`Fetching intent: ${intentId}\n`);
  const intent = await apiFetch<any>(`/intents/${intentId}`);
  log('Intent Detail', intent);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
