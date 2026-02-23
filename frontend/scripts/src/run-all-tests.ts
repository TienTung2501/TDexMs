/**
 * ═══════════════════════════════════════════════════════════════════
 * RUN ALL TESTS — SolverNet DEX E2E Test Orchestrator
 * ═══════════════════════════════════════════════════════════════════
 *
 * Sequentially runs all test phases (00 → 07):
 *   Phase 00: Clear UTxOs & reset
 *   Phase 01: Mint & distribute test tokens
 *   Phase 02: Setup pool
 *   Phase 03: Intent tests
 *   Phase 04: Order tests
 *   Phase 05: Liquidity tests
 *   Phase 06: Admin & data queries
 *   Phase 07: DB verification
 *
 * Usage:
 *   npx tsx src/run-all-tests.ts                  # Run all phases
 *   npx tsx src/run-all-tests.ts --skip=00,01     # Skip setup phases
 *   npx tsx src/run-all-tests.ts --only=03,04     # Run only specific phases
 *   npx tsx src/run-all-tests.ts --from=03        # Start from phase 03
 */
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PhaseResult {
  phase: string;
  name: string;
  durationSec: number;
  exitCode: number;
}

const PHASES = [
  { id: '00', name: 'Clear UTxOs & Reset', file: '00-clear-utxos.ts' },
  { id: '01', name: 'Mint & Distribute Tokens', file: '01-mint-and-distribute.ts' },
  { id: '02', name: 'Setup Pool', file: '02-setup-pool.ts' },
  { id: '03', name: 'Intent Tests', file: '03-intent-tests.ts' },
  { id: '04', name: 'Order Tests', file: '04-order-tests.ts' },
  { id: '05', name: 'Liquidity Tests', file: '05-liquidity-tests.ts' },
  { id: '06', name: 'Admin & Data Queries', file: '06-admin-and-queries.ts' },
  { id: '07', name: 'DB Verification', file: '07-db-verification.ts' },
];

function parseFlags(): { skip: Set<string>; only: Set<string> | null; from: string | null } {
  const args: Record<string, string> = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      args[key] = rest.join('=') || 'true';
    }
  });

  return {
    skip: new Set((args.skip || '').split(',').filter(Boolean)),
    only: args.only ? new Set(args.only.split(',').filter(Boolean)) : null,
    from: args.from || null,
  };
}

function runPhase(phase: typeof PHASES[0], extraArgs: string): PhaseResult {
  const filePath = resolve(__dirname, phase.file);
  const command = `npx tsx "${filePath}" ${extraArgs}`;

  console.log(`\n${'#'.repeat(70)}`);
  console.log(`##  PHASE ${phase.id}: ${phase.name.toUpperCase()}`);
  console.log(`${'#'.repeat(70)}`);

  const start = Date.now();
  let exitCode = 0;
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: resolve(__dirname, '..'),
      env: { ...process.env },
      timeout: 15 * 60 * 1000, // 15 min per phase
    });
  } catch (e: any) {
    exitCode = e.status || 1;
    console.error(`\n⚠️  Phase ${phase.id} exited with code ${exitCode}`);
  }
  const durationSec = (Date.now() - start) / 1000;

  return { phase: phase.id, name: phase.name, durationSec, exitCode };
}

function main() {
  const startTime = Date.now();
  const flags = parseFlags();

  console.log('████████████████████████████████████████████████████████████');
  console.log('██                                                      ██');
  console.log('██    SolverNet DEX — Full E2E Test Suite               ██');
  console.log('██                                                      ██');
  console.log('████████████████████████████████████████████████████████████');
  console.log(`\n  Time: ${new Date().toISOString()}`);

  if (flags.skip.size > 0) console.log(`  Skipping: ${[...flags.skip].join(', ')}`);
  if (flags.only) console.log(`  Only running: ${[...flags.only].join(', ')}`);
  if (flags.from) console.log(`  Starting from: ${flags.from}`);

  let started = !flags.from;
  const results: PhaseResult[] = [];

  // Forward extra args to each phase (e.g. --dry-run)
  const extraArgs = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--skip') && !a.startsWith('--only') && !a.startsWith('--from'))
    .join(' ');

  for (const phase of PHASES) {
    if (!started) {
      if (phase.id === flags.from) {
        started = true;
      } else {
        console.log(`\n  ⏭️  Skipping Phase ${phase.id} (before --from=${flags.from})`);
        continue;
      }
    }

    if (flags.skip.has(phase.id)) {
      console.log(`\n  ⏭️  Skipping Phase ${phase.id}: ${phase.name} (--skip)`);
      results.push({ phase: phase.id, name: phase.name, durationSec: 0, exitCode: -1 });
      continue;
    }

    if (flags.only && !flags.only.has(phase.id)) {
      console.log(`\n  ⏭️  Skipping Phase ${phase.id}: ${phase.name} (not in --only)`);
      results.push({ phase: phase.id, name: phase.name, durationSec: 0, exitCode: -1 });
      continue;
    }

    const result = runPhase(phase, extraArgs);
    results.push(result);

    // If a critical setup phase fails (00, 01, 02), ask whether to continue
    if (result.exitCode !== 0 && ['00', '01', '02'].includes(phase.id)) {
      console.log(`\n⚠️  Setup phase ${phase.id} failed! Subsequent tests may not work.`);
      console.log(`    Continuing anyway...`);
    }
  }

  // ─── Final Summary ─────────────────────
  const totalSec = (Date.now() - startTime) / 1000;

  console.log('\n\n' + '█'.repeat(70));
  console.log('██  FULL TEST SUITE RESULTS');
  console.log('█'.repeat(70));
  console.log('');
  console.log('  Phase  │ Name                       │ Duration  │ Result');
  console.log('  ───────┼────────────────────────────┼───────────┼────────');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    const dur = r.exitCode === -1 ? '---' : `${r.durationSec.toFixed(1)}s`;
    const status = r.exitCode === -1 ? '⏭️  SKIP' : r.exitCode === 0 ? '✅ PASS' : '❌ FAIL';
    const name = r.name.padEnd(26);
    const durPad = dur.padStart(8);
    console.log(`  ${r.phase}     │ ${name} │ ${durPad}  │ ${status}`);

    if (r.exitCode === -1) skipped++;
    else if (r.exitCode === 0) passed++;
    else failed++;
  }

  console.log('  ───────┼────────────────────────────┼───────────┼────────');
  console.log(`  Total: ${results.length} phases, ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  Duration: ${totalSec.toFixed(1)}s`);
  console.log('█'.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

main();
