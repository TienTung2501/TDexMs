import {
  Lucid,
  Blockfrost,
  type LucidEvolution,
  type Script,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
} from '@lucid-evolution/lucid';
import { requireEnv, parseArgs } from './shared.js';

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
    name: 'Test Bitcoin', ticker: 'tBTC', decimals: 8,
    supply: 21_000_000_00000000n,
    description: 'Test Bitcoin token on Cardano Preprod',
    image: 'ipfs://bafkreigqrejn2u3eiclyx4fnfoownopkjcmjm2atsqvl6c4koyboi2647a',
    color: '#F7931A',
  },
  {
    name: 'Test Tether USD', ticker: 'tUSDT', decimals: 6,
    supply: 1_000_000_000_000000n,
    description: 'Test USDT stablecoin on Cardano Preprod',
    image: 'ipfs://bafkreia6nhyo7edo5vtraapffk3auczsz4spyl2gs7lmpseitocinbl6pa',
    color: '#26A17B',
  },
  {
    name: 'Test Polygon', ticker: 'tPOLYGON', decimals: 6,
    supply: 500_000_000_000000n,
    description: 'Test Polygon (MATIC) token on Cardano Preprod',
    image: 'ipfs://bafkreiafxotb762oywlvydqpo4juvilrycz7uiwu46auw2paeoy3jgzhbi',
    color: '#8247E5',
  },
  {
    name: 'Test NEAR', ticker: 'tNEAR', decimals: 6,
    supply: 500_000_000_000000n,
    description: 'Test NEAR Protocol token on Cardano Preprod',
    image: 'ipfs://bafkreibyko4tnhy6g4s3hp6f4pfjdueu7yon3ijckzob4f4phmudwavloi',
    color: '#00C08B',
  },
  {
    name: 'Test Solana', ticker: 'tSOL', decimals: 9,
    supply: 100_000_000_000000000n,
    description: 'Test Solana token on Cardano Preprod',
    image: 'ipfs://bafkreiawzklak2whua24ori2glshvlffqofluf4ursxsbbjzgnupxcntqm',
    color: '#9945FF',
  },
];

// ─── Helpers ────────────────────────────────

function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

function metadataString(s: string): string | string[] {
  if (s.length <= 64) return s;
  const chunks: string[] = [];
  for (let i = 0; i < s.length; i += 64) {
    chunks.push(s.slice(i, i + 64));
  }
  return chunks;
}

/**
 * Hàm tự tạo CBOR cho Native Script: All [Signature, After Slot]
 * Cấu trúc này đảm bảo mỗi Policy ID là duy nhất dựa trên số slot.
 */
function buildUniquePolicy(paymentKeyHash: string, slot: number): { script: Script; policyId: string } {
  // Chuyển slot sang hex (4 bytes)
  const slotHex = slot.toString(16).padStart(8, '0');
  
  // CBOR cho [All [Sig, After Slot]]
  // 82 01: ScriptAll (mảng 2 phần tử)
  // 82 00 58 1c...: ScriptPubkey (Signature)
  // 82 04 1a...: ScriptInvalidBefore (After Slot)
  const cbor = `8201828200581c${paymentKeyHash}82041a${slotHex}`;

  const script: Script = {
    type: 'Native',
    script: cbor,
  };

  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

async function getWallet() {
  const seed = requireEnv('T_WALLET_SEED');
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod';
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

// ─── Main ───────────────────────────────────

async function main() {
  const args = parseArgs();
  const isBurn = args.burn === 'true';
  const filterToken = args.token;

  console.log(`\n🪙  SolverNet Unique Token ${isBurn ? 'Burner' : 'Minter'}`);
  
  const { lucid, address, paymentKeyHash } = await getWallet();
  const tokensToMint = filterToken
    ? TOKENS.filter((t) => t.ticker.toLowerCase() === filterToken.toLowerCase())
    : TOKENS;

  let tx = lucid.newTx();
  const fullMetadata721: Record<string, any> = {};

  for (let i = 0; i < tokensToMint.length; i++) {
    const token = tokensToMint[i];
    
    // TẠO POLICY DUY NHẤT (Dùng i làm slot "giả" để khác hash)
    const { script: mintPolicy, policyId } = buildUniquePolicy(paymentKeyHash, i);
    
    const assetName = textToHex(token.ticker);
    const unit = toUnit(policyId, assetName);
    const qty = isBurn ? -token.supply : token.supply;

    tx = tx.mintAssets({ [unit]: qty }).attach.MintingPolicy(mintPolicy);

    if (!isBurn) {
      fullMetadata721[policyId] = {
        [token.ticker]: {
          name: metadataString(token.name),
          image: metadataString(token.image),
          mediaType: 'image/png',
          ticker: token.ticker,
          decimals: token.decimals,
          description: metadataString(token.description),
        },
      };
    }
    console.log(`> Prepared: ${token.ticker} | Policy: ${policyId}`);
  }

  console.log('\nBuilding transaction...');

  if (!isBurn) {
    // Sửa lỗi TS(2345) bằng cách ép kiểu as any
    tx = tx.attachMetadata(721, fullMetadata721 as any);
  }

  const completed = await tx.complete({ changeAddress: address });
  const signed = await completed.sign.withWallet().complete();
  const txHash = await signed.submit();

  console.log(`\n✅ Thành công! TX: ${txHash}`);
  console.log(`Link: https://preprod.cardanoscan.io/transaction/${txHash}`);
}

main().catch(console.error);