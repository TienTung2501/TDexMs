/**
 * sweep-contracts.ts
 *
 * Giải phóng toàn bộ UTxO bị kẹt trong các hợp đồng thông minh SolverNet.
 *
 * Chiến lược:
 *  - Escrow UTxOs  → Reclaim (nếu đã hết deadline) → hoặc Cancel (ký bằng ví của owner)
 *  - Pool UTxOs    → ClosePool (admin ký + đốt Pool NFT)
 *  - Order UTxOs   → CancelOrder (ký bằng ví của owner)
 *
 * Chạy:
 *   cd backend
 *   pnpm exec tsx scripts/sweep-contracts.ts
 *
 * Biến môi trường cần thiết (đọc từ .env của backend):
 *   BLOCKFROST_URL, BLOCKFROST_PROJECT_ID, CARDANO_NETWORK
 *   SOLVER_SEED_PHRASE (admin wallet)
 *   T_WALLET_SEED, T_WALLET_SEED2, MNEMONIC0..4 (optional, cho Cancel)
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  Lucid,
  Blockfrost,
  Data,
  Constr,
  toUnit,
  fromUnit,
  getAddressDetails,
  credentialToAddress,
  validatorToAddress,
  validatorToScriptHash,
  mintingPolicyToId,
  applyDoubleCborEncoding,
  applyParamsToScript,
  type LucidEvolution,
  type UTxO,
  type Script,
  type Assets,
  type Credential,
  type Network,
} from '@lucid-evolution/lucid';

// ─── Config from env ───────────────────────────────────────────────
const BLOCKFROST_URL = process.env.BLOCKFROST_URL ?? 'https://cardano-preprod.blockfrost.io/api/v0';
const BLOCKFROST_PROJECT_ID = process.env.BLOCKFROST_PROJECT_ID ?? '';
const CARDANO_NETWORK = (process.env.CARDANO_NETWORK ?? 'preprod') as 'preprod' | 'mainnet';
const NETWORK: Network = CARDANO_NETWORK === 'mainnet' ? 'Mainnet' : 'Preprod';

const ADMIN_SEED = process.env.SOLVER_SEED_PHRASE ?? process.env.T_WALLET_SEED ?? '';

// All wallets to try for Cancel (index 0 = admin)
const ALL_SEEDS = [
  process.env.SOLVER_SEED_PHRASE,
  process.env.T_WALLET_SEED,
  process.env.T_WALLET_SEED2,
  process.env.MNEMONIC0,
  process.env.MNEMONIC1,
  process.env.MNEMONIC2,
  process.env.MNEMONIC3,
  process.env.MNEMONIC4,
].filter(Boolean) as string[];

// Deduplicate seeds
const UNIQUE_SEEDS = [...new Set(ALL_SEEDS)];

const MIN_ADA = 2_000_000n; // 2 ADA min UTxO

// ─── Sleep helper ──────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Blueprint helpers ─────────────────────────────────────────────

interface BlueprintValidator {
  title: string;
  compiledCode: string;
  hash: string;
}

interface PlutusBlueprint {
  validators: BlueprintValidator[];
}

function loadBlueprint(): PlutusBlueprint {
  const candidates = [
    resolve(process.cwd(), '..', 'smartcontract', 'plutus.json'),
    resolve(process.cwd(), 'smartcontract', 'plutus.json'),
    resolve(process.cwd(), 'plutus.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      // continue
    }
  }
  throw new Error('Cannot load plutus.json. Run from backend/ directory.');
}

function findValidator(bp: PlutusBlueprint, titlePrefix: string): BlueprintValidator {
  const v = bp.validators.find((x) => x.title === titlePrefix || x.title.startsWith(titlePrefix));
  if (!v) throw new Error(`Validator "${titlePrefix}" not found in blueprint`);
  return v;
}

// ─── Script resolution (same order as TxBuilder) ──────────────────

function resolveScripts(adminVkh: string) {
  const bp = loadBlueprint();

  const escrowBp = findValidator(bp, 'escrow_validator.escrow_validator');
  const escrowScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(escrowBp.compiledCode) };
  const escrowAddr = validatorToAddress(NETWORK, escrowScript);
  const escrowHash = validatorToScriptHash(escrowScript);

  const poolBp = findValidator(bp, 'pool_validator.pool_validator');
  const poolApplied = applyParamsToScript(poolBp.compiledCode, [adminVkh]);
  const poolScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(poolApplied) };
  const poolAddr = validatorToAddress(NETWORK, poolScript);
  const poolHash = validatorToScriptHash(poolScript);

  const intentBp = findValidator(bp, 'intent_token_policy.intent_token_policy');
  const intentPolicyScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(intentBp.compiledCode) };
  const intentPolicyId = mintingPolicyToId(intentPolicyScript);

  const factoryBp = findValidator(bp, 'factory_validator.factory_validator');
  const factoryApplied = applyParamsToScript(factoryBp.compiledCode, [poolHash]);
  const factoryScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(factoryApplied) };
  const factoryAddr = validatorToAddress(NETWORK, factoryScript);
  const factoryHash = validatorToScriptHash(factoryScript);

  const nftBp = findValidator(bp, 'pool_nft_policy.pool_nft_policy');
  const nftApplied = applyParamsToScript(nftBp.compiledCode, [factoryHash, adminVkh]);
  const poolNftScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(nftApplied) };
  const poolNftPolicyId = mintingPolicyToId(poolNftScript);

  const orderBp = findValidator(bp, 'order_validator.order_validator');
  const orderApplied = applyParamsToScript(orderBp.compiledCode, [intentPolicyId]);
  const orderScript: Script = { type: 'PlutusV3', script: applyDoubleCborEncoding(orderApplied) };
  const orderAddr = validatorToAddress(NETWORK, orderScript);

  // Step 8: settings_validator(settings_nft: AssetClass) — optional, parameterized
  const settingsNftPolicy = process.env.SETTINGS_NFT_POLICY_ID ?? '';
  const settingsNftName  = process.env.SETTINGS_NFT_ASSET_NAME  ?? '';
  const settingsBp = findValidator(bp, 'settings_validator.settings_validator');
  let settingsScript: Script;
  if (settingsNftPolicy) {
    // AssetClass = Constr(0, [policy_id, asset_name])
    const nftParam = Data.to(new Constr(0, [settingsNftPolicy, settingsNftName]));
    const settingsApplied = applyParamsToScript(settingsBp.compiledCode, [nftParam]);
    settingsScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(settingsApplied) };
  } else {
    // Development mode: no NFT parameter applied
    settingsScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(settingsBp.compiledCode) };
  }
  const settingsAddr = validatorToAddress(NETWORK, settingsScript);

  return {
    escrowScript, escrowAddr, escrowHash,
    intentPolicyScript, intentPolicyId,
    poolScript, poolAddr, poolHash,
    factoryScript, factoryAddr, factoryHash,
    poolNftScript, poolNftPolicyId,
    orderScript, orderAddr,
    settingsScript, settingsAddr,
  };
}

// ─── Redeemer constants ────────────────────────────────────────────

const EscrowRedeemer = {
  Cancel: () => Data.to(new Constr(0, [])),
  Reclaim: () => Data.to(new Constr(2, [])),
};

const PoolRedeemer = {
  ClosePool: () => Data.to(new Constr(4, [])),
};

const PoolNFTRedeemer = {
  Burn: () => Data.to(new Constr(1, [])),
};

const IntentRedeemer = {
  Burn: () => Data.to(new Constr(1, [])),
};

const OrderRedeemer = {
  Cancel: () => Data.to(new Constr(0, [])),
};

// ─── Address helper ────────────────────────────────────────────────

function plutusAddrToBech32(plutusAddr: Constr<Data>): string {
  const paymentConstr = plutusAddr.fields[0] as Constr<Data>;
  const paymentCred: Credential = {
    type: paymentConstr.index === 0 ? 'Key' : 'Script',
    hash: paymentConstr.fields[0] as string,
  };
  const stakePart = plutusAddr.fields[1] as Constr<Data>;
  let stakeCred: Credential | undefined;
  if (stakePart.index === 0) {
    const inline = stakePart.fields[0] as Constr<Data>;
    const sc = inline.fields[0] as Constr<Data>;
    stakeCred = { type: sc.index === 0 ? 'Key' : 'Script', hash: sc.fields[0] as string };
  }
  return credentialToAddress(NETWORK, paymentCred, stakeCred);
}

// ─── Chain time helper ─────────────────────────────────────────────

async function getChainTimeMs(): Promise<number> {
  try {
    const resp = await fetch(`${BLOCKFROST_URL}/blocks/latest`, {
      headers: { project_id: BLOCKFROST_PROJECT_ID },
    });
    if (resp.ok) {
      const block = await resp.json() as { time: number };
      return block.time * 1000;
    }
  } catch { /* fallback */ }
  return Date.now();
}

