/**
 * Chart API Routes — TradingView-compatible OHLCV endpoints
 *
 * Endpoints:
 *   GET /chart/config         → TradingView UDF config
 *   GET /chart/symbols        → Symbol info
 *   GET /chart/history        → TradingView UDF history (candles)
 *   GET /chart/candles        → Raw candle query
 *   GET /chart/price/:poolId  → Latest price
 *   GET /chart/info/:poolId   → 24h pool chart info
 */
import { Router } from 'express';
import type { CandlestickService } from '../../../application/services/CandlestickService.js';

export function createChartRouter(candlestickService: CandlestickService): Router {
  const router = Router();

  // ─── TradingView UDF: /chart/config ───
  router.get('/chart/config', (_req, res) => {
    res.json({
      supported_resolutions: ['240', '1D', '1W'],
      supports_group_request: false,
      supports_marks: false,
      supports_search: true,
      supports_timescale_marks: false,
    });
  });

  // ─── TradingView UDF: /chart/symbols ───
  router.get('/chart/symbols', (req, res) => {
    const symbol = (req.query.symbol as string) ?? '';
    // Return minimal symbol info for TradingView
    res.json({
      name: symbol,
      ticker: symbol,
      description: `Pool ${symbol}`,
      type: 'crypto',
      session: '24x7',
      timezone: 'Etc/UTC',
      exchange: 'SolverNet',
      minmov: 1,
      pricescale: 1_000_000_000_000_000, // 15 decimals for Cardano
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: ['240', '1D', '1W'],
      data_status: 'streaming',
    });
  });

  // ─── TradingView UDF: /chart/history ───
  router.get('/chart/history', async (req, res) => {
    try {
      const {
        symbol,
        resolution,
        from,
        to,
        countback,
      } = req.query as Record<string, string>;

      if (!symbol) {
        return res.json({ s: 'error', errmsg: 'Missing symbol param' });
      }

      // Map TradingView resolution to our interval format
      const interval = mapTvResolution(resolution ?? '60');

      const fromTs = from ? parseInt(from, 10) : undefined;
      const toTs = to ? parseInt(to, 10) : undefined;
      const limit = countback ? parseInt(countback, 10) : undefined;

      const candles = await candlestickService.getCandles({
        poolId: symbol,
        interval,
        from: fromTs,
        to: toTs,
        limit,
      });

      if (candles.length === 0) {
        return res.json({ s: 'no_data' });
      }

      // TradingView UDF format: arrays of t, o, h, l, c, v
      res.json({
        s: 'ok',
        t: candles.map((c) => c.time),
        o: candles.map((c) => c.open),
        h: candles.map((c) => c.high),
        l: candles.map((c) => c.low),
        c: candles.map((c) => c.close),
        v: candles.map((c) => parseFloat(c.volume)),
      });
    } catch (err) {
      res.status(500).json({
        s: 'error',
        errmsg: err instanceof Error ? err.message : 'Internal error',
      });
    }
  });

  // ─── Direct candle query: /chart/candles ───
  router.get('/chart/candles', async (req, res) => {
    try {
      const {
        poolId,
        interval = '4h',
        from,
        to,
        limit,
      } = req.query as Record<string, string>;

      if (!poolId) {
        return res.status(400).json({
          status: 'error',
          code: 'MISSING_POOL_ID',
          message: 'poolId query parameter is required',
        });
      }

      const candles = await candlestickService.getCandles({
        poolId,
        interval,
        from: from ? parseInt(from, 10) : undefined,
        to: to ? parseInt(to, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      res.json({
        status: 'ok',
        poolId,
        interval,
        count: candles.length,
        candles,
      });
    } catch (err) {
      res.status(400).json({
        status: 'error',
        message: err instanceof Error ? err.message : 'Invalid request',
      });
    }
  });

  // ─── Latest price: /chart/price/:poolId ───
  router.get('/chart/price/:poolId', async (req, res) => {
    try {
      const price = await candlestickService.getLatestPrice(req.params.poolId);

      if (price === null) {
        return res.status(404).json({
          status: 'error',
          code: 'NO_PRICE_DATA',
          message: 'No price data available for this pool',
        });
      }

      res.json({ status: 'ok', poolId: req.params.poolId, price });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        message: err instanceof Error ? err.message : 'Internal error',
      });
    }
  });

  // ─── Pool chart info: /chart/info/:poolId ───
  router.get('/chart/info/:poolId', async (req, res) => {
    try {
      const info = await candlestickService.getPoolChartInfo(req.params.poolId);

      if (!info) {
        return res.status(404).json({
          status: 'error',
          code: 'POOL_NOT_FOUND',
          message: 'Pool not found',
        });
      }

      res.json({ status: 'ok', ...info });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        message: err instanceof Error ? err.message : 'Internal error',
      });
    }
  });

  // ─── Available intervals: /chart/intervals ───
  router.get('/chart/intervals', (_req, res) => {
    res.json({
      status: 'ok',
      intervals: candlestickService.getAvailableIntervals(),
    });
  });

  return router;
}

// ─── Helpers ───

/** Map TradingView resolution strings to our interval keys */
function mapTvResolution(resolution: string): string {
  const map: Record<string, string> = {
    '240': '4h',
    '1D': '1d',
    'D': '1d',
    '1W': '1w',
    'W': '1w',
  };
  return map[resolution] ?? '4h';
}
