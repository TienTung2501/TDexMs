/**
 * Portfolio Controller
 * Aggregated wallet data: intents, orders, LP positions
 * Extended routes for new portfolio UI (summary, open-orders, history, liquidity, build-action, build-withdraw)
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { writeLimiter } from '../middleware/rate-limiter.js';
import type { GetPortfolio } from '../../../application/use-cases/GetPortfolio.js';
import type { IIntentRepository } from '../../../domain/ports/IIntentRepository.js';
import type { IOrderRepository } from '../../../domain/ports/IOrderRepository.js';
import type { IPoolRepository } from '../../../domain/ports/IPoolRepository.js';
import type { ITxBuilder } from '../../../domain/ports/index.js';

export function createPortfolioRouter(
  getPortfolio: GetPortfolio,
  intentRepo: IIntentRepository,
  orderRepo: IOrderRepository,
  poolRepo?: IPoolRepository,
  txBuilder?: ITxBuilder,
): Router {
  const router = Router();

  // ──────────────────────────────────────────────
  // Ticker resolution helper: hex assetName → human-readable ticker
  // Uses pool metadata to resolve tickers. Falls back to hex→UTF-8 decoding.
  // ──────────────────────────────────────────────
  let _tickerCache: Map<string, string> | null = null;
  let _tickerCacheTs = 0;
  const TICKER_CACHE_TTL = 60_000; // 60s

  /** Decode a hex-encoded Cardano asset name to UTF-8. Returns original if invalid. */
  function hexToUtf8(hex: string): string {
    if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return hex;
    try {
      const bytes = Buffer.from(hex, 'hex');
      const str = bytes.toString('utf8');
      // Only return if all chars are printable ASCII/Unicode
      if (/^[\x20-\x7E\u00A0-\uFFFF]+$/.test(str)) return str;
      return hex;
    } catch {
      return hex;
    }
  }

  async function resolveAssetTicker(policyId: string, assetName: string): Promise<string> {
    if (!policyId || policyId === '') return 'ADA';
    if (!assetName || assetName === 'lovelace') return 'ADA';

    // Build/refresh cache from pool metadata
    if (!_tickerCache || Date.now() - _tickerCacheTs > TICKER_CACHE_TTL) {
      const map = new Map<string, string>();
      if (poolRepo) {
        try {
          const pools = await poolRepo.findMany({});
          for (const pool of pools.items) {
            if (pool.assetATicker && pool.assetAPolicyId) {
              map.set(`${pool.assetAPolicyId}.${pool.assetAAssetName}`, pool.assetATicker);
            }
            if (pool.assetBTicker && pool.assetBPolicyId) {
              map.set(`${pool.assetBPolicyId}.${pool.assetBAssetName}`, pool.assetBTicker);
            }
          }
        } catch { /* use empty cache on error */ }
      }
      _tickerCache = map;
      _tickerCacheTs = Date.now();
    }

    // Lookup from pool metadata
    const key = `${policyId}.${assetName}`;
    const fromPool = _tickerCache.get(key);
    if (fromPool) return fromPool;

    // Fallback: hex→UTF-8 decode
    return hexToUtf8(assetName);
  }

  async function buildPairString(
    inputPolicyId: string, inputAssetName: string,
    outputPolicyId: string, outputAssetName: string,
  ): Promise<string> {
    const [inTicker, outTicker] = await Promise.all([
      resolveAssetTicker(inputPolicyId, inputAssetName),
      resolveAssetTicker(outputPolicyId, outputAssetName),
    ]);
    return `${inTicker}_${outTicker}`;
  }

  // ──────────────────────────────────────────────
  // Static routes MUST be registered BEFORE /:address
  // to prevent Express from matching "summary" as an address.
  // ──────────────────────────────────────────────

  /** GET /v1/portfolio/:address/transactions — Recent transactions for wallet */
  router.get(
    '/portfolio/:address/transactions',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const address = req.params.address as string;
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        // Fetch recent intents and orders
        const [intents, orders] = await Promise.all([
          intentRepo.findMany({ address, limit }),
          orderRepo.findMany({ creator: address, limit }),
        ]);

        // Merge and sort by date
        // Filter out CREATED status — these are pre-sign records that may be ghost entries
        const transactions = [
          ...intents.items
            .filter((i) => i.status !== 'CREATED')
            .map((i) => ({
              id: i.id,
              type: 'intent' as const,
              status: i.status,
              inputAsset: `${i.inputPolicyId}.${i.inputAssetName}`,
              inputAmount: i.inputAmount.toString(),
              outputAsset: `${i.outputPolicyId}.${i.outputAssetName}`,
              createdAt: i.createdAt.toISOString(),
            })),
          ...orders.items
            .filter((o) => o.toProps().status !== 'CREATED')
            .map((o) => {
            const p = o.toProps();
            return {
              id: p.id,
              type: `order:${p.type}` as const,
              status: p.status,
              inputAsset: `${p.inputPolicyId}.${p.inputAssetName}`,
              inputAmount: (p.inputAmount ?? p.totalBudget ?? 0n).toString(),
              outputAsset: `${p.outputPolicyId}.${p.outputAssetName}`,
              createdAt: p.createdAt.toISOString(),
            };
          }),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limit);

        res.json({
          address,
          items: transactions,
          total: intents.total + orders.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ──────────────────────────────────────────────
  // Extended Portfolio Endpoints (new UI)
  // ──────────────────────────────────────────────

  /** GET /v1/portfolio/summary — Aggregated portfolio for wallet */
  router.get(
    '/portfolio/summary',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const walletAddress = req.query.wallet_address as string;
        if (!walletAddress) {
          res.status(400).json({ error: 'wallet_address is required' });
          return;
        }

        // Gather intent/order/pool counts
        const [activeIntents, activeOrders, allPools] = await Promise.all([
          intentRepo.findMany({ address: walletAddress, status: 'ACTIVE' as any, limit: 500 }),
          orderRepo.findMany({ creator: walletAddress, status: 'ACTIVE' as any, limit: 500 }),
          poolRepo ? poolRepo.findMany({}) : Promise.resolve({ items: [], total: 0 }),
        ]);

        // Estimate locked amounts (sum up input amounts from active intents + orders)
        let lockedInOrders = 0;
        for (const intent of activeIntents.items) {
          lockedInOrders += Number(intent.inputAmount);
        }
        for (const order of activeOrders.items) {
          const p = order.toProps();
          lockedInOrders += Number(p.inputAmount ?? p.totalBudget ?? 0n);
        }

        // Build allocation from unique assets in active positions
        // Use policyId.assetName as key for aggregation, resolve tickers for output
        const assetTotals = new Map<string, { policyId: string; assetName: string; amount: number }>();
        for (const intent of activeIntents.items) {
          const key = intent.inputPolicyId
            ? `${intent.inputPolicyId}.${intent.inputAssetName}`
            : 'ADA';
          const existing = assetTotals.get(key);
          if (existing) {
            existing.amount += Number(intent.inputAmount);
          } else {
            assetTotals.set(key, {
              policyId: intent.inputPolicyId,
              assetName: intent.inputAssetName,
              amount: Number(intent.inputAmount),
            });
          }
        }

        const totalKnown = lockedInOrders || 1;
        const allocation = await Promise.all(
          Array.from(assetTotals.entries()).map(async ([_key, { policyId, assetName, amount }]) => ({
            asset: await resolveAssetTicker(policyId, assetName),
            percentage: (amount / totalKnown) * 100,
            value_usd: amount * 0.5, // placeholder conversion
          })),
        );

        res.json({
          total_balance_usd: 0, // Client fills from CIP-30 wallet
          total_balance_ada: 0, // Client fills from CIP-30 wallet
          status_breakdown: {
            available_in_wallet: 0, // Client-side data (CIP-30 getBalance)
            locked_in_orders: lockedInOrders,
            locked_in_lp: 0, // Requires CIP-30 wallet UTxO scan on frontend; see /portfolio/liquidity for pool LP metadata
          },
          allocation_chart: allocation,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/portfolio/open-orders — Active UTxOs with progress, deadline, actions */
  router.get(
    '/portfolio/open-orders',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const walletAddress = req.query.wallet_address as string;
        if (!walletAddress) {
          res.status(400).json({ error: 'wallet_address is required' });
          return;
        }
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        // Fetch active intents + orders and merge
        // Only show ACTIVE and FILLING statuses (not CREATED/PENDING).
        // CREATED records are pre-sign and may be ghost records from unsigned TXs.
        // ChainSync promotes confirmed TXs to ACTIVE within ~60-120s.
        // GhostCleanupCron deletes unconfirmed CREATED records after 5 minutes.
        const activeIntentStatuses = ['ACTIVE', 'FILLING'];
        const [intentResults, orders] = await Promise.all([
          Promise.all(
            activeIntentStatuses.map((s) =>
              intentRepo.findMany({ address: walletAddress, status: s as any, limit }),
            ),
          ),
          orderRepo.findMany({ creator: walletAddress, status: 'ACTIVE' as any, limit }),
        ]);
        const intents = { items: intentResults.flatMap((r) => r.items) };

        const now = Date.now();

        const openOrders = await Promise.all([
          // Map intents as SWAP type
          ...intents.items.map(async (intent) => {
            const deadlineMs = intent.deadline * 1000;
            const isExpired = now > deadlineMs;
            const inputAmt = Number(intent.inputAmount);
            return {
              utxo_ref: `${intent.escrowTxHash ?? intent.id}#0`,
              created_at: Math.floor(intent.createdAt.getTime() / 1000),
              pair: await buildPairString(intent.inputPolicyId, intent.inputAssetName, intent.outputPolicyId, intent.outputAssetName),
              type: 'SWAP' as const,
              conditions: {
                slippage_percent: null,
                target_price: null,
                trigger_price: null,
              },
              budget: {
                initial_amount: inputAmt,
                remaining_amount: inputAmt, // Intents are all-or-nothing
                progress_percent: 0,
                progress_text: '0% filled',
              },
              deadline: intent.deadline,
              is_expired: isExpired,
              available_action: isExpired ? 'RECLAIM' as const : 'CANCEL' as const,
            };
          }),
          // Map orders
          ...orders.items.map(async (order) => {
            const p = order.toProps();
            const deadlineMs = new Date(p.deadline).getTime();
            const isExpired = now > deadlineMs;
            const initialAmount = Number(p.inputAmount ?? p.totalBudget ?? 0n);
            const remainingAmount = Number(p.remainingBudget ?? p.inputAmount ?? 0n);
            const progress = initialAmount > 0
              ? Math.round(((initialAmount - remainingAmount) / initialAmount) * 100)
              : 0;

            return {
              utxo_ref: p.escrowTxHash
                ? `${p.escrowTxHash}#${p.escrowOutputIndex ?? 0}`
                : `${p.id}#0`,
              created_at: Math.floor(p.createdAt.getTime() / 1000),
              pair: await buildPairString(p.inputPolicyId, p.inputAssetName, p.outputPolicyId, p.outputAssetName),
              type: p.type as 'SWAP' | 'LIMIT' | 'DCA' | 'STOP_LOSS',
              conditions: {
                target_price: p.priceNumerator && p.priceDenominator
                  ? Number(p.priceNumerator) / Number(p.priceDenominator)
                  : null,
                trigger_price: null,
                slippage_percent: null,
              },
              budget: {
                initial_amount: initialAmount,
                remaining_amount: remainingAmount,
                progress_percent: progress,
                progress_text: `${progress}% filled`,
              },
              deadline: Math.floor(deadlineMs / 1000),
              is_expired: isExpired,
              available_action: isExpired ? 'RECLAIM' as const : 'CANCEL' as const,
            };
          }),
        ]);

        openOrders.sort((a, b) => b.created_at - a.created_at);

        res.json(openOrders);
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/portfolio/history — Completed orders with execution data */
  router.get(
    '/portfolio/history',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const walletAddress = req.query.wallet_address as string;
        if (!walletAddress) {
          res.status(400).json({ error: 'wallet_address is required' });
          return;
        }

        const statusFilter = req.query.status as string | undefined;
        const limit = Math.min(Number(req.query.limit) || 30, 100);

        // Fetch completed intents + orders
        const completedStatuses = ['FILLED', 'CANCELLED', 'RECLAIMED', 'EXPIRED'];
        const filterStatuses = statusFilter
          ? [statusFilter]
          : completedStatuses;

        // RECLAIMED is valid for intents but not for orders — filter separately
        const validOrderStatuses = ['FILLED', 'CANCELLED', 'EXPIRED'];
        const intentFilterStatuses = filterStatuses;
        const orderFilterStatuses = filterStatuses.filter((s) => validOrderStatuses.includes(s));

        const results = await Promise.all(
          intentFilterStatuses.map(async (status) => {
            const [intents, orders] = await Promise.all([
              intentRepo.findMany({ address: walletAddress, status: status as any, limit }),
              orderFilterStatuses.includes(status)
                ? orderRepo.findMany({ creator: walletAddress, status: status as any, limit })
                : Promise.resolve({ items: [] as any[], cursor: null, hasMore: false, total: 0 }),
            ]);
            return { intents: intents.items, orders: orders.items };
          }),
        );

        // Flatten and map (async for ticker resolution)
        const history: any[] = [];

        for (const { intents, orders } of results) {
          for (const intent of intents) {
            history.push({
              order_id: intent.id,
              created_at: Math.floor(intent.createdAt.getTime() / 1000),
              completed_at: Math.floor((intent.updatedAt ?? intent.createdAt).getTime() / 1000),
              pair: await buildPairString(intent.inputPolicyId, intent.inputAssetName, intent.outputPolicyId, intent.outputAssetName),
              type: 'SWAP',
              status: intent.status === 'EXPIRED' ? 'CANCELLED' : intent.status,
              execution: {
                average_price: 0, // Would need on-chain data for actual execution price
                total_value_usd: Number(intent.inputAmount) * 0.5,
                total_asset_received: Number(intent.minOutput ?? 0),
              },
              explorer_links: intent.escrowTxHash ? [intent.escrowTxHash] : [],
            });
          }

          for (const order of orders) {
            const p = order.toProps();
            history.push({
              order_id: p.id,
              created_at: Math.floor(p.createdAt.getTime() / 1000),
              completed_at: Math.floor((p.updatedAt ?? p.createdAt).getTime() / 1000),
              pair: await buildPairString(p.inputPolicyId, p.inputAssetName, p.outputPolicyId, p.outputAssetName),
              type: p.type,
              status: p.status === 'EXPIRED' ? 'CANCELLED' : p.status,
              execution: {
                average_price: p.priceNumerator && p.priceDenominator
                  ? Number(p.priceNumerator) / Number(p.priceDenominator)
                  : 0,
                total_value_usd: Number(p.inputAmount ?? p.totalBudget ?? 0n) * 0.5,
                total_asset_received: 0,
              },
              explorer_links: p.escrowTxHash ? [p.escrowTxHash] : [],
            });
          }
        }

        // Sort newest first
        history.sort((a, b) => b.completed_at - a.completed_at);
        res.json(history.slice(0, limit));
      } catch (err) {
        next(err);
      }
    },
  );

  /** GET /v1/portfolio/liquidity — LP positions for wallet */
  router.get(
    '/portfolio/liquidity',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const walletAddress = req.query.wallet_address as string;
        if (!walletAddress) {
          res.status(400).json({ error: 'wallet_address is required' });
          return;
        }

        // In a full implementation, we'd query on-chain LP token balances via Blockfrost.
        // Since this route doesn't have direct chain access, return pool LP metadata
        // so the frontend can match its CIP-30 wallet UTxOs against known LP policies.
        const positions: any[] = [];

        if (poolRepo) {
          const pools = await poolRepo.findAllActive();
          // Return LP-eligible pool data; the frontend matches these lpPolicyIds
          // against the user's wallet UTxOs (obtained through CIP-30 getUtxos).
          for (const pool of pools) {
            if (!pool.lpPolicyId) continue;

            const reserveA = Number(pool.reserveA);
            const reserveB = Number(pool.reserveB);
            const totalLp = Number(pool.totalLpTokens);
            const pricePerLp = totalLp > 0
              ? (reserveA + reserveB) / totalLp
              : 0;

            const tickerA = pool.assetATicker ?? (pool.assetAPolicyId ? pool.assetAAssetName : 'ADA');
            const tickerB = pool.assetBTicker ?? (pool.assetBPolicyId ? pool.assetBAssetName : 'ADA');

            positions.push({
              poolId: pool.id,
              lpPolicyId: pool.lpPolicyId,
              pair: `${tickerA}_${tickerB}`,
              assetA: { policyId: pool.assetAPolicyId, assetName: pool.assetAAssetName },
              assetB: { policyId: pool.assetBPolicyId, assetName: pool.assetBAssetName },
              reserveA: pool.reserveA.toString(),
              reserveB: pool.reserveB.toString(),
              totalLpTokens: pool.totalLpTokens.toString(),
              pricePerLpToken: pricePerLp,
              tvlAda: pool.tvlAda.toString(),
              // Frontend should: filter this list by checking if walletUtxos
              // contain tokens matching lpPolicyId, then compute its share.
            });
          }
        }

        res.json(positions);
      } catch (err) {
        next(err);
      }
    },
  );

  /** POST /v1/portfolio/build-action — Build cancel/reclaim TX */
  router.post(
    '/portfolio/build-action',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { wallet_address, utxo_ref, action_type } = req.body;
        if (!wallet_address || !utxo_ref || !action_type) {
          res.status(400).json({ error: 'wallet_address, utxo_ref, and action_type are required' });
          return;
        }

        if (!txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        // Parse utxo_ref: "txHash#outputIndex"
        const [txHash, indexStr] = utxo_ref.split('#');
        const outputIndex = parseInt(indexStr, 10);

        if (!txHash || isNaN(outputIndex)) {
          res.status(400).json({ error: 'Invalid utxo_ref format. Expected: txHash#outputIndex' });
          return;
        }

        let result;
        if (action_type === 'RECLAIM') {
          result = await txBuilder.buildReclaimTx({
            escrowTxHash: txHash,
            escrowOutputIndex: outputIndex,
            keeperAddress: wallet_address,
            ownerAddress: wallet_address,
          });
        } else {
          // Try to find intent first, then order
          const intent = await intentRepo.findByUtxoRef(txHash, outputIndex);
          if (intent) {
            result = await txBuilder.buildCancelIntentTx({
              intentId: intent.id,
              senderAddress: wallet_address,
            });
          } else {
            // Assume it's an order cancel
            result = await txBuilder.buildCancelOrderTx({
              orderId: utxo_ref,
              senderAddress: wallet_address,
              escrowTxHash: txHash,
              escrowOutputIndex: outputIndex,
            });
          }
        }

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** POST /v1/portfolio/build-withdraw — Build LP withdraw TX */
  router.post(
    '/portfolio/build-withdraw',
    writeLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { wallet_address, pool_id, lp_tokens_to_burn } = req.body;
        if (!wallet_address || !pool_id || lp_tokens_to_burn == null) {
          res.status(400).json({ error: 'wallet_address, pool_id, and lp_tokens_to_burn are required' });
          return;
        }

        if (!txBuilder) {
          res.status(503).json({ error: 'TX builder not available' });
          return;
        }

        const result = await txBuilder.buildWithdrawTx({
          poolId: pool_id,
          senderAddress: wallet_address,
          changeAddress: wallet_address,
          lpTokenAmount: BigInt(lp_tokens_to_burn),
          minAmountA: 0n,
          minAmountB: 0n,
        });

        res.json({
          unsignedTx: result.unsignedTx,
          txHash: result.txHash,
          estimatedFee: result.estimatedFee.toString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ──────────────────────────────────────────────
  // Parameterized routes LAST (avoid shadowing static routes above)
  // ──────────────────────────────────────────────

  /** GET /v1/portfolio/:address — Wallet portfolio summary (legacy) */
  router.get(
    '/portfolio/:address',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await getPortfolio.execute(req.params.address as string);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
