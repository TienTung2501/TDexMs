#!/usr/bin/env python3

def bech32_polymod(values):
    """Internal function for bech32 checksum computation."""
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for value in values:
        b = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ value
        for i in range(5):
            chk ^= GEN[i] if ((b >> i) & 1) else 0
    return chk

def bech32_hrp_expand(hrp):
    """Expand the HRP into values for checksum computation."""
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def bech32_create_checksum(hrp, data):
    """Compute the checksum values given HRP and data."""
    values = bech32_hrp_expand(hrp) + data
    polymod = bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]

def bech32_encode(hrp, data):
    """Compute a Bech32 string given HRP and data values."""
    combined = data + bech32_create_checksum(hrp, data)
    return hrp + '1' + ''.join([BECH32_CHARSET[d] for d in combined])

def convertbits(data, frombits, tobits, pad=True):
    """General power-of-2 base conversion."""
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    for value in data:
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return ret

BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

def script_hash_to_address(script_hash, network='testnet'):
    """Convert Cardano script hash to Bech32 address."""
    # Remove any 0x prefix
    hash_hex = script_hash.replace('0x', '')
    
    # Convert hex to bytes
    hash_bytes = bytes.fromhex(hash_hex)
    
    # Script address header byte
    # Testnet: 0x70 (0111 0000) = network_id(0) + script_payment_credential(1)
    # Mainnet: 0x71 (0111 0001) = network_id(1) + script_payment_credential(1)
    header_byte = b'\x71' if network == 'mainnet' else b'\x70'
    
    # Combine header and hash
    address_bytes = header_byte + hash_bytes
    
    # Convert to list of integers
    address_data = list(address_bytes)
    
    # Convert to 5-bit groups for bech32
    five_bit_data = convertbits(address_data, 8, 5)
    
    # Encode with bech32
    prefix = 'addr' if network == 'mainnet' else 'addr_test'
    address = bech32_encode(prefix, five_bit_data)
    
    return address

# Script hashes from plutus.json
ESCROW_SCRIPT_HASH = '795b08f17216887d0fdd83dec60790a79fba0998ac9d76eb2c7ed80a'
POOL_SCRIPT_HASH = '734799794c30fc4fe3431c3ccf811d15b6fed58d397d2cf1cde33a43'

print('=== ESCROW VALIDATOR ===')
print(f'Hash: {ESCROW_SCRIPT_HASH}')
print(f'Testnet Address: {script_hash_to_address(ESCROW_SCRIPT_HASH, "testnet")}')
print(f'Mainnet Address: {script_hash_to_address(ESCROW_SCRIPT_HASH, "mainnet")}')
print()
print('=== POOL VALIDATOR ===')
print(f'Hash: {POOL_SCRIPT_HASH}')
print(f'Testnet Address: {script_hash_to_address(POOL_SCRIPT_HASH, "testnet")}')
print(f'Mainnet Address: {script_hash_to_address(POOL_SCRIPT_HASH, "mainnet")}')
print()
print('=== For .env file ===')
print(f'ESCROW_SCRIPT_ADDRESS={script_hash_to_address(ESCROW_SCRIPT_HASH, "testnet")}')
print(f'POOL_SCRIPT_ADDRESS={script_hash_to_address(POOL_SCRIPT_HASH, "testnet")}')
