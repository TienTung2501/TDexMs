/// <reference types="node" />
/**
 * create-pool.ts — Create a Liquidity Pool (Step 3 of Protocol Init)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Creates a new AMM pool by invoking the Factory's CreatePool    ║
 * ║  redeemer. Mints a Pool NFT (via pool_nft_policy) and LP        ║
 * ║  tokens (via lp_token_policy), creates pool UTxO at pool        ║
 * ║  validator with PoolDatum.                                      ║
 * ║                                                                  ║
 * ║  Factory Redeemer: CreatePool {                                  ║
 * ║    asset_a, asset_b, initial_a, initial_b, fee_numerator        ║
 * ║  }                                                               ║
 * ║                                                                  ║
 * ║  Minting Policies invoked:                                       ║
 * ║    pool_nft_policy.MintPoolNFT { consumed_utxo }                ║
 * ║    lp_token_policy.MintOrBurnLP { pool_nft, amount }            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * PoolDatum fields:
 *   pool_nft:         AssetClass
 *   asset_a:          AssetClass (canonical order: lower policy_id first)
 *   asset_b:          AssetClass (canonical order: higher policy_id first)
 *   total_lp_tokens:  Int (= sqrt(initial_a * initial_b))
 *   fee_numerator:    Int (basis points, e.g. 30 = 0.30%)
 *   protocol_fees_a:  Int (0 initially)
 *   protocol_fees_b:  Int (0 initially)
 *   last_root_k:      Int (= sqrt(reserve_a * reserve_b))
 *
 * Pool Redeemers (available after creation):
 *   Swap { direction: SwapDirection, min_output: Int }
 *   Deposit { min_lp_tokens: Int }
 *   Withdraw { lp_tokens_burned: Int }
 *   CollectFees
 *   ClosePool
 *
 * USAGE:
 *   cd backend && pnpm exec tsx scripts/create-pool.ts
 *
 * ENV VARS:
 *   SOLVER_SEED_PHRASE or T_WALLET_SEED — admin wallet seed phrase
 *   POOL_ASSET_A_POLICY — policy ID of asset A (empty string = ADA)
 *   POOL_ASSET_A_NAME   — hex-encoded asset name of A
 *   POOL_ASSET_B_POLICY — policy ID of asset B
 *   POOL_ASSET_B_NAME   — hex-encoded asset name of B
 *   POOL_INITIAL_A      — initial amount of asset A (smallest unit)
 *   POOL_INITIAL_B      — initial amount of asset B (smallest unit)
 *   POOL_FEE_BPS        — fee in basis points (default: 30)
 *
 * PREREQUISITES: Factory must be deployed first (deploy-factory.ts)
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

// Pool config
const ASSET_A_POLICY = process.env.POOL_ASSET_A_POLICY ?? '';
const ASSET_A_NAME = process.env.POOL_ASSET_A_NAME ?? '';
const ASSET_B_POLICY = process.env.POOL_ASSET_B_POLICY ?? '';
const ASSET_B_NAME = process.env.POOL_ASSET_B_NAME ?? '';
const INITIAL_A = process.env.POOL_INITIAL_A ?? '100000000'; // 100M smallest units
const INITIAL_B = process.env.POOL_INITIAL_B ?? '100000000';
const FEE_BPS = Number(process.env.POOL_FEE_BPS ?? '30');

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const log = (msg: string, data?: unknown) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[create-pool]\x1b[0m ${msg}`);
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

function formatAssetId(policy: string, name: string): string {
  if (!policy) return 'lovelace';
  return `${policy}.${name}`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     SolverNet DEX — Create Liquidity Pool (Step 3)              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (!ADMIN_SEED) {
    console.error('❌ SOLVER_SEED_PHRASE or T_WALLET_SEED env var required');
    process.exit(1);
  }
  if (!BF_PROJECT) {
    console.error('❌ BLOCKFROST_PROJECT_ID env var required');
    process.exit(1);
  }
  if (!ASSET_B_POLICY) {
    console.error('❌ POOL_ASSET_B_POLICY env var required (at least one non-ADA asset)');
    console.error('   Set POOL_ASSET_A_POLICY="" for ADA, POOL_ASSET_B_POLICY for the token');
    process.exit(1);
  }

  const assetA = formatAssetId(ASSET_A_POLICY, ASSET_A_NAME);
  const assetB = formatAssetId(ASSET_B_POLICY, ASSET_B_NAME);

  // ─── Setup wallet ─────────────────────────────────────────────────
  const lucid = await Lucid(new Blockfrost(BF_URL, BF_PROJECT), NETWORK);
  lucid.selectWallet.fromSeed(ADMIN_SEED);
  const adminAddress = await lucid.wallet().address();
  log(`Admin address: ${adminAddress}`);
  log(`Network: ${NETWORK}`);
  log(`Asset A: ${assetA}`);
  log(`Asset B: ${assetB}`);
  log(`Initial A: ${INITIAL_A}`);
  log(`Initial B: ${INITIAL_B}`);
  log(`Fee: ${FEE_BPS} bps (${(FEE_BPS / 100).toFixed(2)}%)`);

  // ─── Build TX via backend ─────────────────────────────────────────
  log('Building create-pool TX...');
  log('This invokes Factory.CreatePool, mints Pool NFT + LP tokens');

  const result = await apiPost<{
    unsignedTx: string;
    poolId?: string;
    pool_nft_policy_id?: string;
    pool_nft_asset_name?: string;
  }>('/pools/create', {
    admin_address: adminAddress,
    asset_a: assetA,
    asset_b: assetB,
    initial_a: INITIAL_A,
    initial_b: INITIAL_B,
    fee_numerator: FEE_BPS,
  });

  log('TX built successfully');
  if (result.poolId) log(`Pool ID: ${result.poolId}`);
  if (result.pool_nft_policy_id)
    log(`Pool NFT: ${result.pool_nft_policy_id}.${result.pool_nft_asset_name}`);

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

  log('✅ Pool created on-chain!');
  log('');
  log('Pool assets can now be traded via intents or direct swaps.');
  log('Waiting 30s for Blockfrost propagation...');
  await sleep(30_000);

  log('');
  log('════════════════════════════════════════════════');
  log('  Pool creation complete!');
  log('  Use read-on-chain-state.ts to verify.');
  log('════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
