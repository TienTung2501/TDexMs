/// <reference types="node" />
/**
 * read-on-chain-state.ts — Diagnostic Script: Read & Display Protocol On-Chain State
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Reads live UTxO data from all protocol validators via the      ║
 * ║  backend API and displays decoded datums, NFT relationships,    ║
 * ║  and derived addresses.                                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * USAGE:
 *   cd backend && pnpm exec tsx scripts/read-on-chain-state.ts
 *
 * REQUIRES: Backend running (pnpm dev)
 */

import 'dotenv/config';

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API = `${BACKEND_URL}/v1`;

const log = (section: string, msg: string, data?: unknown) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${ts}]\x1b[0m \x1b[33m[${section}]\x1b[0m ${msg}`);
  if (data !== undefined)
    console.log(
      '         ',
      JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
    );
};

const hr = (title: string) => {
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${title}`);
  console.log('═'.repeat(72));
};

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  const body = (await r.json()) as T;
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

// ─── Types ──────────────────────────────────────────────────────────
interface ProtocolInfo {
  network: string;
  admin: { admin_address: string; solver_address: string };
  contracts: {
    escrow_script_address: string;
    pool_script_address: string;
    settings_nft_policy_id: string;
    settings_nft_asset_name: string;
  };
  derived_addresses?: {
    escrowAddress: string;
    poolAddress: string;
    factoryAddress: string;
    orderAddress: string;
    settingsAddress?: string;
    escrowHash: string;
    poolHash: string;
    factoryHash: string;
    intentPolicyId: string;
    lpPolicyId: string;
    poolNftPolicyId: string;
    settingsParamStatus: 'parameterized' | 'unparameterized' | 'error';
  };
  services: Record<string, unknown>;
  database: { pool_count: number; intent_count: number; order_count: number };
  blockfrost: { project_id_masked: string };
}

interface OnChainAssetClass {
  policy_id: string;
  asset_name: string;
}

interface FactoryOnChainState {
  utxo_ref: string;
  lovelace: string;
  datum: {
    factory_nft: OnChainAssetClass;
    pool_count: number;
    admin: string;
    settings_utxo: string;
  } | null;
}

interface SettingsOnChainState {
  utxo_ref: string;
  lovelace: string;
  datum: {
    admin: string;
    protocol_fee_bps: number;
    min_pool_liquidity: number;
    min_intent_size: number;
    solver_bond: number;
    fee_collector: string;
    version: number;
  } | null;
}

interface PoolOnChainState {
  utxo_ref: string;
  lovelace: string;
  datum: {
    pool_nft: OnChainAssetClass;
    asset_a: OnChainAssetClass;
    asset_b: OnChainAssetClass;
    total_lp_tokens: number;
    fee_numerator: number;
    protocol_fees_a: number;
    protocol_fees_b: number;
    last_root_k: number;
  } | null;
}

interface OnChainProtocolState {
  factory: FactoryOnChainState | null;
  settings: SettingsOnChainState | null;
  pools: PoolOnChainState[];
  nft_relationships: {
    factory_nft: OnChainAssetClass | null;
    settings_nft: OnChainAssetClass | null;
    pool_nfts: OnChainAssetClass[];
  };
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        SolverNet DEX — On-Chain State Diagnostic                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ─── 1. Protocol Info ──────────────────────────────────────────────
  hr('1. Protocol Info');
  const info = await apiGet<ProtocolInfo>('/admin/protocol/info');
  log('info', `Network: ${info.network}`);
  log('info', `Admin: ${info.admin.admin_address}`);
  log('info', `Solver: ${info.admin.solver_address}`);
  log('info', `DB: ${info.database.pool_count} pools, ${info.database.intent_count} intents, ${info.database.order_count} orders`);

  // ─── 2. Derived Addresses ─────────────────────────────────────────
  hr('2. Derived Addresses');
  const derived = info.derived_addresses;
  if (derived) {
    log('derived', `Escrow:   ${derived.escrowAddress}`);
    log('derived', `Pool:     ${derived.poolAddress}`);
    log('derived', `Factory:  ${derived.factoryAddress}`);
    log('derived', `Order:    ${derived.orderAddress}`);
    log('derived', `Settings: ${derived.settingsAddress ?? '(not derived)'} [${derived.settingsParamStatus}]`);
    console.log();
    log('derived', `Escrow Hash:     ${derived.escrowHash}`);
    log('derived', `Pool Hash:       ${derived.poolHash}`);
    log('derived', `Factory Hash:    ${derived.factoryHash}`);
    log('derived', `Intent Policy:   ${derived.intentPolicyId}`);
    log('derived', `LP Policy:       ${derived.lpPolicyId}`);
    log('derived', `Pool NFT Policy: ${derived.poolNftPolicyId}`);
  } else {
    log('derived', '⚠️  Blueprint not loaded — no derived addresses available');
  }

  // ─── 3. On-Chain State ────────────────────────────────────────────
  hr('3. On-Chain State (live UTxOs)');
  let state: OnChainProtocolState;
  try {
    state = await apiGet<OnChainProtocolState>('/admin/protocol/on-chain-state');
  } catch (e) {
    log('on-chain', `❌ Failed to read on-chain state: ${e instanceof Error ? e.message : e}`);
    return;
  }

  // ─── 3a. Factory ──────────────────────────────────────────────────
  console.log();
  log('factory', '── Factory Validator ──');
  if (state.factory) {
    log('factory', `UTxO: ${state.factory.utxo_ref}`);
    log('factory', `Value: ${(Number(state.factory.lovelace) / 1_000_000).toFixed(2)} ₳`);
    if (state.factory.datum) {
      const d = state.factory.datum;
      log('factory', `Pool Count: ${d.pool_count}`);
      log('factory', `Admin VKH: ${d.admin}`);
      log('factory', `Factory NFT: ${d.factory_nft.policy_id}.${d.factory_nft.asset_name}`);
      log('factory', `Settings UTxO Ref: ${d.settings_utxo}`);
    } else {
      log('factory', '⚠️  No datum decoded');
    }
  } else {
    log('factory', '⚠️  No factory UTxO found on-chain');
  }

  // ─── 3b. Settings ─────────────────────────────────────────────────
  console.log();
  log('settings', '── Settings Validator ──');
  if (state.settings) {
    log('settings', `UTxO: ${state.settings.utxo_ref}`);
    log('settings', `Value: ${(Number(state.settings.lovelace) / 1_000_000).toFixed(2)} ₳`);
    if (state.settings.datum) {
      const d = state.settings.datum;
      log('settings', `Admin Hash: ${d.admin}`);
      log('settings', `Protocol Fee: ${d.protocol_fee_bps} bps (${(d.protocol_fee_bps / 100).toFixed(2)}%)`);
      log('settings', `Min Pool Liquidity: ${d.min_pool_liquidity} lovelace (${(d.min_pool_liquidity / 1_000_000).toFixed(1)} ₳)`);
      log('settings', `Min Intent Size: ${d.min_intent_size} lovelace (${(d.min_intent_size / 1_000_000).toFixed(1)} ₳)`);
      log('settings', `Solver Bond: ${d.solver_bond} lovelace (${(d.solver_bond / 1_000_000).toFixed(1)} ₳)`);
      log('settings', `Fee Collector: ${d.fee_collector}`);
      log('settings', `Version: ${d.version}`);
    } else {
      log('settings', '⚠️  No datum decoded');
    }
  } else {
    log('settings', '⚠️  No settings UTxO found on-chain');
  }

  // ─── 3c. Pools ─────────────────────────────────────────────────────
  console.log();
  log('pools', `── Pool Validator (${state.pools.length} UTxOs) ──`);
  for (let i = 0; i < state.pools.length; i++) {
    const pool = state.pools[i];
    console.log();
    log(`pool-${i}`, `UTxO: ${pool.utxo_ref}`);
    log(`pool-${i}`, `Value: ${(Number(pool.lovelace) / 1_000_000).toFixed(2)} ₳`);
    if (pool.datum) {
      const d = pool.datum;
      const assetALabel = d.asset_a.policy_id === '' ? 'ADA (lovelace)' : `${d.asset_a.policy_id.slice(0, 16)}…${d.asset_a.asset_name}`;
      const assetBLabel = d.asset_b.policy_id === '' ? 'ADA (lovelace)' : `${d.asset_b.policy_id.slice(0, 16)}…${d.asset_b.asset_name}`;
      log(`pool-${i}`, `Asset A: ${assetALabel}`);
      log(`pool-${i}`, `Asset B: ${assetBLabel}`);
      log(`pool-${i}`, `Total LP: ${d.total_lp_tokens}`);
      log(`pool-${i}`, `Fee: ${d.fee_numerator} bps`);
      log(`pool-${i}`, `Protocol Fees: A=${d.protocol_fees_a}, B=${d.protocol_fees_b}`);
      log(`pool-${i}`, `Last Root K: ${d.last_root_k}`);
    } else {
      log(`pool-${i}`, '⚠️  No datum decoded');
    }
  }

  // ─── 4. NFT Relationships ─────────────────────────────────────────
  hr('4. NFT Relationships');
  const nft = state.nft_relationships;
  if (nft.factory_nft) {
    log('nft', `Factory NFT:  ${nft.factory_nft.policy_id}.${nft.factory_nft.asset_name}`);
    log('nft', `              ↳ Minted via intent_token_policy (no params, one-shot)`);
    log('nft', `              ↳ Same policy as user intent tokens`);
  } else {
    log('nft', 'Factory NFT: not found');
  }
  if (nft.settings_nft) {
    log('nft', `Settings NFT: ${nft.settings_nft.policy_id}.${nft.settings_nft.asset_name}`);
    log('nft', `              ↳ Guards settings_validator updates`);
  } else {
    log('nft', 'Settings NFT: not detected');
  }
  if (nft.pool_nfts.length > 0) {
    log('nft', `Pool NFTs: ${nft.pool_nfts.length} minted`);
    for (const pnft of nft.pool_nfts) {
      log('nft', `  • ${pnft.policy_id.slice(0, 16)}…${pnft.asset_name}`);
    }
  } else {
    log('nft', 'Pool NFTs: none');
  }

  // ─── Summary ──────────────────────────────────────────────────────
  hr('Summary');
  console.log(`
  Factory:  ${state.factory ? '✅ deployed' : '❌ not deployed'}
  Settings: ${state.settings ? '✅ deployed' : '❌ not deployed'}
  Pools:    ${state.pools.length} active
  NFTs:     factory=${nft.factory_nft ? '✅' : '❌'} settings=${nft.settings_nft ? '✅' : '❌'} pools=${nft.pool_nfts.length}
  `);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
