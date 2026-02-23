/**
 * ═══════════════════════════════════════════════════════════════════
 * PHASE 1: MINT TEST TOKENS & DISTRIBUTE TO WALLETS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Mints 5 test tokens (tBTC, tUSDT, tPOLYGON, tNEAR, tSOL) from the
 * admin wallet. Then distributes tokens to User2..User7 wallets so each
 * wallet has tokens to test with.
 *
 * Usage:
 *   npx tsx src/01-mint-and-distribute.ts
 *   npx tsx src/01-mint-and-distribute.ts --skip-mint     # Only distribute
 *   npx tsx src/01-mint-and-distribute.ts --skip-distribute
 */
import {
  Lucid,
  Blockfrost,
  getAddressDetails,
  mintingPolicyToId,
  toUnit,
  type Script,
} from '@lucid-evolution/lucid';

import {
  initWallet,
  initAllWallets,
  WALLETS,
  NETWORK,
  BF_URL,
  BF_KEY,
  TEST_TICKERS,
  buildUniquePolicy,
  textToHex,
  waitTx,
  sleep,
  parseArgs,
  logSection,
  logStep,
  logSuccess,
  logFail,
  logInfo,
  formatAda,
  getWalletBalance,
  getAllTestTokenUnits,
  record,
  printSummary,
  type WalletCtx,
  type WalletName,
} from './test-helpers.js';

const args = parseArgs();
const SKIP_MINT = args['skip-mint'] === 'true';
const SKIP_DISTRIBUTE = args['skip-distribute'] === 'true';

// Token definitions
interface TokenDef {
  ticker: string;
  supply: bigint;
  name: string;
  image: string;
  decimals: number;
  description: string;
}

const TOKENS: TokenDef[] = [
  {
    ticker: 'tBTC', supply: 21_000_000_00000000n, name: 'Test Bitcoin',
    image: 'ipfs://bafkreigqrejn2u3eiclyx4fnfoownopkjcmjm2atsqvl6c4koyboi2647a',
    decimals: 8, description: 'Test Bitcoin token on Cardano Preprod',
  },
  {
    ticker: 'tUSDT', supply: 1_000_000_000_000000n, name: 'Test Tether USD',
    image: 'ipfs://bafkreia6nhyo7edo5vtraapffk3auczsz4spyl2gs7lmpseitocinbl6pa',
    decimals: 6, description: 'Test USDT stablecoin on Cardano Preprod',
  },
  {
    ticker: 'tPOLYGON', supply: 500_000_000_000000n, name: 'Test Polygon',
    image: 'ipfs://bafkreiafxotb762oywlvydqpo4juvilrycz7uiwu46auw2paeoy3jgzhbi',
    decimals: 6, description: 'Test Polygon (MATIC) token on Cardano Preprod',
  },
  {
    ticker: 'tNEAR', supply: 500_000_000_000000n, name: 'Test NEAR',
    image: 'ipfs://bafkreibyko4tnhy6g4s3hp6f4pfjdueu7yon3ijckzob4f4phmudwavloi',
    decimals: 6, description: 'Test NEAR Protocol token on Cardano Preprod',
  },
  {
    ticker: 'tSOL', supply: 100_000_000_000000000n, name: 'Test Solana',
    image: 'ipfs://bafkreiawzklak2whua24ori2glshvlffqofluf4ursxsbbjzgnupxcntqm',
    decimals: 9, description: 'Test Solana token on Cardano Preprod',
  },
];

function metadataString(s: string): string | string[] {
  if (s.length <= 64) return s;
  const chunks: string[] = [];
  for (let i = 0; i < s.length; i += 64) chunks.push(s.slice(i, i + 64));
  return chunks;
}

// ═══════════════════════════════════════════
// STEP 1: Mint all test tokens
// ═══════════════════════════════════════════

