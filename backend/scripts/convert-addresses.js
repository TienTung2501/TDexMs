import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bech32 } from 'bech32';
import {
  walletFromSeed,
  applyParamsToScript,
  validatorToAddress,
  validatorToScriptHash,
  mintingPolicyToId,
  applyDoubleCborEncoding,
} from '@lucid-evolution/lucid';


// ─── PHẦN 1: TẠO ĐỊA CHỈ TỪ PLUTUS.JSON (TỰ ĐỘNG) ─────────────────────────

// Automatically read hashes from plutus.json — no more hardcoding!
const PLUTUS_JSON_PATH = resolve(import.meta.dirname || '.', '../../smartcontract/plutus.json');

let blueprint;
try {
  blueprint = JSON.parse(readFileSync(PLUTUS_JSON_PATH, 'utf-8'));
  console.log(`✅ Loaded plutus.json from: ${PLUTUS_JSON_PATH}`);
} catch (e) {
  console.error(`❌ Could not read ${PLUTUS_JSON_PATH}: ${e.message}`);
  process.exit(1);
}

function findValidator(bp, titlePrefix, suffix = '.spend') {
  const v = bp.validators.find(v => v.title.startsWith(titlePrefix) && v.title.endsWith(suffix));
  if (!v) throw new Error(`Validator not found: ${titlePrefix}*${suffix}`);
  return v;
}

function scriptHashToAddress(scriptHash, network = 'testnet') {
  const hash = scriptHash.replace('0x', '');
  const hashBytes = Buffer.from(hash, 'hex');
  const headerByte = network === 'mainnet' ? 0x71 : 0x70;
  const addressBytes = Buffer.concat([Buffer.from([headerByte]), hashBytes]);
  const words = bech32.toWords(addressBytes);
  const prefix = network === 'mainnet' ? 'addr' : 'addr_test';
  return bech32.encode(prefix, words, 1000);
}

// Admin VKH is needed for parameterized validators (pool, factory, etc.)
const ADMIN_SEED = "daring hybrid aerobic pair history dentist park race nothing twist leave autumn notice animal spring safe render matter exact wasp hole cotton drift evil";
const adminWallet = walletFromSeed(ADMIN_SEED, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
// Extract payment key hash from admin address
import { getAddressDetails } from '@lucid-evolution/lucid';
const adminDetails = getAddressDetails(adminWallet.address);
const adminVkh = adminDetails.paymentCredential?.hash || '';

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║    SolverNet — Address Conversion (auto from plutus.json)   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`  Admin VKH: ${adminVkh}`);
console.log('');

// Step 1: escrow_validator (NO parameters)
const escrowBp = findValidator(blueprint, 'escrow_validator.escrow_validator');
const escrowScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(escrowBp.compiledCode) };
const ESCROW_SCRIPT_HASH = escrowBp.hash;
const escrowAddr = validatorToAddress('Preprod', escrowScript);

// Step 2: pool_validator(admin_vkh)
const poolBp = findValidator(blueprint, 'pool_validator.pool_validator');
const poolApplied = applyParamsToScript(poolBp.compiledCode, [adminVkh]);
const poolScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(poolApplied) };
const poolHash = validatorToScriptHash(poolScript);
const poolAddr = validatorToAddress('Preprod', poolScript);

// Step 3: intent_token_policy (NO parameters)
const intentBp = findValidator(blueprint, 'intent_token_policy.intent_token_policy', '.mint');
const intentScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(intentBp.compiledCode) };
const intentPolicyId = mintingPolicyToId(intentScript);

// Step 4: factory_validator(pool_validator_hash)
const factoryBp = findValidator(blueprint, 'factory_validator.factory_validator');
const factoryApplied = applyParamsToScript(factoryBp.compiledCode, [poolHash]);
const factoryScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(factoryApplied) };
const factoryAddr = validatorToAddress('Preprod', factoryScript);
const factoryHash = validatorToScriptHash(factoryScript);

// Step 5: lp_token_policy(pool_hash, factory_hash)
const lpBp = findValidator(blueprint, 'lp_token_policy.lp_token_policy', '.mint');
const lpApplied = applyParamsToScript(lpBp.compiledCode, [poolHash, factoryHash]);
const lpScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(lpApplied) };
const lpPolicyId = mintingPolicyToId(lpScript);

// Step 6: pool_nft_policy(factory_hash, admin_vkh)
const nftBp = findValidator(blueprint, 'pool_nft_policy.pool_nft_policy', '.mint');
const nftApplied = applyParamsToScript(nftBp.compiledCode, [factoryHash, adminVkh]);
const nftScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(nftApplied) };
const nftPolicyId = mintingPolicyToId(nftScript);

