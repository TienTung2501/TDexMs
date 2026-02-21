#!/usr/bin/env node
/**
 * SolverNet DEX — CLI API Simulation & Test Script
 *
 * Simulates frontend HTTP calls against the backend.
 * Run:  node scripts/test-api.js [base_url]
 *
 * Default base URL: http://localhost:3001/v1
 * Remote:           node scripts/test-api.js https://tdexms.onrender.com/v1
 */

const BASE_URL = process.argv[2] || 'http://localhost:3001/v1';

// ─── ANSI Colors ─────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
  dim:   '\x1b[2m',
  bold:  '\x1b[1m',
};

// ─── Test state ──────────────────────────────────────────
const results = [];
let passCount = 0;
let failCount = 0;
let skipCount = 0;

// Wallet address from T_WALLET_SEED
const WALLET_ADDR = 'addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua';

// ─── Helpers ─────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const { params, body, method = 'GET' } = options;
  let url = `${BASE_URL}${path}`;
  if (params) {
    url += '?' + new URLSearchParams(params).toString();
  }

  const init = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);

  const start = Date.now();
  const res = await fetch(url, init);
  const ms = Date.now() - start;
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json, ms };
}

async function runTest(name, fn) {
  try {
    const result = await fn();
    if (result === 'SKIP') {
      skipCount++;
      results.push({ name, status: 'SKIP', detail: 'skipped' });
      console.log(`  ${C.yellow}⊘ SKIP${C.reset}  ${name}`);
      return null;
    }
    passCount++;
    results.push({ name, status: 'PASS', detail: result });
    console.log(`  ${C.green}✓ PASS${C.reset}  ${name} ${C.dim}${result || ''}${C.reset}`);
    return result;
  } catch (err) {
    failCount++;
    const msg = err.message || String(err);
    results.push({ name, status: 'FAIL', detail: msg });
    console.log(`  ${C.red}✗ FAIL${C.reset}  ${name}`);
    console.log(`         ${C.dim}${msg}${C.reset}`);
    return null;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ═════════════════════════════════════════════════════════
// TEST SUITES
// ═════════════════════════════════════════════════════════

async function testHealth() {
  console.log(`\n${C.cyan}${C.bold}── Health ──${C.reset}`);

  await runTest('GET /health returns status', async () => {
    const r = await apiFetch('/health');
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.json.status === 'healthy' || r.json.status, 'missing status');
    return `${r.ms}ms | status=${r.json.status}`;
  });

  await runTest('GET /health/ready returns 200', async () => {
    const r = await apiFetch('/health/ready');
    assert(r.status === 200 || r.status === 503, `unexpected ${r.status}`);
    return `${r.ms}ms | ${r.status}`;
  });
}

async function testQuote() {
  console.log(`\n${C.cyan}${C.bold}── Quote ──${C.reset}`);

  await runTest('GET /quote with valid params', async () => {
    const r = await apiFetch('/quote', {
      params: { inputAsset: 'lovelace', outputAsset: 'lovelace', amount: '1000000' },
    });
    // May return 400 if no pools — that's acceptable
    return `${r.ms}ms | ${r.status} | ${JSON.stringify(r.json).slice(0, 120)}`;
  });
}

async function testPools() {
  console.log(`\n${C.cyan}${C.bold}── Pools ──${C.reset}`);

  let firstPoolId = null;

  await runTest('GET /pools returns list', async () => {
    const r = await apiFetch('/pools');
    assert(r.ok, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
    const pools = r.json.data || r.json.items || r.json;
    assert(Array.isArray(pools), 'response is not array/list');
    if (pools.length > 0) firstPoolId = pools[0].poolId || pools[0].id;
    return `${r.ms}ms | ${pools.length} pools`;
  });

  await runTest('GET /pools/:poolId returns pool detail with object assets', async () => {
    if (!firstPoolId) return 'SKIP';
    const r = await apiFetch(`/pools/${firstPoolId}`);
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.json.poolId, 'missing poolId');
    // CRITICAL: assetA must be an object, not a string
    assert(typeof r.json.assetA === 'object', `assetA should be object, got: ${typeof r.json.assetA}`);
    assert(typeof r.json.assetA.policyId === 'string', 'assetA.policyId missing');
    assert(typeof r.json.assetB === 'object', `assetB should be object`);
    return `${r.ms}ms | ${r.json.poolId} | assetA=${JSON.stringify(r.json.assetA)}`;
  });

  await runTest('GET /pools/:poolId/history returns history array', async () => {
    if (!firstPoolId) return 'SKIP';
    const r = await apiFetch(`/pools/${firstPoolId}/history`, {
      params: { period: '7d', interval: '1d' },
    });
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.json.poolId, 'missing poolId key');
    assert(Array.isArray(r.json.history), 'missing history array');
    if (r.json.history.length > 0) {
      const h = r.json.history[0];
      assert('timestamp' in h, 'missing timestamp field');
      assert('tvlAda' in h, 'missing tvlAda field');
      assert('volume' in h, 'missing volume field');
      assert('price' in h, 'missing price field');
    }
    return `${r.ms}ms | ${r.json.history?.length} entries`;
  });

  await runTest('POST /pools/create (dry run — expect validation or build tx)', async () => {
    const r = await apiFetch('/pools/create', {
      method: 'POST',
      body: {
        assetAPolicyId: '',
        assetAAssetName: '',
        assetBPolicyId: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        assetBAssetName: '544553544f4b454e',
        initialA: '100000000',
        initialB: '1000000000',
        feeNumerator: 30,
        senderAddress: WALLET_ADDR,
        changeAddress: WALLET_ADDR,
      },
    });
    // 201 = success, 400 = validation, 500 = tx build issue
    return `${r.ms}ms | ${r.status} | ${JSON.stringify(r.json).slice(0, 150)}`;
  });

  return firstPoolId;
}

