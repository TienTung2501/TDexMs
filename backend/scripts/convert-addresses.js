import { bech32 } from 'bech32';

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
