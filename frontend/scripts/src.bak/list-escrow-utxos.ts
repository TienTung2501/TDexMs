/**
 * CLI: List all escrow UTXOs at the escrow validator address
 * Usage: npx tsx src/list-escrow-utxos.ts [--address=<escrow_addr>]
 *
 * This is useful for debugging:
 * - Verify intents are locked at the escrow correctly
 * - Check datums attached to escrow UTXOs
 * - Monitor pending intents
 *
 * Environment:
 *   BLOCKFROST_URL, BLOCKFROST_PROJECT_ID
 *   ESCROW_ADDRESS (or pass --address)
 */
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';
import { apiFetch, log, requireEnv, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();

  const network = (process.env.NETWORK || 'Preprod') as 'Preprod' | 'Preview' | 'Mainnet';
  const lucid = await Lucid(
    new Blockfrost(requireEnv('BLOCKFROST_URL'), requireEnv('BLOCKFROST_PROJECT_ID')),
    network,
  );

  // Use ESCROW_ADDRESS env or --address flag
  const escrowAddress = args.address || process.env.ESCROW_ADDRESS;

  if (!escrowAddress) {
    console.error('Provide the escrow validator address via --address=<addr> or ESCROW_ADDRESS env var');
    process.exit(1);
  }

  console.log(`Querying escrow UTXOs at: ${escrowAddress}`);

  const utxos = await lucid.utxosAt(escrowAddress);

  console.log(`\nFound ${utxos.length} UTXOs:\n`);

  for (const utxo of utxos) {
    console.log(`  TxHash: ${utxo.txHash}#${utxo.outputIndex}`);
    console.log(`  Assets:`, JSON.stringify(utxo.assets, null, 4));
    if (utxo.datum) {
      console.log(`  Datum (inline):`, utxo.datum.substring(0, 120) + (utxo.datum.length > 120 ? '...' : ''));
    } else if (utxo.datumHash) {
      console.log(`  DatumHash: ${utxo.datumHash}`);
    }
    console.log('  ---');
  }

  log('Summary', {
    address: escrowAddress,
    totalUtxos: utxos.length,
    totalLovelace: utxos.reduce((sum, u) => sum + BigInt(u.assets['lovelace'] || 0), 0n).toString(),
  });
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message || err);
  process.exit(1);
});