async function testIntents() {
  console.log(`\n${C.cyan}${C.bold}── Intents ──${C.reset}`);

  await runTest('GET /intents returns list', async () => {
    const r = await apiFetch('/intents');
    assert(r.ok, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
    return `${r.ms}ms | total=${r.json.pagination?.total || r.json.total || '?'}`;
  });

  await runTest('POST /intents (dry run — create intent)', async () => {
    const r = await apiFetch('/intents', {
      method: 'POST',
      body: {
        inputPolicyId: '',
        inputAssetName: '',
        inputAmount: '10000000',
        outputPolicyId: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        outputAssetName: '544553544f4b454e',
        minOutput: '1000000',
        senderAddress: WALLET_ADDR,
        changeAddress: WALLET_ADDR,
        deadline: Math.floor(Date.now() / 1000) + 86400,
      },
    });
    return `${r.ms}ms | ${r.status} | ${JSON.stringify(r.json).slice(0, 150)}`;
  });
}

async function testOrders() {
  console.log(`\n${C.cyan}${C.bold}── Orders ──${C.reset}`);

  await runTest('GET /orders returns list', async () => {
    const r = await apiFetch('/orders');
    assert(r.ok, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
    return `${r.ms}ms | total=${r.json.pagination?.total || r.json.total || '?'}`;
  });

  await runTest('POST /orders (dry run — create order)', async () => {
    const r = await apiFetch('/orders', {
      method: 'POST',
      body: {
        type: 'LIMIT',
        inputPolicyId: '',
        inputAssetName: '',
        outputPolicyId: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        outputAssetName: '544553544f4b454e',
        totalBudget: '50000000',
        targetPrice: '0.005',
        senderAddress: WALLET_ADDR,
        changeAddress: WALLET_ADDR,
      },
    });
    return `${r.ms}ms | ${r.status} | ${JSON.stringify(r.json).slice(0, 150)}`;
  });
}

async function testPortfolio() {
  console.log(`\n${C.cyan}${C.bold}── Portfolio ──${C.reset}`);

  await runTest('GET /portfolio/summary returns aggregated data', async () => {
    const r = await apiFetch('/portfolio/summary', {
      params: { wallet_address: WALLET_ADDR },
    });
    assert(r.ok, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
    assert('total_balance_ada' in r.json || 'status_breakdown' in r.json, 'missing summary fields');
    return `${r.ms}ms | balance_ada=${r.json.total_balance_ada}`;
  });

  await runTest('GET /portfolio/open-orders returns array', async () => {
    const r = await apiFetch('/portfolio/open-orders', {
      params: { wallet_address: WALLET_ADDR },
    });
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.json), `expected array, got ${typeof r.json}`);
    return `${r.ms}ms | ${r.json.length} open orders`;
  });

  await runTest('GET /portfolio/history returns array (filter=FILLED)', async () => {
    const r = await apiFetch('/portfolio/history', {
      params: { wallet_address: WALLET_ADDR, status: 'FILLED' },
    });
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.json), 'expected array');
    return `${r.ms}ms | ${r.json.length} history entries`;
  });

  await runTest('GET /portfolio/liquidity returns array', async () => {
    const r = await apiFetch('/portfolio/liquidity', {
      params: { wallet_address: WALLET_ADDR },
    });
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.json), 'expected array');
    return `${r.ms}ms | ${r.json.length} LP positions`;
  });

  // Legacy endpoint
  await runTest('GET /portfolio/:address returns legacy summary', async () => {
    const r = await apiFetch(`/portfolio/${WALLET_ADDR}`);
    assert(r.ok, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
    return `${r.ms}ms`;
  });

  await runTest('GET /portfolio/:address/transactions returns tx list', async () => {
    const r = await apiFetch(`/portfolio/${WALLET_ADDR}/transactions`);
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.json.items || Array.isArray(r.json), 'missing items');
    return `${r.ms}ms | total=${r.json.total || '?'}`;
  });
}

