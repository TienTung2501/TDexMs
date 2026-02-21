/**
 * CLI: Mint 5 test tokens on Cardano Preprod using NativeScript (requireSignature)
 *
 * Each token uses a simple NativeScript policy keyed to the wallet's payment key hash.
 * This means only the wallet owner can mint/burn these tokens.
 *
 * CIP-25 metadata is attached for token name, description, and IPFS image.
 *
 * Usage:
 *   npx tsx src/mint-test-tokens.ts                # Mint all 5
 *   npx tsx src/mint-test-tokens.ts --token=tBTC    # Mint only tBTC
 *   npx tsx src/mint-test-tokens.ts --burn           # Burn all 5
 */
import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
  type Script,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
} from '@lucid-evolution/lucid';
import { requireEnv, parseArgs, log } from './shared.js';

// ─── Token definitions ──────────────────────

interface TestTokenDef {
  name: string;
  ticker: string;
  decimals: number;
  supply: bigint;
  description: string;
  image: string;
  color: string;
}

const TOKENS: TestTokenDef[] = [
  {
    name: 'Test Bitcoin',
    ticker: 'tBTC',
    decimals: 8,
    supply: 21_000_000_00000000n,        // 21M * 10^8
    description: 'Test Bitcoin token on Cardano Preprod',
    image: 'ipfs://bafkreigqrejn2u3eiclyx4fnfoownopkjcmjm2atsqvl6c4koyboi2647a',
    color: '#F7931A',
  },
  {
    name: 'Test Tether USD',
    ticker: 'tUSDT',
    decimals: 6,
    supply: 1_000_000_000_000000n,       // 1B * 10^6
    description: 'Test USDT stablecoin on Cardano Preprod',
    image: 'ipfs://bafkreia6nhyo7edo5vtraapffk3auczsz4spyl2gs7lmpseitocinbl6pa',
    color: '#26A17B',
  },
  {
    name: 'Test Polygon',
    ticker: 'tPOLYGON',
    decimals: 6,
    supply: 500_000_000_000000n,         // 500M * 10^6
    description: 'Test Polygon (MATIC) token on Cardano Preprod',
    image: 'ipfs://bafkreiafxotb762oywlvydqpo4juvilrycz7uiwu46auw2paeoy3jgzhbi',
    color: '#8247E5',
  },
  {
    name: 'Test NEAR',
    ticker: 'tNEAR',
    decimals: 6,
    supply: 500_000_000_000000n,         // 500M * 10^6
    description: 'Test NEAR Protocol token on Cardano Preprod',
    image: 'ipfs://bafkreibyko4tnhy6g4s3hp6f4pfjdueu7yon3ijckzob4f4phmudwavloi',
    color: '#00C08B',
  },
  {
    name: 'Test Solana',
    ticker: 'tSOL',
    decimals: 9,
    supply: 100_000_000_000000000n,      // 100M * 10^9
    description: 'Test Solana token on Cardano Preprod',
    image: 'ipfs://bafkreiawzklak2whua24ori2glshvlffqofluf4ursxsbbjzgnupxcntqm',
    color: '#9945FF',
  },
];

// ─── Helpers ────────────────────────────────

function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

/**
 * CIP-25 metadata requires strings to be max 64 chars.
 * Split long strings into arrays of 64-char chunks.
 */
function metadataString(s: string): string | string[] {
  if (s.length <= 64) return s;
  const chunks: string[] = [];
  for (let i = 0; i < s.length; i += 64) {
    chunks.push(s.slice(i, i + 64));
  }
  return chunks;
}

async function getWallet(): Promise<{ lucid: LucidEvolution; address: string; paymentKeyHash: string }> {
  const seed = requireEnv('T_WALLET_SEED');
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const details = getAddressDetails(address);
  const paymentKeyHash = details.paymentCredential!.hash;
  return { lucid, address, paymentKeyHash };
}

/**
 * Build a NativeScript policy that requires the wallet signature.
 * Policy ID is deterministic from the payment key hash.
 *
 * NativeScript::ScriptPubkey CBOR = [0, key_hash_bytes]
 * In CBOR hex: 82 00 581c <28-byte key hash hex>
 */
