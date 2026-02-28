/// <reference types="node" />
/**
 * collect-fees.ts — Collect Protocol Fees from Pool(s)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Collects accumulated protocol fees from one or more pools.     ║
 * ║  Uses the Pool validator's CollectFees redeemer.                 ║
 * ║                                                                  ║
 * ║  Pool Redeemer: CollectFees                                      ║
 * ║                                                                  ║
 * ║  Validation checks:                                              ║
 * ║    - Admin must sign (pool_validator checks admin_vkh)           ║
 * ║    - Pool NFT must continue to the output                       ║
 * ║    - protocol_fees_a and protocol_fees_b are reset to 0          ║
 * ║    - Collected fees sent to fee_collector address                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * USAGE:
 *   cd backend && pnpm exec tsx scripts/collect-fees.ts
 *
 * ENV VARS:
 *   SOLVER_SEED_PHRASE or T_WALLET_SEED — admin wallet seed phrase
 *   POOL_IDS — comma-separated pool IDs to collect from (or "all")
 *
 * REQUIRES: Backend running (pnpm dev)
 */

import 'dotenv/config';
import {
  Lucid,
  Blockfrost,
  type Network,
} from '@lucid-evolution/lucid';

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API = `${BACKEND_URL}/v1`;
const BF_URL = process.env.BLOCKFROST_URL ?? 'https://cardano-preprod.blockfrost.io/api/v0';
const BF_PROJECT = process.env.BLOCKFROST_PROJECT_ID ?? '';
const NETWORK: Network = (process.env.CARDANO_NETWORK ?? 'preprod') === 'mainnet' ? 'Mainnet' : 'Preprod';

const ADMIN_SEED = process.env.SOLVER_SEED_PHRASE ?? process.env.T_WALLET_SEED ?? '';
const POOL_IDS_ENV = process.env.POOL_IDS ?? 'all';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const log = (msg: string, data?: unknown) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[collect-fees]\x1b[0m ${msg}`);
  if (data !== undefined) console.log('         ', JSON.stringify(data, null, 2));
};

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  const body = (await r.json()) as T;
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await r.json()) as T;
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     SolverNet DEX — Collect Protocol Fees                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (!ADMIN_SEED) {
    console.error('❌ SOLVER_SEED_PHRASE or T_WALLET_SEED env var required');
    process.exit(1);
  }

  // ─── Setup wallet ─────────────────────────────────────────────────
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_PROJECT), NETWORK);
  lucid.selectWallet.fromSeed(ADMIN_SEED);
  const adminAddress = await lucid.wallet().address();
  log(`Admin address: ${adminAddress}`);

  // ─── Determine pool IDs ───────────────────────────────────────────
  let poolIds: string[];
  if (POOL_IDS_ENV === 'all') {
    log('Fetching all pools...');
    const pools = await apiGet<{ pools: Array<{ poolId: string; reserveA: string; reserveB: string }> }>('/pools');
    poolIds = pools.pools.map((p) => p.poolId);
    log(`Found ${poolIds.length} pool(s)`);
  } else {
    poolIds = POOL_IDS_ENV.split(',').map((s) => s.trim());
    log(`Collecting from ${poolIds.length} specified pool(s)`);
  }

  if (poolIds.length === 0) {
    log('⚠️  No pools found. Nothing to collect.');
    return;
  }

  // ─── Build TX ─────────────────────────────────────────────────────
  log('Building collect-fees TX...');
  const result = await apiPost<{ unsignedTx: string; estimatedFee: string }>('/admin/revenue/build-collect', {
    admin_address: adminAddress,
    pool_ids: poolIds,
  });

  log(`TX built. Estimated fee: ${result.estimatedFee} lovelace`);

  // ─── Sign & Submit ────────────────────────────────────────────────
  log('Signing...');
  const signed = await lucid.fromTx(result.unsignedTx).sign.withWallet().complete();
  const submitResult = await apiPost<{ txHash: string; status: string; error?: string }>(
    '/tx/submit',
    { signedTx: signed.toCBOR() },
  );

  if (submitResult.status !== 'accepted') {
    throw new Error(`TX rejected: ${submitResult.error ?? 'unknown'}`);
  }

  log(`Submitted ✅  ${submitResult.txHash}`);
  log('Awaiting on-chain confirmation (up to 120s)...');

  const confirmed = await lucid.awaitTx(submitResult.txHash, 120_000);
  if (!confirmed) throw new Error('TX not confirmed within 120s');

  log(`✅ Protocol fees collected from ${poolIds.length} pool(s)!`);
  log('Waiting 30s for Blockfrost propagation...');
  await sleep(30_000);
  log('Done.');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