// ─── Wallet VKH cache ──────────────────────────────────────────────

interface WalletInfo {
  seed: string;
  address: string;
  vkh: string;
}

async function loadWallets(lucid: LucidEvolution): Promise<WalletInfo[]> {
  const wallets: WalletInfo[] = [];
  for (const seed of UNIQUE_SEEDS) {
    try {
      lucid.selectWallet.fromSeed(seed);
      const address = await lucid.wallet().address();
      const details = getAddressDetails(address);
      const vkh = details.paymentCredential?.hash ?? '';
      wallets.push({ seed, address, vkh });
      log(`  Wallet: ${address.slice(0, 20)}... VKH: ${vkh.slice(0, 16)}...`);
    } catch (e) {
      log(`  WARN: Failed to load wallet from seed: ${e}`);
    }
  }
  return wallets;
}

// ─── Logging ───────────────────────────────────────────────────────

function log(...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

function hr() {
  console.log('─'.repeat(70));
}

// ═══════════════════════════════════════════
// Escrow sweep
// ═══════════════════════════════════════════

async function sweepEscrowUtxos(
  lucid: LucidEvolution,
  wallets: WalletInfo[],
  scripts: ReturnType<typeof resolveScripts>,
  adminWallet: WalletInfo,
) {
  hr();
  log('🔍 Scanning escrow address:', scripts.escrowAddr);
  const utxos = await lucid.utxosAt(scripts.escrowAddr);
  log(`   Found ${utxos.length} UTxO(s) at escrow address`);

  if (utxos.length === 0) {
    log('   ✅ Escrow address is empty — nothing to sweep');
    return;
  }

  const chainTimeMs = await getChainTimeMs();
  log(`   Chain time: ${new Date(chainTimeMs).toISOString()}`);

  let success = 0;
  let skipped = 0;

  for (const utxo of utxos) {
    log('\n   Processing escrow UTxO:', utxo.txHash, '#', utxo.outputIndex);

    if (!utxo.datum) {
      log('   ⚠️  No datum — cannot process, skipping');
      skipped++;
      continue;
    }

    let parsed: Constr<Data>;
    try {
      parsed = Data.from(utxo.datum) as Constr<Data>;
    } catch (e) {
      log('   ⚠️  Cannot parse datum:', e);
      skipped++;
      continue;
    }

    // Parse EscrowDatum fields
    const escrowToken = parsed.fields[0] as Constr<Data>;
    const ownerConstr = parsed.fields[1] as Constr<Data>;
    const inputAsset = parsed.fields[2] as Constr<Data>;
    const deadline = parsed.fields[6] as bigint;
    const remainingInput = parsed.fields[9] as bigint;

    const intentPolicyId = (escrowToken.fields[0] as string);
    const intentAssetName = (escrowToken.fields[1] as string);
    const intentTokenUnit = toUnit(intentPolicyId, intentAssetName);
    const intentId = intentAssetName; // anti-double-satisfaction datum

    const inputPolicyId = inputAsset.fields[0] as string;
    const inputAssetName = inputAsset.fields[1] as string;
    const inputUnit = inputPolicyId === '' ? 'lovelace' : toUnit(inputPolicyId, inputAssetName);

    // Build owner payment
    const ownerAddress = plutusAddrToBech32(ownerConstr);
    const ownerPayment: Assets = {};
    if (inputUnit === 'lovelace') {
      ownerPayment.lovelace = remainingInput < MIN_ADA ? MIN_ADA : remainingInput;
    } else {
      ownerPayment.lovelace = MIN_ADA;
      ownerPayment[inputUnit] = remainingInput;
    }

    const ownerVkh = (() => {
      try {
        return getAddressDetails(ownerAddress).paymentCredential?.hash ?? '';
      } catch { return ''; }
    })();

    const deadlineDate = new Date(Number(deadline));
    const isExpired = chainTimeMs > Number(deadline);
    log(`   Owner: ${ownerAddress.slice(0, 20)}... | Deadline: ${deadlineDate.toISOString()} | Expired: ${isExpired}`);
    log(`   Remaining input: ${remainingInput.toLocaleString()} ${inputUnit === 'lovelace' ? 'lovelace' : inputUnit.slice(0, 20) + '...'}`);

    // ── Strategy 1: Reclaim (if expired) ──────────────────────────
    if (isExpired) {
      log('   ↳ Attempting Reclaim (expired)...');
      try {
        lucid.selectWallet.fromSeed(adminWallet.seed);
        const adminUtxos = await lucid.wallet().getUtxos();

        const tx = lucid.newTx()
          .collectFrom([utxo], EscrowRedeemer.Reclaim())
          .attach.SpendingValidator(scripts.escrowScript)
          .mintAssets({ [intentTokenUnit]: -1n }, IntentRedeemer.Burn())
          .attach.MintingPolicy(scripts.intentPolicyScript)
          .pay.ToAddressWithData(
            ownerAddress,
            { kind: 'inline', value: Data.to(intentId) },
            ownerPayment,
          )
          .validFrom(Number(deadline) + 1); // must be entirely after deadline

        const completed = await tx.complete({ changeAddress: adminWallet.address });
        const signed = await completed.sign.withWallet().complete();
        const txHash = await signed.submit();

        log(`   ✅ Reclaim TX submitted: ${txHash}`);
        log(`   ⏳ Waiting for confirmation...`);
        await lucid.awaitTx(txHash, 120_000);
        log(`   ✅ Confirmed!`);
        success++;
        // await sleep(3000); // wait between TXs
        continue;
      } catch (e) {
        log(`   ⚠️  Reclaim failed: ${e instanceof Error ? e.message : e}`);
        log(`   ↳ Falling back to Cancel...`);
      }
    }

    // ── Strategy 2: Cancel (owner signature required) ─────────────
    const matchingWallet = wallets.find((w) => w.vkh === ownerVkh);
    if (!matchingWallet) {
      log(`   ❌ No matching wallet for owner VKH ${ownerVkh.slice(0, 16)}... — cannot Cancel`);
      skipped++;
      continue;
    }

    log(`   ↳ Attempting Cancel with matching wallet...`);
    try {
      lucid.selectWallet.fromSeed(matchingWallet.seed);
      const ownerUtxos = await lucid.wallet().getUtxos();
      if (ownerUtxos.length === 0) {
        log(`   ⚠️  Owner wallet has no UTxOs to pay fees — skipping`);
        skipped++;
        continue;
      }

      const tx = lucid.newTx()
        .collectFrom([utxo], EscrowRedeemer.Cancel())
        .attach.SpendingValidator(scripts.escrowScript)
        .mintAssets({ [intentTokenUnit]: -1n }, IntentRedeemer.Burn())
        .attach.MintingPolicy(scripts.intentPolicyScript)
        .pay.ToAddressWithData(
          matchingWallet.address,
          { kind: 'inline', value: Data.to(intentId) },
          ownerPayment,
        )
        .addSigner(matchingWallet.address);

      const completed = await tx.complete({ changeAddress: matchingWallet.address });
      const signed = await completed.sign.withWallet().complete();
      const txHash = await signed.submit();

      log(`   ✅ Cancel TX submitted: ${txHash}`);
      log(`   ⏳ Waiting for confirmation...`);
      await lucid.awaitTx(txHash, 120_000);
      log(`   ✅ Confirmed!`);
      success++;
    //   await sleep(3000);
    } catch (e) {
      log(`   ❌ Cancel failed: ${e instanceof Error ? e.message : e}`);
      skipped++;
    }
  }

  hr();
  log(`Escrow sweep complete: ${success} swept, ${skipped} skipped out of ${utxos.length}`);
}

// ═══════════════════════════════════════════
// Pool sweep
// ═══════════════════════════════════════════

async function sweepPoolUtxos(
  lucid: LucidEvolution,
  scripts: ReturnType<typeof resolveScripts>,
  adminWallet: WalletInfo,
) {
  hr();
  log('🔍 Scanning pool address:', scripts.poolAddr);
  const utxos = await lucid.utxosAt(scripts.poolAddr);
  log(`   Found ${utxos.length} UTxO(s) at pool address`);

  if (utxos.length === 0) {
    log('   ✅ Pool address is empty — nothing to sweep');
    return;
  }

  let success = 0;
  let skipped = 0;

  for (const utxo of utxos) {
    log('\n   Processing pool UTxO:', utxo.txHash, '#', utxo.outputIndex);

    if (!utxo.datum) {
      log('   ⚠️  No datum — skipping');
      skipped++;
      continue;
    }

    let parsed: Constr<Data>;
    try {
      parsed = Data.from(utxo.datum) as Constr<Data>;
    } catch (e) {
      log('   ⚠️  Cannot parse datum:', e);
      skipped++;
      continue;
    }

    // PoolDatum = Constr(0, [pool_nft, asset_a, asset_b, total_lp, fee_num, fees_a, fees_b, last_root_k])
    const poolNft = parsed.fields[0] as Constr<Data>;
    const poolNftPolicyId = poolNft.fields[0] as string;
    const poolNftAssetName = poolNft.fields[1] as string;
    const poolNftUnit = toUnit(poolNftPolicyId, poolNftAssetName);

    log(`   Pool NFT: ${poolNftPolicyId.slice(0, 16)}...${poolNftAssetName}`);
    log(`   Assets: ${JSON.stringify(Object.fromEntries(
      Object.entries(utxo.assets).map(([k, v]) => [k.slice(0, 20) + '...', v.toString()])
    ))}`);

    try {
      lucid.selectWallet.fromSeed(adminWallet.seed);

      const tx = lucid.newTx()
        .collectFrom([utxo], PoolRedeemer.ClosePool())
        .attach.SpendingValidator(scripts.poolScript)
        .mintAssets({ [poolNftUnit]: -1n }, PoolNFTRedeemer.Burn())
        .attach.MintingPolicy(scripts.poolNftScript)
        .addSigner(adminWallet.address);

      const completed = await tx.complete({ changeAddress: adminWallet.address });
      const signed = await completed.sign.withWallet().complete();
      const txHash = await signed.submit();

      log(`   ✅ ClosePool TX submitted: ${txHash}`);
      log(`   ⏳ Waiting for confirmation...`);
      await lucid.awaitTx(txHash, 120_000);
      log(`   ✅ Confirmed!`);
      success++;
    //   await sleep(3000);
    } catch (e) {
      log(`   ❌ ClosePool failed: ${e instanceof Error ? e.message : e}`);
      skipped++;
    }
  }

  hr();
  log(`Pool sweep complete: ${success} swept, ${skipped} skipped out of ${utxos.length}`);
}

// ═══════════════════════════════════════════
// Order sweep
// ═══════════════════════════════════════════

async function sweepOrderUtxos(
  lucid: LucidEvolution,
  wallets: WalletInfo[],
  scripts: ReturnType<typeof resolveScripts>,
  adminWallet: WalletInfo,
) {
  hr();
  log('🔍 Scanning order address:', scripts.orderAddr);
  const utxos = await lucid.utxosAt(scripts.orderAddr);
  log(`   Found ${utxos.length} UTxO(s) at order address`);

  if (utxos.length === 0) {
    log('   ✅ Order address is empty — nothing to sweep');
    return;
  }

  let success = 0;
  let skipped = 0;

  for (const utxo of utxos) {
    log('\n   Processing order UTxO:', utxo.txHash, '#', utxo.outputIndex);

    if (!utxo.datum) {
      log('   ⚠️  No datum — skipping');
      skipped++;
      continue;
    }

    let parsed: Constr<Data>;
    try {
      parsed = Data.from(utxo.datum) as Constr<Data>;
    } catch (e) {
      log('   ⚠️  Cannot parse datum:', e);
      skipped++;
      continue;
    }

    // OrderDatum = Constr(0, [order_type, owner, asset_in, asset_out, params, order_token])
    const ownerConstr = parsed.fields[1] as Constr<Data>;
    const assetIn = parsed.fields[2] as Constr<Data>;
    const paramsConstr = parsed.fields[4] as Constr<Data>;
    const orderToken = parsed.fields[5] as Constr<Data>;

    const orderPolicyId = orderToken.fields[0] as string;
    const orderAssetName = orderToken.fields[1] as string;
    const orderTokenUnit = toUnit(orderPolicyId, orderAssetName);

    const inputPolicyId = assetIn.fields[0] as string;
    const inputAssetName = assetIn.fields[1] as string;

    // Params: [priceNum, priceDen, amountPerInterval, minInterval, lastFillSlot, remainingBudget, deadline]
    const remainingBudget = paramsConstr.fields[5] as bigint;
    const deadline = paramsConstr.fields[6] as bigint;

    let ownerAddress: string;
    try {
      ownerAddress = plutusAddrToBech32(ownerConstr);
    } catch {
      log('   ⚠️  Cannot decode owner address — skipping');
      skipped++;
      continue;
    }

    const ownerVkh = (() => {
      try { return getAddressDetails(ownerAddress).paymentCredential?.hash ?? ''; }
      catch { return ''; }
    })();

    const inputUnit = inputPolicyId === '' ? 'lovelace' : toUnit(inputPolicyId, inputAssetName);
    const ownerPayment: Assets = {};
    if (inputUnit === 'lovelace') {
      ownerPayment.lovelace = remainingBudget < MIN_ADA ? MIN_ADA : remainingBudget;
    } else {
      ownerPayment.lovelace = MIN_ADA;
      ownerPayment[inputUnit] = remainingBudget;
    }

    const matchingWallet = wallets.find((w) => w.vkh === ownerVkh);
    if (!matchingWallet) {
      log(`   ❌ No matching wallet for order owner VKH ${ownerVkh.slice(0, 16)}... — skipping`);
      skipped++;
      continue;
    }

    log(`   ↳ CancelOrder with matching wallet...`);
    try {
      lucid.selectWallet.fromSeed(matchingWallet.seed);
      const ownerUtxos = await lucid.wallet().getUtxos();
      if (ownerUtxos.length === 0) {
        log(`   ⚠️  Owner wallet is empty — skipping`);
        skipped++;
        continue;
      }

      const tx = lucid.newTx()
        .collectFrom([utxo], OrderRedeemer.Cancel())
        .attach.SpendingValidator(scripts.orderScript)
        .mintAssets({ [orderTokenUnit]: -1n }, IntentRedeemer.Burn())
        .attach.MintingPolicy(scripts.intentPolicyScript)
        .pay.ToAddressWithData(
          matchingWallet.address,
          { kind: 'inline', value: Data.to(orderAssetName) },
          ownerPayment,
        )
        .addSigner(matchingWallet.address);

      const completed = await tx.complete({ changeAddress: matchingWallet.address });
      const signed = await completed.sign.withWallet().complete();
      const txHash = await signed.submit();

      log(`   ✅ CancelOrder TX submitted: ${txHash}`);
      await lucid.awaitTx(txHash, 120_000);
      log(`   ✅ Confirmed!`);
      success++;
    //   await sleep(3000);
    } catch (e) {
      log(`   ❌ CancelOrder failed: ${e instanceof Error ? e.message : e}`);
      skipped++;
    }
  }

  hr();
  log(`Order sweep complete: ${success} swept, ${skipped} skipped out of ${utxos.length}`);
}

// ═══════════════════════════════════════════
// Settings scan (cannot sweep — no close redeemer)
// ═══════════════════════════════════════════

async function sweepSettingsUtxos(
  lucid: LucidEvolution,
  scripts: ReturnType<typeof resolveScripts>,
) {
  hr();
  log('🔍 Scanning settings address:', scripts.settingsAddr);
  const nftEnv = process.env.SETTINGS_NFT_POLICY_ID ?? '';
  if (!nftEnv) {
    log('   ℹ️  SETTINGS_NFT_POLICY_ID not set — using un-parameterized address (dev mode)');
  }

  const utxos = await lucid.utxosAt(scripts.settingsAddr);
  log(`   Found ${utxos.length} UTxO(s) at settings address`);

  if (utxos.length === 0) {
    log('   ✅ Settings address is empty — no UTxOs found');
    return;
  }

  log('');
  log('   ⚠️  NOTE: settings_validator has NO close/destroy redeemer.');
  log('   The settings NFT must always continue — ADA here CANNOT be reclaimed.');
  log('   To "clear" settings: re-deploy the protocol with a fresh settings NFT.');
  log('');

  for (const utxo of utxos) {
    log('   Settings UTxO:', utxo.txHash, '#', utxo.outputIndex);
    const lovelace = utxo.assets.lovelace ?? 0n;
    log(`   ADA locked: ${(Number(lovelace) / 1_000_000).toFixed(6)} ₳`);

    // List all tokens at this UTxO
    const tokens = Object.entries(utxo.assets).filter(([k]) => k !== 'lovelace');
    if (tokens.length > 0) {
      log('   Tokens:');
      for (const [unit, qty] of tokens) {
        log(`     ${unit.slice(0, 40)}... × ${qty}`);
      }
    }

    if (!utxo.datum) {
      log('   ⚠️  No inline datum');
      continue;
    }

    try {
      // SettingsDatum = Constr(0, [admin, protocol_fee_bps, min_pool_liquidity,
      //                          min_intent_size, solver_bond, fee_collector, version])
      const d = Data.from(utxo.datum) as Constr<Data>;
      const admin            = d.fields[0] as string;
      const protocolFeeBps   = d.fields[1] as bigint;
      const minPoolLiquidity = d.fields[2] as bigint;
      const minIntentSize    = d.fields[3] as bigint;
      const solverBond       = d.fields[4] as bigint;
      const feeCollector     = d.fields[5] as Constr<Data>;
      const version          = d.fields[6] as bigint;

      let feeCollectorAddr = 'unknown';
      try { feeCollectorAddr = plutusAddrToBech32(feeCollector); } catch { /* ignore */ }

      log('   Settings datum:');
      log(`     admin (script hash):  ${admin}`);
      log(`     protocol_fee_bps:     ${protocolFeeBps} (${(Number(protocolFeeBps) / 100).toFixed(2)}%)`);
      log(`     min_pool_liquidity:   ${minPoolLiquidity.toLocaleString()} lovelace`);
      log(`     min_intent_size:      ${minIntentSize.toLocaleString()} lovelace`);
      log(`     solver_bond:          ${solverBond.toLocaleString()} lovelace`);
      log(`     fee_collector:        ${feeCollectorAddr}`);
      log(`     version:              ${version}`);
    } catch (e) {
      log('   ⚠️  Cannot parse datum:', e instanceof Error ? e.message : e);
    }
  }
}

// ═══════════════════════════════════════════
// Main
// ═══════════════════════════════════════════

async function main() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  SolverNet Contract Sweep Script');
  console.log(`  Network: ${CARDANO_NETWORK} | Blockfrost: ${BLOCKFROST_URL}`);
  console.log('═'.repeat(70));

  if (!BLOCKFROST_PROJECT_ID) {
    throw new Error('BLOCKFROST_PROJECT_ID is not set in .env');
  }
  if (!ADMIN_SEED) {
    throw new Error('SOLVER_SEED_PHRASE (or T_WALLET_SEED) is not set in .env');
  }

  // ── Init Lucid ────────────────────────────────────────────────────
  log('Connecting to Blockfrost...');
  const lucid = await Lucid(
    new Blockfrost(BLOCKFROST_URL, BLOCKFROST_PROJECT_ID),
    NETWORK,
  );
  log('✅ Connected');

  // ── Load wallets ──────────────────────────────────────────────────
  log(`\nLoading ${UNIQUE_SEEDS.length} unique wallet(s)...`);
  const wallets = await loadWallets(lucid);

  // Admin is the first/solver wallet
  const adminWallet = wallets[0];
  if (!adminWallet) throw new Error('Could not load admin wallet');
  log(`Admin wallet: ${adminWallet.address}`);

  // ── Resolve scripts ───────────────────────────────────────────────
  log('\nResolving parameterized scripts...');
  const scripts = resolveScripts(adminWallet.vkh);
  log(`  Escrow:   ${scripts.escrowAddr}`);
  log(`  Pool:     ${scripts.poolAddr}`);
  log(`  Factory:  ${scripts.factoryAddr}`);
  log(`  Order:    ${scripts.orderAddr}`);
  log(`  Settings: ${scripts.settingsAddr}`);
  log(`  Intent policy:   ${scripts.intentPolicyId}`);
  log(`  Pool NFT policy: ${scripts.poolNftPolicyId}`);

  // ── Sweep ─────────────────────────────────────────────────────────
  await sweepEscrowUtxos(lucid, wallets, scripts, adminWallet);
  await sweepPoolUtxos(lucid, scripts, adminWallet);
  await sweepOrderUtxos(lucid, wallets, scripts, adminWallet);
  await sweepSettingsUtxos(lucid, scripts);

  hr();
  log('🎉 Sweep complete! All contracts have been processed.');
  log('   You can now reset the database and re-deploy.');
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
