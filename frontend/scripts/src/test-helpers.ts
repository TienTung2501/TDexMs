/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST HELPERS — SolverNet DEX E2E Testing
 * ═══════════════════════════════════════════════════════════════════
 *
 * Shared utilities for all test scripts:
 *   - Wallet initialization (multiple wallets)
 *   - API client with retry
 *   - Transaction signing & submission
 *   - Token policy helpers
 *   - Logging & assertions
 */
import 'dotenv/config';
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
  type Script,
  type LucidEvolution,
  type UTxO,
} from '@lucid-evolution/lucid';

// ─── Constants ───────────────────────────────
export const API_BASE = process.env.API_BASE || 'http://localhost:3001';
export const API_V1 = `${API_BASE}/v1`;
export const NETWORK = (process.env.NETWORK || process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod';
export const BF_URL = process.env.BLOCKFROST_URL || 'https://cardano-preprod.blockfrost.io/api/v0';
export const BF_KEY = process.env.BLOCKFROST_PROJECT_ID || '';

export const ESCROW_SCRIPT_ADDRESS = process.env.ESCROW_SCRIPT_ADDRESS || '';
export const POOL_SCRIPT_ADDRESS = process.env.POOL_SCRIPT_ADDRESS || '';
export const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || process.env.T_addr1 || '';

// Old script addresses (before recompilation)
export const OLD_ESCROW_ADDRESS = 'addr_test1wr679s5yp7jg2yem96ljkzyuwcw795mw2nm3lz3yd4jy5ysvw6ut9';
export const OLD_POOL_ADDRESS = 'addr_test1wrurs8zeaqm7atrsdldaltervfp59ztrzemxf9rskyumdxgrq8j58';

// Known test token tickers
export const TEST_TICKERS = ['tBTC', 'tUSDT', 'tPOLYGON', 'tNEAR', 'tSOL'];

// Wallet definitions
export const WALLETS = {
  admin: { name: 'Admin', envKey: 'T_WALLET_SEED' },
  user2: { name: 'User2', envKey: 'T_WALLET_SEED2' },
  user3: { name: 'User3', envKey: 'MNEMONIC0' },
  user4: { name: 'User4', envKey: 'MNEMONIC1' },
  user5: { name: 'User5', envKey: 'MNEMONIC2' },
  user6: { name: 'User6', envKey: 'MNEMONIC3' },
  user7: { name: 'User7', envKey: 'MNEMONIC4' },
} as const;

export type WalletName = keyof typeof WALLETS;

// ─── Types ───────────────────────────────────
export interface WalletCtx {
  lucid: LucidEvolution;
  address: string;
  paymentKeyHash: string;
  name: string;
}

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
  durationMs: number;
}

// ─── Wallet Initialization ───────────────────

export async function initWallet(walletName: WalletName): Promise<WalletCtx> {
  const def = WALLETS[walletName];
  const seed = process.env[def.envKey];
  if (!seed) throw new Error(`Missing env var: ${def.envKey} for wallet ${def.name}`);

  const lucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const paymentKeyHash = getAddressDetails(address).paymentCredential!.hash;

  return { lucid, address, paymentKeyHash, name: def.name };
}

export async function initAllWallets(): Promise<Record<WalletName, WalletCtx | null>> {
  const result: Record<string, WalletCtx | null> = {};
  for (const [key, def] of Object.entries(WALLETS)) {
    if (process.env[def.envKey]) {
      try {
        result[key] = await initWallet(key as WalletName);
      } catch {
        result[key] = null;
      }
    } else {
      result[key] = null;
    }
  }
  return result as Record<WalletName, WalletCtx | null>;
}

// ─── API Client ──────────────────────────────

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { params?: Record<string, string> },
): Promise<T> {
  const { params, ...init } = options || {};
  let url = `${API_V1}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${body?.message || body?.error || res.statusText}`);
  }
  return res.json();
}

export async function safeApi<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch {
    return null;
  }
}

// ─── Transaction Helpers ─────────────────────

export async function signAndSubmit(
  wallet: WalletCtx,
  unsignedTx: string,
): Promise<string> {
  const signed = await wallet.lucid.fromTx(unsignedTx).sign.withWallet().complete();
  const txHash = await signed.submit();
  return txHash;
}

export async function confirmTx(txHash: string, action: string, extra?: Record<string, unknown>): Promise<void> {
  await apiFetch('/tx/confirm', {
    method: 'POST',
    body: JSON.stringify({ txHash, action, ...extra }),
  }).catch(() => { /* non-critical */ });
}

