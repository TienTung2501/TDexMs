/// <reference types="node" />
/**
 * deploy-factory.ts — Deploy the Factory Validator (Step 2 of Protocol Init)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Mints the Factory NFT via intent_token_policy (one-shot) and   ║
 * ║  creates the factory UTxO at factory_validator address with     ║
 * ║  a FactoryDatum.                                                ║
 * ║                                                                  ║
 * ║  Redeemers available after deployment:                           ║
 * ║    factory_validator.spend.CreatePool { asset_a, asset_b,       ║
 * ║        initial_a, initial_b, fee_numerator }                    ║
 * ║    factory_validator.spend.UpdateSettings                       ║
 * ║                                                                  ║
 * ║  NOTE: The Factory NFT is minted using intent_token_policy      ║
 * ║  (parameterless, one-shot). This SAME policy mints user intent  ║
 * ║  tokens. That's why blockchain explorers show multiple mint TXs ║
 * ║  under one policy ID.                                           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * FactoryDatum fields:
 *   factory_nft:    AssetClass (policy_id + asset_name of the minted NFT)
 *   pool_count:     Int (starts at 0)
 *   admin:          VerificationKeyHash (from admin wallet)
 *   settings_utxo:  OutputReference (tx_hash#output_index of settings UTxO)
 *
 * USAGE:
 *   cd backend && pnpm exec tsx scripts/deploy-factory.ts
 *
 * ENV VARS:
 *   SOLVER_SEED_PHRASE or T_WALLET_SEED — admin wallet seed phrase
 *
 * PREREQUISITES: Settings must be deployed first (deploy-settings.ts)
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
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[deploy-factory]\x1b[0m ${msg}`);
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
  console.log('║     SolverNet DEX — Deploy Factory Validator (Step 2)           ║');
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

  // ─── Build TX via backend ─────────────────────────────────────────
  log('Building deploy-factory TX...');
  log('This mints a Factory NFT via intent_token_policy (one-shot) and creates the factory UTxO.');

  const result = await apiPost<{ unsignedTx: string }>('/admin/deploy-factory', {
    admin_address: adminAddress,
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

  log('✅ Factory deployed on-chain!');
  log('');
  log('NOTE: The Factory NFT was minted via intent_token_policy.');
  log('      This is the same policy used for user intent tokens.');
  log('      Blockchain explorers will show all mints under one policy ID.');
  log('');
  log('Waiting 30s for Blockfrost propagation...');
  await sleep(30_000);

  log('');
  log('════════════════════════════════════════════════');
  log('  NEXT STEP: Run create-pool.ts (Step 3)');
  log('════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
