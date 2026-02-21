import { bech32 } from 'bech32';
import { walletFromSeed } from '@lucid-evolution/lucid';


// ─── PHẦN 1: TẠO ĐỊA CHỈ TỪ SCRIPT HASH ────────────────────────────────────

function scriptHashToAddress(scriptHash, network = 'testnet') {
  const hash = scriptHash.replace('0x', '');
  const hashBytes = Buffer.from(hash, 'hex');
  // Testnet: 0x70, Mainnet: 0x71
  const headerByte = network === 'mainnet' ? 0x71 : 0x70;
  const addressBytes = Buffer.concat([Buffer.from([headerByte]), hashBytes]);
  const words = bech32.toWords(addressBytes);
  const prefix = network === 'mainnet' ? 'addr' : 'addr_test';
  return bech32.encode(prefix, words, 1000);
}

// Script hashes from plutus.json
const ESCROW_SCRIPT_HASH = '795b08f17216887d0fdd83dec60790a79fba0998ac9d76eb2c7ed80a';
const POOL_SCRIPT_HASH = '734799794c30fc4fe3431c3ccf811d15b6fed58d397d2cf1cde33a43';

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║         SolverNet — Address Conversion Utility          ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

console.log('── ESCROW VALIDATOR ──');
console.log('  Hash:    ', ESCROW_SCRIPT_HASH);
console.log('  Testnet: ', scriptHashToAddress(ESCROW_SCRIPT_HASH, 'testnet'));
console.log('  Mainnet: ', scriptHashToAddress(ESCROW_SCRIPT_HASH, 'mainnet'));
console.log('');
console.log('── POOL VALIDATOR ──');
console.log('  Hash:    ', POOL_SCRIPT_HASH);
console.log('  Testnet: ', scriptHashToAddress(POOL_SCRIPT_HASH, 'testnet'));
console.log('  Mainnet: ', scriptHashToAddress(POOL_SCRIPT_HASH, 'mainnet'));
console.log('');

console.log('── For .env ──');
console.log(`  ESCROW_SCRIPT_ADDRESS=${scriptHashToAddress(ESCROW_SCRIPT_HASH, 'testnet')}`);
console.log(`  POOL_SCRIPT_ADDRESS=${scriptHashToAddress(POOL_SCRIPT_HASH, 'testnet')}`);
console.log('');


// ─── PHẦN 2: TẠO ĐỊA CHỈ TỪ SEED PHRASE ────────────────────────────────────

const T_WALLET_SEED_1 = "daring hybrid aerobic pair history dentist park race nothing twist leave autumn notice animal spring safe render matter exact wasp hole cotton drift evil";
const T_WALLET_SEED_2 = "bleak gentle smart accident squeeze truth country cluster report fuel table rural fan sleep melt neglect goddess speed avoid place vibrant area strong degree";

const w1Preprod = walletFromSeed(T_WALLET_SEED_1, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });
const w2Preprod = walletFromSeed(T_WALLET_SEED_2, { network: 'Preprod', addressType: 'Base', accountIndex: 0 });

console.log('── WALLET 1 (T_WALLET_SEED) ──');
console.log('  Preprod Address:  ', w1Preprod.address);
console.log('');
console.log('── WALLET 2 (T_WALLET_SEED2) ──');
console.log('  Preprod Address:  ', w2Preprod.address);
console.log('');

console.log('── For .env (Preprod) ──');
console.log(`  ADMIN_ADDRESS=${w1Preprod.address}`);
console.log('');