/**
 * CLI Admin: Force-trigger the solver engine to process pending batches
 * Usage: npx tsx src/admin-trigger-solver.ts [--dryRun]
 *
 * Useful for testing the solver without waiting for the cron interval.
 * Use --dryRun to simulate without submitting transactions.
 *
 * Environment:
 *   WALLET_SEED, BLOCKFROST_URL, BLOCKFROST_PROJECT_ID
 */
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const dryRun = args.dryRun === 'true';

  console.log(`🧠 Triggering Solver Engine${dryRun ? ' (DRY RUN)' : ''}...\n`);

  // Check pending intents first
  try {
    const intents = await apiFetch<any>('/intents', { params: { status: 'PENDING' } });
    const items = intents.intents || intents;
    console.log(`  Pending intents: ${Array.isArray(items) ? items.length : 0}`);

    if (Array.isArray(items) && items.length === 0) {
      console.log('\n  No pending intents to process. Solver has nothing to do.');
      return;
    }
  } catch (err: any) {
    console.warn(`  Could not check intents: ${err.message}`);
  }

  // Trigger solver
  try {
    const result = await apiFetch<any>('/admin/solver/trigger', {
      method: 'POST',
      body: JSON.stringify({
        dryRun,
        adminAddress: process.env.WALLET_SEED ? 'from-env' : undefined,
      }),
    });
    log('Solver result', result);
  } catch (err: any) {
    if (err.message.includes('404') || err.message.includes('Not Found')) {
      console.log('\n  Note: /admin/solver/trigger endpoint not yet implemented.');
      console.log('  The solver runs on a cron schedule. To test it, ensure:');
      console.log('  1. The backend is running');
      console.log('  2. SOLVER_ENABLED=true in backend .env');
      console.log('  3. There are pending intents in the database');
    } else {
      throw err;
    }
  }

  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error('\n❌ Trigger solver failed:', err.message || err);
  process.exit(1);
});
