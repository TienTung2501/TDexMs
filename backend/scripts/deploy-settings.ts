/// <reference types="node" />
/**
 * deploy-settings.ts — Deploy the Settings Validator (Step 1 of Protocol Init)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Creates the initial on-chain SettingsDatum at the settings      ║
 * ║  validator address with protocol parameters.                     ║
 * ║                                                                  ║
 * ║  Redeemer: settings_validator.spend.UpdateProtocolSettings       ║
 * ║  Parameter: settings_nft (AssetClass) — derived at deploy-time  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * SettingsDatum fields:
 *   admin:             ScriptHash (admin credential)
 *   protocol_fee_bps:  Int (0–10000)
 *   min_pool_liquidity: Int (lovelace)
 *   min_intent_size:   Int (lovelace)
 *   solver_bond:       Int (lovelace)
 *   fee_collector:     Address
 *   version:           Int (starts at 0)
 *
 * USAGE:
 *   cd backend && pnpm exec tsx scripts/deploy-settings.ts
 *
 * ENV VARS:
 *   SOLVER_SEED_PHRASE or T_WALLET_SEED — admin wallet seed phrase
 *   PROTOCOL_FEE_BPS    — optional, default 30   (0.30%)
 *   MIN_POOL_LIQUIDITY  — optional, default 1000000 (1 ADA)
 *   FEE_COLLECTOR       — optional, defaults to admin address
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

// Protocol parameters (overridable via env)
const PROTOCOL_FEE_BPS = Number(process.env.PROTOCOL_FEE_BPS ?? '30');
const MIN_POOL_LIQUIDITY = Number(process.env.MIN_POOL_LIQUIDITY ?? '1000000');
const FEE_COLLECTOR = process.env.FEE_COLLECTOR ?? '';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const log = (msg: string, data?: unknown) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[deploy-settings]\x1b[0m ${msg}`);
  if (data !== undefined) console.log('         ', JSON.stringify(data, null, 2));
};

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
  console.log('║     SolverNet DEX — Deploy Settings Validator (Step 1)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (!ADMIN_SEED) {
    console.error('❌ SOLVER_SEED_PHRASE or T_WALLET_SEED env var required');
    process.exit(1);
  }
  if (!BF_PROJECT) {
    console.error('❌ BLOCKFROST_PROJECT_ID env var required');
    process.exit(1);
  }

  // ─── Setup wallet ─────────────────────────────────────────────────
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_PROJECT), NETWORK);
  lucid.selectWallet.fromSeed(ADMIN_SEED);
  const adminAddress = await lucid.wallet().address();
  log(`Admin address: ${adminAddress}`);
  log(`Network: ${NETWORK}`);
  log(`Protocol fee: ${PROTOCOL_FEE_BPS} bps (${(PROTOCOL_FEE_BPS / 100).toFixed(2)}%)`);
  log(`Min pool liquidity: ${MIN_POOL_LIQUIDITY} lovelace (${(MIN_POOL_LIQUIDITY / 1_000_000).toFixed(2)} ADA)`);
  log(`Fee collector: ${FEE_COLLECTOR || '(defaults to admin)'}`);

  // ─── Build TX via backend ─────────────────────────────────────────
  log('Building deploy-settings TX...');
  const result = await apiPost<{ unsignedTx: string }>('/admin/deploy-settings', {
    admin_address: adminAddress,
    protocol_fee_bps: PROTOCOL_FEE_BPS,
    min_pool_liquidity: MIN_POOL_LIQUIDITY,
    ...(FEE_COLLECTOR ? { fee_collector_address: FEE_COLLECTOR } : {}),
  });

  log('TX built successfully, signing...');

  // ─── Sign & Submit ────────────────────────────────────────────────
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

  log('✅ Settings deployed on-chain!');
  log('Waiting 30s for Blockfrost propagation...');
  await sleep(30_000);

  log('');
  log('════════════════════════════════════════════════');
  log('  NEXT STEP: Run deploy-factory.ts (Step 2)');
  log('════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