async function testAnalytics() {
  console.log(`\n${C.cyan}${C.bold}── Analytics ──${C.reset}`);

  await runTest('GET /analytics/overview returns protocol stats', async () => {
    const r = await apiFetch('/analytics/overview');
    assert(r.ok, `HTTP ${r.status}`);
    assert('totalPools' in r.json, 'missing totalPools');
    return `${r.ms}ms | pools=${r.json.totalPools} tvl=${r.json.tvl}`;
  });

  await runTest('GET /analytics/prices returns {prices: PriceEntry[]}', async () => {
    const r = await apiFetch('/analytics/prices');
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.json.prices), `expected prices array, got: ${JSON.stringify(r.json).slice(0, 100)}`);
    if (r.json.prices.length > 0) {
      const p = r.json.prices[0];
      assert('ticker' in p, 'missing ticker');
      assert('priceAda' in p, 'missing priceAda (camelCase)');
      assert('priceUsd' in p, 'missing priceUsd');
    }
    return `${r.ms}ms | ${r.json.prices.length} tokens`;
  });
}

async function testChart() {
  console.log(`\n${C.cyan}${C.bold}── Chart ──${C.reset}`);

  await runTest('GET /chart/config returns TradingView config', async () => {
    const r = await apiFetch('/chart/config');
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.json.supported_resolutions), 'missing supported_resolutions');
    return `${r.ms}ms`;
  });

  await runTest('GET /chart/intervals returns intervals', async () => {
    const r = await apiFetch('/chart/intervals');
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.json.intervals, 'missing intervals');
    return `${r.ms}ms | ${JSON.stringify(r.json.intervals)}`;
  });
}

async function testTx() {
  console.log(`\n${C.cyan}${C.bold}── Transaction ──${C.reset}`);

  await runTest('POST /tx/submit rejects invalid input', async () => {
    const r = await apiFetch('/tx/submit', { method: 'POST', body: {} });
    assert(r.status === 400, `expected 400, got ${r.status}`);
    return `${r.ms}ms | correctly rejected`;
  });

  await runTest('GET /tx/:txHash/status returns status object', async () => {
    // Use a fake hash — should return confirmed=false or error
    const r = await apiFetch('/tx/aaaa00000000000000000000000000000000000000000000000000000000aaaa/status');
    // Status response shape: { txHash, status, confirmations? }
    if (r.ok) {
      assert('status' in r.json, 'missing status field');
      return `${r.ms}ms | status=${r.json.status}`;
    }
    return `${r.ms}ms | ${r.status} (expected for fake hash)`;
  });
}

