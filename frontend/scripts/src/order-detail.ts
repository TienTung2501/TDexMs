/**
 * CLI: Get order detail by ID
 * Usage: npx tsx src/order-detail.ts --id=<orderId>
 *
 * Tests: GET /orders/:orderId
 */
import { apiFetch, log, parseArgs } from './shared.js';

async function main() {
  const args = parseArgs();
  const orderId = args.id || args.orderId;

  if (!orderId) {
    console.log('No --id provided. Fetching recent orders...\n');
    const orders = await apiFetch<any>('/orders?limit=5');
    const items = orders.items ?? [];
    if (items.length === 0) {
      console.log('No orders found. Create one first with: npx tsx src/create-order.ts');
      process.exit(0);
    }
    for (const o of items) {
      console.log(`  ${o.id?.slice(0, 16)}... | ${o.type} | ${o.status} | ${o.inputAmount} ${o.inputAsset?.split('.')[1] || 'ADA'}`);
    }
    console.log(`\nPass --id=<orderId> to view details.`);
    return;
  }

  console.log(`Fetching order: ${orderId}\n`);
  const order = await apiFetch<any>(`/orders/${orderId}`);
  log('Order Detail', order);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