export async function waitTx(lucid: LucidEvolution, txHash: string, maxWait = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const ok = await lucid.awaitTx(txHash, 5000);
      if (ok) return true;
    } catch { /* not yet */ }
    await sleep(3000);
  }
  return false;
}

export async function signSubmitAndWait(
  wallet: WalletCtx,
  unsignedTx: string,
  action: string,
  extra?: Record<string, unknown>,
  maxWait = 120_000,
): Promise<string> {
  const txHash = await signAndSubmit(wallet, unsignedTx);
  console.log(`  TX submitted: ${txHash.slice(0, 20)}...`);
  await confirmTx(txHash, action, extra);
  const ok = await waitTx(wallet.lucid, txHash, maxWait);
  if (!ok) console.warn(`  ⚠️  TX not confirmed within ${maxWait / 1000}s`);
  return txHash;
}

// ─── Token Policy Helpers ────────────────────

export function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

export function hexToText(hex: string): string {
  try { return Buffer.from(hex, 'hex').toString('utf-8'); } catch { return hex; }
}

export function buildUniquePolicy(paymentKeyHash: string, slot: number): { script: Script; policyId: string } {
  const slotHex = slot.toString(16).padStart(8, '0');
  const cbor = `8201828200581c${paymentKeyHash}82041a${slotHex}`;
  const script: Script = { type: 'Native', script: cbor };
  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

/**
 * Get full asset unit for a test token (e.g., "tBTC") given admin's payment key hash
 */
export function getTestTokenUnit(paymentKeyHash: string, ticker: string): string {
  const idx = TEST_TICKERS.indexOf(ticker);
  if (idx === -1) throw new Error(`Unknown test token: ${ticker}`);
  const { policyId } = buildUniquePolicy(paymentKeyHash, idx);
  return policyId + textToHex(ticker);
}

/**
 * Get all test token units for a given key hash
 */
export function getAllTestTokenUnits(paymentKeyHash: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < TEST_TICKERS.length; i++) {
    const ticker = TEST_TICKERS[i];
    const { policyId } = buildUniquePolicy(paymentKeyHash, i);
    result[ticker] = policyId + textToHex(ticker);
  }
  return result;
}

// ─── Utility ─────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return val;
}

export function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      args[key] = rest.join('=') || 'true';
    }
  });
  return args;
}

// ─── Logging & Test Tracking ─────────────────

const testResults: TestResult[] = [];

export function logSection(title: string): void {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

export function logStep(step: string): void {
  console.log(`\n  ▸ ${step}`);
}

export function logSuccess(msg: string): void {
  console.log(`    ✅ ${msg}`);
}

export function logFail(msg: string): void {
  console.log(`    ❌ ${msg}`);
}

export function logWarn(msg: string): void {
  console.log(`    ⚠️  ${msg}`);
}

export function logInfo(msg: string): void {
  console.log(`    ℹ️  ${msg}`);
}

export function record(name: string, status: 'PASS' | 'FAIL' | 'SKIP', detail: string, durationMs = 0): void {
  testResults.push({ name, status, detail, durationMs });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`  ${icon} ${name}: ${detail}`);
}

export function getResults(): TestResult[] {
  return [...testResults];
}

export function printSummary(): void {
  const passed = testResults.filter((r) => r.status === 'PASS').length;
  const failed = testResults.filter((r) => r.status === 'FAIL').length;
  const skipped = testResults.filter((r) => r.status === 'SKIP').length;

  console.log('\n' + '█'.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('█'.repeat(60));
  console.log(`  Total: ${testResults.length}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    for (const r of testResults.filter((r) => r.status === 'FAIL')) {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    }
  }

  console.log('█'.repeat(60));
}

// ─── Assertions ──────────────────────────────

export function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

export function assertDefined<T>(value: T | null | undefined, msg: string): T {
  if (value === null || value === undefined) throw new Error(`Expected non-null: ${msg}`);
  return value;
}

// ─── Wallet Balance Helpers ──────────────────

export async function getWalletBalance(wallet: WalletCtx): Promise<{ ada: bigint; tokens: Record<string, bigint> }> {
  const utxos = await wallet.lucid.utxosAt(wallet.address);
  let ada = 0n;
  const tokens: Record<string, bigint> = {};
  for (const u of utxos) {
    ada += u.assets['lovelace'] || 0n;
    for (const [unit, qty] of Object.entries(u.assets)) {
      if (unit === 'lovelace') continue;
      tokens[unit] = (tokens[unit] || 0n) + (qty as bigint);
    }
  }
  return { ada, tokens };
}

export function formatAda(lovelace: bigint): string {
  return (Number(lovelace) / 1_000_000).toFixed(6);
}
