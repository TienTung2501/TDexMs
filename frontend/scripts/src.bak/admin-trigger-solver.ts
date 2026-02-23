/**
 * CLI Admin: Check solver status and pending batches
 * Usage: npx tsx src/admin-trigger-solver.ts
 *
 * Shows active intents and orders that the solver would process.
 * The solver runs on a cron schedule in the backend; this script
 * just inspects the current queue state.
 *
 * Environment:
 *   API_BASE (optional, defaults to production)
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  console.log('🧠 SolverNet — Solver Queue Inspector\n');

  // Check pending intents
  console.log('── Active Intents (solver input) ──');
  try {
    const intents = await apiFetch<any>('/intents', { params: { status: 'ACTIVE', limit: '10' } });
    const items = intents.data ?? [];
    const total = intents.pagination?.total ?? items.length;
    console.log(`  ${items.length} displayed / ${total} total active intents`);

    for (const i of items.slice(0, 5)) {
      console.log(`    ${i.id?.slice(0, 16)}... | ${i.inputAmount} ${i.inputAsset?.slice(-8)} → ${i.minOutput} ${i.outputAsset?.slice(-8)} | deadline: ${i.deadline}`);
    }
    if (items.length === 0) {
      console.log('  No active intents — solver has nothing to process.');
    }
  } catch (err: any) {
    console.warn(`  Could not check intents: ${err.message}`);
  }

  // Check active orders
  console.log('\n── Active Orders ──');
  try {
    const orders = await apiFetch<any>('/orders', { params: { status: 'ACTIVE', limit: '10' } });
    const items = orders.items ?? [];
    console.log(`  ${items.length} displayed / ${orders.total ?? items.length} total active orders`);

    for (const o of items.slice(0, 5)) {
      console.log(`    ${o.id?.slice(0, 16)}... | ${o.type} | ${o.inputAmount} ${o.inputAsset?.slice(-8)}`);
    }
    if (items.length === 0) {
      console.log('  No active orders.');
    }
  } catch (err: any) {
    console.warn(`  Could not check orders: ${err.message}`);
  }

  // Check pool liquidity available for matching
  console.log('\n── Active Pools (solver liquidity) ──');
  try {
    const pools = await apiFetch<any>('/pools?limit=10');
    const items = pools.data ?? pools.items ?? [];
    console.log(`  ${items.length} active pools`);

    for (const p of items.slice(0, 5)) {
      console.log(`    ${p.poolId?.slice(0, 16)}... | reserveA: ${p.reserveA} | reserveB: ${p.reserveB} | TVL: ${p.tvlAda}`);
    }
    if (items.length === 0) {
      console.log('  No pools — solver cannot match intents without liquidity.');
    }
  } catch (err: any) {
    console.warn(`  Could not check pools: ${err.message}`);
  }

  console.log('\n  ℹ️  The solver runs automatically on a cron schedule in the backend.');
  console.log('  Ensure SOLVER_ENABLED=true in backend .env to activate it.');
  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
