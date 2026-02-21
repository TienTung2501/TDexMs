/**
 * CLI: Run all API tests sequentially following business-logic flow.
 *
 *  Business flow order:
 *  1. health        — Service health check
 *  2. analytics     — Protocol overview, prices
 *  3. list-pools    — Existing pools
 *  4. pool-detail   — Single pool detail + history (if any pools exist)
 *  5. quote         — Get swap quote (if any pools exist)
 *  6. list-intents  — Existing intents
 *  7. list-orders   — Existing orders
 *  8. portfolio     — Portfolio for wallet address
 *  9. admin-status  — Admin health + dashboard
 *
 * Usage: npx tsx src/run-all-tests.ts
 *
 * NOTE: Write operations (create-pool, deposit, create-intent, etc.) are skipped
 * because they require on-chain TX signing and real funds. Run those individually.
 */
import { apiFetch, log, requireEnv } from './shared.js';

// Dynamic import — Lucid may fail in non-pnpm environments due to libsodium ESM issue
async function deriveAddress(): Promise<string> {
  try {
    const { Lucid, Blockfrost } = await import('@lucid-evolution/lucid');
    // Try T_WALLET_SEED first (from frontend/.env), then WALLET_SEED
    const seed = process.env.T_WALLET_SEED || process.env.WALLET_SEED;
    if (!seed) return '';
    const network = (process.env.CARDANO_NETWORK || process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
    const lucid = await Lucid(
      new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
      network,
    );
    lucid.selectWallet.fromSeed(seed);
    return lucid.wallet().address();
  } catch {
    return '';
  }
}

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<string | void>): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', details: detail || undefined, duration: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    results.push({ name, status: 'FAIL', details: err.message, duration: Date.now() - start });
    console.log(`  ❌ ${name}: ${err.message} (${Date.now() - start}ms)`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  SolverNet DEX — Sequential API Tests    ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Derive wallet address
  let address = '';
  try {
    address = await deriveAddress();
    if (address) {
      console.log(`Wallet: ${address.slice(0, 20)}...${address.slice(-8)}\n`);
    } else {
      // Fallback: try WALLET_ADDRESS env var
      address = process.env.WALLET_ADDRESS || '';
      if (address) {
        console.log(`Wallet (env): ${address.slice(0, 20)}...${address.slice(-8)}\n`);
      } else {
        console.log('  ⚠️  No wallet configured — skipping wallet-dependent tests\n');
      }
    }
  } catch {
    console.log('  ⚠️  No wallet configured — skipping wallet-dependent tests\n');
  }

  // ── 1. Health ──
  console.log('── 1. Health ──');
  await runTest('GET /health', async () => {
    const h = await apiFetch<any>('/health');
    if (!h.status) throw new Error('Missing status field');
    return `status=${h.status}, db=${h.services?.database}`;
  });

  await runTest('GET /health/ready', async () => {
    const h = await apiFetch<any>('/health/ready');
    return `ready=${h.ready ?? h.status}`;
  });

  // ── 2. Analytics ──
  console.log('\n── 2. Analytics ──');
  await runTest('GET /analytics/overview', async () => {
    const o = await apiFetch<any>('/analytics/overview');
    if (o.tvl === undefined) throw new Error('Missing tvl');
    return `tvl=${o.tvl}, pools=${o.totalPools}, traders=${o.uniqueTraders}`;
  });

  await runTest('GET /analytics/prices', async () => {
    const p = await apiFetch<any>('/analytics/prices');
    if (!p.prices) throw new Error('Missing prices array');
    return `${p.prices.length} tokens`;
  });

  // ── 3. List Pools ──
  console.log('\n── 3. Pools ──');
  let firstPoolId = '';
  await runTest('GET /pools', async () => {
    const pools = await apiFetch<any>('/pools?limit=5');
    // Handle both old format { items } and new format { data, pagination }
    const items = pools.data ?? pools.items ?? [];
    const total = pools.pagination?.total ?? pools.total ?? 0;
    firstPoolId = items[0]?.poolId || '';
    return `${items.length} pools, total=${total}`;
  });

  // ── 4. Pool Detail + History ──
  if (firstPoolId) {
    await runTest(`GET /pools/${firstPoolId.slice(0, 12)}...`, async () => {
      const p = await apiFetch<any>(`/pools/${firstPoolId}`);
      if (!p.poolId) throw new Error('Missing poolId');
      if (typeof p.reserveA !== 'string') throw new Error('reserveA should be string');
      return `state=${p.state}, tvl=${p.tvlAda}`;
    });

    await runTest(`GET /pools/${firstPoolId.slice(0, 12)}.../history`, async () => {
      const h = await apiFetch<any>(`/pools/${firstPoolId}/history?period=7d`);
      if (!h.history) throw new Error('Missing history array');
      return `${h.history.length} data points`;
    });
  } else {
    results.push({ name: 'GET /pools/:id', status: 'SKIP', details: 'No pools', duration: 0 });
    results.push({ name: 'GET /pools/:id/history', status: 'SKIP', details: 'No pools', duration: 0 });
    console.log('  ⏭  Pool detail/history skipped (no pools)');
  }

  // ── 5. Quote ──
  console.log('\n── 4. Quote ──');
  if (firstPoolId) {
    await runTest('GET /quote', async () => {
      // Use a generic quote — may fail if pool has no reserves  
      const q = await apiFetch<any>('/quote', {
        params: {
          from: 'lovelace',
          to: 'lovelace',
          amount: '1000000',
          slippage: '50',
        },
      });
      return `output=${q.estimatedOutput}, route=${q.route?.length ?? 0} hops`;
    });
  } else {
    results.push({ name: 'GET /quote', status: 'SKIP', details: 'No pools', duration: 0 });
    console.log('  ⏭  Quote skipped (no pools)');
  }

  // ── 6. Intents ──
  console.log('\n── 5. Intents ──');
  await runTest('GET /intents', async () => {
    const i = await apiFetch<any>('/intents?limit=5');
    if (!i.data) throw new Error('Missing data array');
    if (!i.pagination) throw new Error('Missing pagination');
    return `${i.data.length} intents, total=${i.pagination.total}`;
  });

  // ── 7. Orders ──
  console.log('\n── 6. Orders ──');
  await runTest('GET /orders', async () => {
    const o = await apiFetch<any>('/orders?limit=5');
    if (!o.items) throw new Error('Missing items array');
    return `${o.items.length} orders, total=${o.total}`;
  });

  // ── 8. Chart ──
  console.log('\n── 7. Chart ──');
  if (firstPoolId) {
    await runTest('GET /chart/candles', async () => {
      const c = await apiFetch<any>('/chart/candles', {
        params: { poolId: firstPoolId, interval: '4h', limit: '10' },
      });
      if (!c.candles) throw new Error('Missing candles array');
      return `${c.candles.length} candles`;
    });
  } else {
    await runTest('GET /chart/config', async () => {
      const c = await apiFetch<any>('/chart/config');
      if (!c.supported_resolutions) throw new Error('Missing supported_resolutions');
      return `resolutions: ${c.supported_resolutions.join(', ')}`;
    });
  }

  // ── 9. Portfolio ──
  console.log('\n── 8. Portfolio ──');
  if (address) {
    await runTest('GET /portfolio/summary', async () => {
      const s = await apiFetch<any>('/portfolio/summary', {
        params: { wallet_address: address },
      });
      return `balance_ada=${s.total_balance_ada}, balance_usd=${s.total_balance_usd}`;
    });

    await runTest('GET /portfolio/open-orders', async () => {
      const o = await apiFetch<any>('/portfolio/open-orders', {
        params: { wallet_address: address },
      });
      return `${Array.isArray(o) ? o.length : 0} open orders`;
    });

    await runTest('GET /portfolio/history', async () => {
      const h = await apiFetch<any>('/portfolio/history', {
        params: { wallet_address: address },
      });
      return `${Array.isArray(h) ? h.length : 0} history entries`;
    });

    await runTest('GET /portfolio/liquidity', async () => {
      const l = await apiFetch<any>('/portfolio/liquidity', {
        params: { wallet_address: address },
      });
      return `${Array.isArray(l) ? l.length : 0} LP positions`;
    });

    await runTest(`GET /portfolio/${address.slice(0, 12)}...`, async () => {
      const p = await apiFetch<any>(`/portfolio/${address}`);
      return JSON.stringify(p).slice(0, 80);
    });

    await runTest(`GET /portfolio/${address.slice(0, 12)}.../transactions`, async () => {
      const t = await apiFetch<any>(`/portfolio/${address}/transactions?limit=5`);
      return `${t.items?.length ?? 0} txs, total=${t.total ?? 0}`;
    });
  } else {
    results.push({ name: 'Portfolio (6 endpoints)', status: 'SKIP', details: 'No wallet', duration: 0 });
    console.log('  ⏭  Portfolio skipped (no wallet)');
  }

  // ── 10. Admin ──
  console.log('\n── 9. Admin ──');
  await runTest('GET /admin/auth/check', async () => {
    const a = await apiFetch<any>('/admin/auth/check', {
      params: { wallet_address: address || 'addr_test1dummy' },
    });
    return `is_admin=${a.is_admin}, factory_admin=${a.roles?.is_factory_admin}`;
  });

  await runTest('GET /admin/dashboard/metrics', async () => {
    const d = await apiFetch<any>('/admin/dashboard/metrics');
    return `active_pools=${d.active_pools}, total_tvl_usd=${d.total_tvl_usd}`;
  });

  await runTest('GET /admin/revenue/pending', async () => {
    const r = await apiFetch<any>('/admin/revenue/pending');
    if (!Array.isArray(r)) throw new Error('Expected array');
    return `${r.length} pools with pending fees`;
  });

  await runTest('GET /admin/settings/current', async () => {
    const s = await apiFetch<any>('/admin/settings/current');
    if (!s.global_settings) throw new Error('Missing global_settings');
    return `factory_count=${s.factory_settings?.length ?? 0}`;
  });

  // ── 10. Admin 501 Stubs ──
  console.log('\n── 10. Admin Stubs (expect 501) ──');
  await runTest('POST /admin/revenue/build-collect → 501', async () => {
    try {
      await apiFetch<any>('/admin/revenue/build-collect', {
        method: 'POST',
        body: JSON.stringify({ admin_address: address || 'addr_test1dummy', pool_ids: ['test-pool-id'] }),
      });
      return 'OK (unexpected)';
    } catch (err: any) {
      if (err.message.includes('501')) return '501 as expected';
      throw err;
    }
  });

  await runTest('POST /admin/settings/build-update-global → 501', async () => {
    try {
      await apiFetch<any>('/admin/settings/build-update-global', {
        method: 'POST',
        body: JSON.stringify({ admin_address: address || 'addr_test1dummy', new_settings: {} }),
      });
      return 'OK (unexpected)';
    } catch (err: any) {
      if (err.message.includes('501')) return '501 as expected';
      throw err;
    }
  });

  await runTest('POST /admin/pools/build-burn → 501', async () => {
    try {
      await apiFetch<any>('/admin/pools/build-burn', {
        method: 'POST',
        body: JSON.stringify({ admin_address: address || 'addr_test1dummy', pool_id: 'test' }),
      });
      return 'OK (unexpected)';
    } catch (err: any) {
      if (err.message.includes('501')) return '501 as expected';
      throw err;
    }
  });

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              TEST SUMMARY                ║');
  console.log('╚══════════════════════════════════════════╝');

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const totalMs = results.reduce((s, r) => s + r.duration, 0);

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭ ';
    const detail = r.details ? ` — ${r.details}` : '';
    console.log(`  ${icon} ${r.name}${detail}`);
  }

  console.log(`\n  Total: ${results.length} | ✅ ${pass} | ❌ ${fail} | ⏭  ${skip} | ${totalMs}ms`);

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