async function mintTestTokens(admin: WalletCtx): Promise<void> {
  logSection('STEP 1: Mint Test Tokens');

  if (SKIP_MINT) {
    logInfo('Skipped via --skip-mint');
    return;
  }

  const t0 = Date.now();

  // Check if admin already has all tokens
  const balance = await getWalletBalance(admin);
  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
  const missingTokens: TokenDef[] = [];

  for (const token of TOKENS) {
    const unit = tokenUnits[token.ticker];
    if (!balance.tokens[unit] || balance.tokens[unit] <= 0n) {
      missingTokens.push(token);
    } else {
      logInfo(`${token.ticker} already exists: ${balance.tokens[unit]}`);
    }
  }

  if (missingTokens.length === 0) {
    record('Mint tokens', 'PASS', 'All tokens already exist', Date.now() - t0);
    return;
  }

  logStep(`Minting ${missingTokens.length} token(s)...`);

  try {
    let tx = admin.lucid.newTx();
    const fullMetadata721: Record<string, any> = {};

    for (const token of missingTokens) {
      const idx = TEST_TICKERS.indexOf(token.ticker);
      const { script, policyId } = buildUniquePolicy(admin.paymentKeyHash, idx);
      const assetName = textToHex(token.ticker);
      const unit = toUnit(policyId, assetName);

      tx = tx.mintAssets({ [unit]: token.supply }).attach.MintingPolicy(script);

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

    tx = tx.attachMetadata(721, fullMetadata721 as any);
    tx = tx.validFrom(Date.now() - 120_000);

    const completed = await tx.complete({ changeAddress: admin.address });
    const signed = await completed.sign.withWallet().complete();
    const txHash = await signed.submit();
    logSuccess(`Mint TX: ${txHash}`);

    const ok = await waitTx(admin.lucid, txHash);
    if (ok) {
      record('Mint tokens', 'PASS', `Minted ${missingTokens.map(t => t.ticker).join(', ')}`, Date.now() - t0);
    } else {
      record('Mint tokens', 'FAIL', 'TX not confirmed', Date.now() - t0);
    }
  } catch (e: any) {
    record('Mint tokens', 'FAIL', e.message, Date.now() - t0);
  }
}

// ═══════════════════════════════════════════
// STEP 2: Distribute tokens to test wallets
// ═══════════════════════════════════════════

async function distributeTokens(admin: WalletCtx): Promise<void> {
  logSection('STEP 2: Distribute Tokens to Test Wallets');

  if (SKIP_DISTRIBUTE) {
    logInfo('Skipped via --skip-distribute');
    return;
  }

  const t0 = Date.now();
  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);

  // Distribution plan: send some tokens to User2..User5
  // Each user gets different tokens for diverse testing
  const distributions: { walletKey: WalletName; tokens: { ticker: string; amount: bigint }[]; ada: bigint }[] = [
    {
      walletKey: 'user2',
      tokens: [
        { ticker: 'tBTC', amount: 100_00000000n },      // 100 tBTC
        { ticker: 'tUSDT', amount: 50_000_000000n },     // 50,000 tUSDT
      ],
      ada: 50_000_000n, // 50 ADA
    },
    {
      walletKey: 'user3',
      tokens: [
        { ticker: 'tSOL', amount: 500_000000000n },      // 500 tSOL
        { ticker: 'tUSDT', amount: 30_000_000000n },     // 30,000 tUSDT
      ],
      ada: 50_000_000n,
    },
    {
      walletKey: 'user4',
      tokens: [
        { ticker: 'tPOLYGON', amount: 10_000_000000n },  // 10,000 tPOLYGON
        { ticker: 'tNEAR', amount: 5_000_000000n },       // 5,000 tNEAR
      ],
      ada: 50_000_000n,
    },
    {
      walletKey: 'user5',
      tokens: [
        { ticker: 'tBTC', amount: 50_00000000n },         // 50 tBTC
        { ticker: 'tNEAR', amount: 3_000_000000n },       // 3,000 tNEAR
      ],
      ada: 50_000_000n,
    },
  ];

  for (const dist of distributions) {
    const def = WALLETS[dist.walletKey];
    const seed = process.env[def.envKey];
    if (!seed) {
      logInfo(`${def.name}: No seed — skipping`);
      continue;
    }

    // Get target address
    const lucid = await Lucid(new Blockfrost(BF_URL, BF_KEY), NETWORK);
    lucid.selectWallet.fromSeed(seed);
    const targetAddr = await lucid.wallet().address();

    logStep(`Distributing to ${def.name} (${targetAddr.slice(0, 30)}...)`);

    // Check if already has tokens
    const targetUtxos = await lucid.utxosAt(targetAddr);
    const targetAda = targetUtxos.reduce((s, u) => s + (u.assets['lovelace'] || 0n), 0n);
    if (targetAda >= 30_000_000n && dist.tokens.length > 0) {
      // Check if has at least some of the tokens
      const targetTokens: Record<string, bigint> = {};
      for (const u of targetUtxos) {
        for (const [unit, qty] of Object.entries(u.assets)) {
          if (unit !== 'lovelace') targetTokens[unit] = (targetTokens[unit] || 0n) + (qty as bigint);
        }
      }
      const hasAllTokens = dist.tokens.every((t) => {
        const unit = tokenUnits[t.ticker];
        return targetTokens[unit] && targetTokens[unit] > 0n;
      });
      if (hasAllTokens) {
        logInfo(`${def.name} already has tokens — skipping`);
        continue;
      }
    }

    try {
      const assets: Record<string, bigint> = { lovelace: dist.ada };
      for (const t of dist.tokens) {
        const unit = tokenUnits[t.ticker];
        assets[unit] = t.amount;
      }

      const tx = admin.lucid.newTx().pay.ToAddress(targetAddr, assets);
      const completed = await tx.complete({ changeAddress: admin.address });
      const signed = await completed.sign.withWallet().complete();
      const txHash = await signed.submit();
      logSuccess(`Distribution TX to ${def.name}: ${txHash.slice(0, 20)}...`);
      await waitTx(admin.lucid, txHash, 90_000);
    } catch (e: any) {
      logFail(`Distribution to ${def.name} failed: ${e.message?.slice(0, 100)}`);
    }
  }

  record('Distribute tokens', 'PASS', 'Tokens distributed to test wallets', Date.now() - t0);
}

// ═══════════════════════════════════════════
// STEP 3: Verify wallet balances
// ═══════════════════════════════════════════

async function verifyBalances(admin: WalletCtx): Promise<void> {
  logSection('STEP 3: Verify Wallet Balances');

  const tokenUnits = getAllTestTokenUnits(admin.paymentKeyHash);
  const wallets = await initAllWallets();

  for (const [key, wallet] of Object.entries(wallets)) {
    if (!wallet) continue;
    const balance = await getWalletBalance(wallet);
    const tokenList = Object.entries(balance.tokens)
      .map(([unit, qty]) => {
        const ticker = Object.entries(tokenUnits).find(([, u]) => u === unit)?.[0] || unit.slice(56);
        return `${ticker}:${qty}`;
      })
      .join(', ');
    logInfo(`${wallet.name}: ${formatAda(balance.ada)} ADA, Tokens: ${tokenList || 'none'}`);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  ██  PHASE 1: MINT & DISTRIBUTE TEST TOKENS  ██');
  console.log('█'.repeat(60));

  const admin = await initWallet('admin');
  console.log(`  Admin: ${admin.address}`);

  await mintTestTokens(admin);
  await sleep(5000); // Wait for chain propagation
  await distributeTokens(admin);
  await sleep(5000);
  await verifyBalances(admin);

  printSummary();
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
