/// <reference types="node" />
/**
 * update-settings.ts — Update Protocol Settings On-Chain
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Updates the SettingsDatum at the settings validator by          ║
 * ║  consuming the current settings UTxO (checking NFT continuity)  ║
 * ║  and producing a new one with updated parameters.               ║
 * ║                                                                  ║
 * ║  Redeemer: settings_validator.spend.UpdateProtocolSettings       ║
 * ║                                                                  ║
 * ║  Validation checks performed by the on-chain validator:          ║
 * ║    1. Settings NFT must continue to the output                  ║
 * ║    2. Admin must authorize via withdrawal (staking credential)  ║
 * ║    3. Version must increment by exactly 1                       ║
 * ║    4. All numeric fields must be non-negative                   ║
 * ║    5. fee_collector address must have payment credential        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * USAGE:
 *   cd backend && pnpm exec tsx scripts/update-settings.ts
 *
 * ENV VARS:
 *   SOLVER_SEED_PHRASE or T_WALLET_SEED — admin wallet seed phrase
 *   NEW_PROTOCOL_FEE_BPS   — new protocol fee (bps), omit to keep current
 *   NEW_MIN_POOL_LIQUIDITY — new min pool liquidity (lovelace), omit to keep
 *
 * PREREQUISITES: Settings must already be deployed
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const log = (msg: string, data?: unknown) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[update-settings]\x1b[0m ${msg}`);
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
  console.log('║     SolverNet DEX — Update Protocol Settings                    ║');
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

  // ─── Get current settings ─────────────────────────────────────────
  log('Fetching current settings...');
  const current = await apiGet<{
    global_settings: {
      max_protocol_fee_bps: number;
      min_pool_liquidity: number;
      current_version: number;
    };
  }>('/admin/settings/current');

  const currentVersion = current.global_settings.current_version;
  const nextVersion = currentVersion + 1;
  const newFeeBps = process.env.NEW_PROTOCOL_FEE_BPS
    ? Number(process.env.NEW_PROTOCOL_FEE_BPS)
    : current.global_settings.max_protocol_fee_bps;
  const newMinLiq = process.env.NEW_MIN_POOL_LIQUIDITY
    ? Number(process.env.NEW_MIN_POOL_LIQUIDITY)
    : current.global_settings.min_pool_liquidity;

  log(`Current: v${currentVersion}, fee=${current.global_settings.max_protocol_fee_bps} bps, min_liq=${current.global_settings.min_pool_liquidity}`);
  log(`New:     v${nextVersion}, fee=${newFeeBps} bps, min_liq=${newMinLiq}`);

  // ─── Build TX ─────────────────────────────────────────────────────
  log('Building update-settings TX...');
  const result = await apiPost<{ unsignedTx: string }>('/admin/settings/build-update-global', {
    admin_address: adminAddress,
    new_settings: {
      max_protocol_fee_bps: newFeeBps,
      min_pool_liquidity: newMinLiq,
      next_version: nextVersion,
    },
  });

  log('TX built, signing...');

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

  log(`✅ Settings updated to v${nextVersion}!`);
  log('Waiting 30s for Blockfrost propagation...');
  await sleep(30_000);

  log('Done. Use read-on-chain-state.ts to verify.');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
