/**
 * Prisma client singleton
 */
import { PrismaClient } from '@prisma/client';
import { getLogger } from '../../config/logger.js';

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (_prisma) return _prisma;

  const logger = getLogger();

  _prisma = new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

  _prisma.$on('warn' as never, (e: unknown) => {
    logger.warn(e, 'Prisma warning');
  });
  _prisma.$on('error' as never, (e: unknown) => {
    logger.error(e, 'Prisma error');
  });

  return _prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
