import {
  Lucid,
  Blockfrost,
  type Script,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
} from '@lucid-evolution/lucid';
import { requireEnv, parseArgs } from './shared.js';

// Định nghĩa lại danh sách tokens để biết index (phải khớp với file mint)
const TOKENS = [
  { ticker: 'tBTC' },
  { ticker: 'tUSDT' },
  { ticker: 'tPOLYGON' },
  { ticker: 'tNEAR' },
  { ticker: 'tSOL' },
];

function textToHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

/**
 * Hàm tạo Unique Policy (Phải copy y hệt từ file mint)
 */
function buildUniquePolicy(paymentKeyHash: string, slot: number): { script: Script; policyId: string } {
  const slotHex = slot.toString(16).padStart(8, '0');
  const cbor = `8201828200581c${paymentKeyHash}82041a${slotHex}`;
  const script: Script = { type: 'Native', script: cbor };
  const policyId = mintingPolicyToId(script);
  return { script, policyId };
}

async function main() {
  const args = parseArgs();
  console.log('\n🔥 SolverNet — Unique Token Burner');
  console.log('═'.repeat(50));

  const seed = requireEnv('T_WALLET_SEED');
  const network = (process.env.CARDANO_NETWORK || 'Preprod') as 'Preprod';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );
  lucid.selectWallet.fromSeed(seed);
  const address = await lucid.wallet().address();
  const paymentKeyHash = getAddressDetails(address).paymentCredential!.hash;

  let targetPolicyId: string = "";
  let assetNameHex: string = "";
  let mintScript: Script | undefined;

  // 1. XỬ LÝ THEO TICKER
  if (args.ticker) {
    const idx = TOKENS.findIndex(t => t.ticker.toLowerCase() === args.ticker.toLowerCase());
    if (idx === -1) {
      console.error(`❌ Ticker ${args.ticker} không có trong danh sách mặc định.`);
      process.exit(1);
    }
    // Tái tạo lại script dựa trên index + 100 (khớp với logic mint)
    const result = buildUniquePolicy(paymentKeyHash, idx + 100);
    mintScript = result.script;
    targetPolicyId = result.policyId;
    assetNameHex = textToHex(args.ticker.toUpperCase());
  } 
  
  // 2. XỬ LÝ THEO UNIT HOẶC POLICY ID (Dò tìm script)
  else if (args.unit || args.policyId) {
    targetPolicyId = args.unit ? args.unit.slice(0, 56) : args.policyId;
    assetNameHex = args.unit ? args.unit.slice(56) : args.assetName;

    // "Dò" xem index nào tạo ra Policy ID này
    console.log(`Searching for script matching policy ${targetPolicyId}...`);
    for (let i = 100; i < 115; i++) {
      const attempt = buildUniquePolicy(paymentKeyHash, i);
      if (attempt.policyId === targetPolicyId) {
        mintScript = attempt.script;
        break;
      }
    }
  }

  if (!mintScript) {
    console.error("❌ Không tìm thấy script phù hợp. Token này có thể không được mint bởi ví này hoặc sai cơ chế Unique Policy.");
    process.exit(1);
  }

  const unit = `${targetPolicyId}${assetNameHex}`;
  const utxos = await lucid.utxosAt(address);
  const balance = utxos.reduce((sum, u) => sum + (u.assets[unit] || 0n), 0n);

  const amountToBurn = args.amount ? BigInt(args.amount) : balance;

  if (amountToBurn <= 0n) {
    console.log(`Zero balance for ${unit}. Nothing to burn.`);
    return;
  }

  console.log(`Unit:   ${unit}`);
  console.log(`Action: BURN ${amountToBurn.toString()} tokens`);

  const tx = await lucid
    .newTx()
    .mintAssets({ [unit]: -amountToBurn })
    .attach.MintingPolicy(mintScript)
    .complete({ changeAddress: address });

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  console.log(`\n✅ Burn thành công! TX: ${txHash}`);
}

main().catch(console.error);