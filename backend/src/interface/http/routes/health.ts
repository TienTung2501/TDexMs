/**
 * Health Controller
 * GET /v1/health — System health & service status
 * Uses Blockfrost for chain health, Upstash Redis for cache health
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { BlockfrostClient } from '../../../infrastructure/cardano/BlockfrostClient.js';
import type { CacheService } from '../../../infrastructure/cache/CacheService.js';
import { getPrisma } from '../../../infrastructure/database/prisma-client.js';

const startTime = Date.now();

export function createHealthRouter(
  blockfrost: BlockfrostClient,
  cache: CacheService | null,
): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const checks = [
      checkDatabase(),
      blockfrost.isHealthy(),
      cache ? cache.isHealthy() : Promise.resolve(null),
    ];

    const results = await Promise.allSettled(checks);

    const dbOk = results[0]?.status === 'fulfilled' && results[0].value;
    const blockfrostOk = results[1]?.status === 'fulfilled' && results[1].value;
    const cacheResult = results[2]?.status === 'fulfilled' ? results[2].value : false;
    const cacheOk = cacheResult === null ? 'not_configured' : cacheResult ? 'healthy' : 'unhealthy';

    const allHealthy = dbOk && blockfrostOk;

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      version: '0.1.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        database: dbOk ? 'healthy' : 'unhealthy',
        blockfrost: blockfrostOk ? 'healthy' : 'unhealthy',
        cache: cacheOk,
      },
    });
  });

  router.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      await checkDatabase();
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not ready' });
    }
  });

  return router;
}

async function checkDatabase(): Promise<boolean> {
  const prisma = getPrisma();
  await prisma.$queryRaw`SELECT 1`;
  return true;
}