function buildMintingPolicy(paymentKeyHash: string): { script: Script; policyId: string } {
  const nativeScriptCbor = `8200581c${paymentKeyHash}`;

  const script: Script = {
    type: 'Native',
    script: nativeScriptCbor,
  };

  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

// ─── Main ───────────────────────────────────

async function main() {
  const args = parseArgs();
  const isBurn = args.burn === 'true';
  const filterToken = args.token; // e.g., --token=tBTC

  console.log(`\n🪙  SolverNet Test Token ${isBurn ? 'Burner' : 'Minter'}`);
  console.log('═'.repeat(50));

  const { lucid, address, paymentKeyHash } = await getWallet();
  console.log(`Wallet:  ${address}`);
  console.log(`Key Hash: ${paymentKeyHash}`);

  const { script: mintPolicy, policyId } = buildMintingPolicy(paymentKeyHash);
  console.log(`Policy ID: ${policyId}\n`);

  // Filter tokens if requested
  const tokensToMint = filterToken
    ? TOKENS.filter((t) => t.ticker.toLowerCase() === filterToken.toLowerCase())
    : TOKENS;

  if (tokensToMint.length === 0) {
    console.error(`Token "${filterToken}" not found. Available: ${TOKENS.map((t) => t.ticker).join(', ')}`);
    process.exit(1);
  }

  // Build mint/burn assets map and CIP-25 metadata
  const mintAssets: Record<string, bigint> = {};
  const cip25Metadata: Record<string, Record<string, unknown>> = {};

  for (const token of tokensToMint) {
    const assetName = textToHex(token.ticker);
    const unit = toUnit(policyId, assetName);
    const qty = isBurn ? -token.supply : token.supply;

    mintAssets[unit] = qty;

    if (!isBurn) {
      cip25Metadata[token.ticker] = {
        name: metadataString(token.name),
        description: metadataString(token.description),
        ticker: token.ticker,
        decimals: token.decimals,
        image: metadataString(token.image),
        mediaType: 'image/png',
      };
    }

    const action = isBurn ? 'BURN' : 'MINT';
    const displayQty = Number(token.supply) / Math.pow(10, token.decimals);
    console.log(`  ${action}: ${displayQty.toLocaleString()} ${token.ticker} (${unit})`);
  }

  console.log('\nBuilding transaction...');

  // Build TX
  let tx = lucid.newTx().mintAssets(mintAssets).attach.MintingPolicy(mintPolicy);

  // Attach CIP-25 metadata (label 721) if minting
  if (!isBurn && Object.keys(cip25Metadata).length > 0) {
    tx = tx.attachMetadata(721, {
      [policyId]: cip25Metadata,
    });
  }

  const completed = await tx.complete({ changeAddress: address });

  console.log('Signing...');
  const signed = await completed.sign.withWallet().complete();

  console.log('Submitting...');
  const txHash = await signed.submit();

  console.log(`\n✅ TX submitted: ${txHash}`);
  console.log(`   View: https://preprod.cardanoscan.io/transaction/${txHash}\n`);

  // Print summary for updating mock-data.ts
  if (!isBurn) {
    console.log('─'.repeat(50));
    console.log('📝 Update frontend/src/lib/mock-data.ts with these policyIds:\n');
    for (const token of tokensToMint) {
      const assetName = textToHex(token.ticker);
      console.log(`  ${token.ticker}: policyId = "${policyId}"  assetName = "${assetName}"`);
      console.log(`           unit = "${policyId}${assetName}"`);
    }
    console.log(`\n  All tokens share the same policyId: ${policyId}`);
  }

  // Wait for confirmation (optional)
  console.log('\nWaiting for confirmation (checking every 5s, max 2 min)...');
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const utxos = await lucid.utxosAt(address);
      const hasMinted = utxos.some((u) =>
        Object.keys(u.assets).some((unit) => unit.startsWith(policyId)),
      );
      if (hasMinted) {
        console.log('✅ Confirmed on-chain!\n');
        // Show final balances for minted tokens
        for (const token of tokensToMint) {
          const assetName = textToHex(token.ticker);
          const unit = toUnit(policyId, assetName);
          const balance = utxos.reduce((sum, u) => sum + (u.assets[unit] || 0n), 0n);
          const displayBal = Number(balance) / Math.pow(10, token.decimals);
          console.log(`  ${token.ticker}: ${displayBal.toLocaleString()}`);
        }
        return;
      }
    } catch {
      // keep polling
    }
    process.stdout.write('.');
  }
  console.log('\n⚠️  Timed out waiting for confirmation. TX may still confirm.');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