// Step 7: order_validator(intent_policy_id)
const orderBp = findValidator(blueprint, 'order_validator.order_validator');
const orderApplied = applyParamsToScript(orderBp.compiledCode, [intentPolicyId]);
const orderScript = { type: 'PlutusV3', script: applyDoubleCborEncoding(orderApplied) };
const orderAddr = validatorToAddress('Preprod', orderScript);

console.log('── ESCROW VALIDATOR (unparameterized) ──');
console.log('  Blueprint hash:', ESCROW_SCRIPT_HASH);
console.log('  Address:       ', escrowAddr);
console.log('');
console.log('── POOL VALIDATOR (parameterized with admin_vkh) ──');
console.log('  Blueprint hash:', poolBp.hash);
console.log('  Applied hash:  ', poolHash);
console.log('  Address:       ', poolAddr);
console.log('');
console.log('── FACTORY VALIDATOR ──');
console.log('  Address:       ', factoryAddr);
console.log('  Hash:          ', factoryHash);
console.log('');
console.log('── INTENT TOKEN POLICY ──');
console.log('  Policy ID:     ', intentPolicyId);
console.log('');
console.log('── LP TOKEN POLICY ──');
console.log('  Policy ID:     ', lpPolicyId);
console.log('');
console.log('── POOL NFT POLICY ──');
console.log('  Policy ID:     ', nftPolicyId);
console.log('');
console.log('── ORDER VALIDATOR ──');
console.log('  Address:       ', orderAddr);
console.log('');

console.log('── For .env (copy-paste) ──');
console.log(`  ESCROW_SCRIPT_ADDRESS=${escrowAddr}`);
console.log(`  POOL_SCRIPT_ADDRESS=${poolAddr}`);
console.log('');


// ─── PHẦN 2: TẠO ĐỊA CHỈ TỪ SEED PHRASE ────────────────────────────────────

const T_WALLET_SEED_1 = "daring hybrid aerobic pair history dentist park race nothing twist leave autumn notice animal spring safe render matter exact wasp hole cotton drift evil";
const T_WALLET_SEED_2 = "bleak gentle smart accident squeeze truth country cluster report fuel table rural fan sleep melt neglect goddess speed avoid place vibrant area strong degree";

const MNEMONIC0 = "advice august trigger tired catch visa deposit squirrel metal roast quick hotel forget electric acid prize fog casino safe admit author sick morning concert";
const MNEMONIC2 = "absent cruise crack series beef equip leisure feature wash first now veteran more dentist will dose antenna eight aisle lemon climb ramp vivid uphold";
const MNEMONIC3 = "spin slot sugar denial design planet rug sell trial tube lizard exit solution wife orbit autumn truck energy adult shaft goose absurd loyal radio";
const MNEMONIC4 = "cinnamon torch deputy open satoshi sick sword leisure place dynamic feature cream urban brave floor tackle obtain universe ensure anchor level talk assist rescue";
const MNEMONIC1 = "orbit turkey plastic december corn move idle satisfy skate sleep tortoise struggle unhappy alert dust draft park captain grocery shock fix pond scout gain";
const w1Preprod = walletFromSeed(T_WALLET_SEED_1, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const w2Preprod = walletFromSeed(T_WALLET_SEED_2, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const v3Preprod = walletFromSeed(MNEMONIC0, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const v3Preprod2 = walletFromSeed(MNEMONIC2, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const v3Preprod3 = walletFromSeed(MNEMONIC3, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const v3Preprod4 = walletFromSeed(MNEMONIC4, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const v3Preprod1 = walletFromSeed(MNEMONIC1, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });

console.log('── WALLET 1 (T_WALLET_SEED) ──');
console.log('  Preprod Address:  ', w1Preprod.address);
console.log('');
console.log('── WALLET 2 (T_WALLET_SEED2) ──');
console.log('  Preprod Address:  ', w2Preprod.address);
console.log('');

console.log('── For .env (Preprod) ──');
console.log(`  ADMIN_ADDRESS=${w1Preprod.address}`);
console.log('');
console.log('── For .env (Preprod) ──');
console.log(`  MNEMONIC0_ADDRESS=${v3Preprod.address}`);
console.log(`  MNEMONIC1_ADDRESS=${v3Preprod1.address}`);
console.log(`  MNEMONIC2_ADDRESS=${v3Preprod2.address}`);
console.log(`  MNEMONIC3_ADDRESS=${v3Preprod3.address}`);
console.log(`  MNEMONIC4_ADDRESS=${v3Preprod4.address}`);
console.log('');