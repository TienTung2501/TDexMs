import { bech32 } from 'bech32';
import { Lucid } from '@lucid-evolution/lucid';

// ─── PHẦN 1: CODE CŨ GIỮ NGUYÊN (TẠO ĐỊA CHỈ TỪ SCRIPT HASH) ────────────

function scriptHashToAddress(scriptHash, network = 'testnet') {
  // Remove any 0x prefix if present
  const hash = scriptHash.replace('0x', '');
  
  // Convert hex string to bytes
  const hashBytes = Buffer.from(hash, 'hex');
  
  // Script address header byte:
  // Testnet: 0x70 (0111 0000) = network_id(0) + script_payment_credential(1)
  // Mainnet: 0x71 (0111 0001) = network_id(1) + script_payment_credential(1)
  const headerByte = network === 'mainnet' ? 0x71 : 0x70;
  
  // Combine header and hash
  const addressBytes = Buffer.concat([Buffer.from([headerByte]), hashBytes]);
  
  // Convert to 5-bit words for bech32
  const words = bech32.toWords(addressBytes);
  
  // Encode with bech32
  const prefix = network === 'mainnet' ? 'addr' : 'addr_test';
  const address = bech32.encode(prefix, words, 1000); // limit=1000 for safety
  
  return address;
}

// Script hashes from plutus.json
const ESCROW_SCRIPT_HASH = '795b08f17216887d0fdd83dec60790a79fba0998ac9d76eb2c7ed80a';
const POOL_SCRIPT_HASH = '734799794c30fc4fe3431c3ccf811d15b6fed58d397d2cf1cde33a43';

console.log('=== ESCROW VALIDATOR ===');
console.log('Hash:', ESCROW_SCRIPT_HASH);
console.log('Testnet Address:', scriptHashToAddress(ESCROW_SCRIPT_HASH, 'testnet'));
console.log('Mainnet Address:', scriptHashToAddress(ESCROW_SCRIPT_HASH, 'mainnet'));
console.log('');
console.log('=== POOL VALIDATOR ===');
console.log('Hash:', POOL_SCRIPT_HASH);
console.log('Testnet Address:', scriptHashToAddress(POOL_SCRIPT_HASH, 'testnet'));
console.log('Mainnet Address:', scriptHashToAddress(POOL_SCRIPT_HASH, 'mainnet'));
console.log('');
console.log('=== For .env file ===');
console.log(`ESCROW_SCRIPT_ADDRESS=${scriptHashToAddress(ESCROW_SCRIPT_HASH, 'testnet')}`);
console.log(`POOL_SCRIPT_ADDRESS=${scriptHashToAddress(POOL_SCRIPT_HASH, 'testnet')}`);
console.log('');


// ─── PHẦN 2: THÊM MỚI (TẠO ĐỊA CHỈ TỪ SEED PHRASE 24 TỪ) ────────────────

async function generateAddressesFromSeeds() {
  // Điền 2 cụm 24 từ của bạn vào đây (cách nhau bằng dấu cách)
  const T_WALLET_SEED_1 = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 word21 word22 word23 word24";
  const T_WALLET_SEED_2 = "another_word1 another_word2 another_word3 ... another_word24";

  // Khởi tạo Lucid ở chế độ Offline (không cần kết nối Provider/RPC)
  // Lưu ý: testnet của Cardano hiện tại thường dùng 'Preprod' hoặc 'Preview'
  const lucidTestnet = await Lucid(undefined, 'Preprod'); 
  const lucidMainnet = await Lucid(undefined, 'Mainnet');

  console.log('=== WALLET 1 (TỪ 24 TỪ) ===');
  lucidTestnet.selectWallet.fromSeed(T_WALLET_SEED_1);
  console.log('Testnet Address 1:', await lucidTestnet.wallet().address());
  
  console.log('=== WALLET 2 (TỪ 24 TỪ) ===');
  lucidTestnet.selectWallet.fromSeed(T_WALLET_SEED_2);
  console.log('Testnet Address 2:', await lucidTestnet.wallet().address());
  

}

// Thực thi hàm bất đồng bộ
await generateAddressesFromSeeds();