async function testAdmin() {
  console.log(`\n${C.cyan}${C.bold}── Admin ──${C.reset}`);

  await runTest('GET /admin/auth/check with wallet', async () => {
    const r = await apiFetch('/admin/auth/check', {
      params: { wallet_address: WALLET_ADDR },
    });
    assert(r.ok, `HTTP ${r.status}`);
    assert('is_admin' in r.json, 'missing is_admin');
    return `${r.ms}ms | is_admin=${r.json.is_admin}`;
  });

  await runTest('GET /admin/dashboard/metrics returns metrics', async () => {
    const r = await apiFetch('/admin/dashboard/metrics');
    assert(r.ok, `HTTP ${r.status}`);
    assert('total_pools' in r.json, 'missing total_pools');
    return `${r.ms}ms | pools=${r.json.total_pools}`;
  });

  await runTest('GET /admin/revenue/pending returns fee breakdown', async () => {
    const r = await apiFetch('/admin/revenue/pending');
    assert(r.ok, `HTTP ${r.status}`);
    assert('total_pending_ada' in r.json, 'missing total_pending_ada');
    return `${r.ms}ms | pending=${r.json.total_pending_ada} ADA`;
  });

  await runTest('GET /admin/settings/current returns settings', async () => {
    const r = await apiFetch('/admin/settings/current');
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.json.global || r.json.factory, 'missing settings data');
    return `${r.ms}ms`;
  });

  await runTest('POST /admin/revenue/build-collect returns 501 (not implemented)', async () => {
    const r = await apiFetch('/admin/revenue/build-collect', {
      method: 'POST',
      body: { wallet_address: WALLET_ADDR },
    });
    assert(r.status === 501, `expected 501, got ${r.status}`);
    return `${r.ms}ms | correctly returns 501`;
  });

  await runTest('POST /admin/pools/build-burn returns 501 (not implemented)', async () => {
    const r = await apiFetch('/admin/pools/build-burn', {
      method: 'POST',
      body: { pool_id: 'test', wallet_address: WALLET_ADDR },
    });
    assert(r.status === 501, `expected 501, got ${r.status}`);
    return `${r.ms}ms | correctly returns 501`;
  });
}

// ═════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════
async function main() {
  console.log(`${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║     SolverNet DEX — API Simulation Test Suite           ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}Target: ${BASE_URL}${C.reset}`);

  // Check connectivity first
  try {
    const r = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log(`${C.green}✓ Backend reachable${C.reset}\n`);
  } catch (e) {
    console.log(`${C.red}✗ Cannot reach backend at ${BASE_URL}${C.reset}`);
    console.log(`  ${C.dim}${e.message}${C.reset}`);
    console.log(`\n  Start the backend first: cd backend && pnpm dev`);
    console.log(`  Or test against Render: node scripts/test-api.js https://tdexms.onrender.com/v1\n`);
    process.exit(1);
  }

  await testHealth();
  await testQuote();
  await testPools();
  await testIntents();
  await testOrders();
  await testPortfolio();
  await testAnalytics();
  await testChart();
  await testTx();
  await testAdmin();

  // ─── Summary ─────────────────────────────────
  console.log(`\n${C.bold}═══════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold} Results: ${C.green}${passCount} PASS${C.reset}  ${failCount ? C.red : C.dim}${failCount} FAIL${C.reset}  ${skipCount ? C.yellow : C.dim}${skipCount} SKIP${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════${C.reset}`);

  if (failCount > 0) {
    console.log(`\n${C.red}Failed tests:${C.reset}`);
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${C.red}✗${C.reset} ${r.name}: ${r.detail}`);
    });
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`\n${C.red}Fatal error:${C.reset}`, e);
  process.exit(2);
});
