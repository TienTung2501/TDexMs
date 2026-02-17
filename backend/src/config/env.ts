/**
 * Environment variables validation with Zod
 * Fail fast on startup if required vars are missing.
 *
 * Stack: Render (Node.js) + Supabase (PostgreSQL) + Blockfrost (Cardano) + Upstash (Redis)
 */
import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database (Supabase PostgreSQL)
  DATABASE_URL: z.string().min(1),

  // Cache (Upstash Redis)
  UPSTASH_REDIS_URL: z.string().default(''),
  UPSTASH_REDIS_TOKEN: z.string().default(''),

  // Cardano
  CARDANO_NETWORK: z.enum(['preprod', 'preview', 'mainnet']).default('preprod'),

  // Blockfrost — primary chain provider
  BLOCKFROST_URL: z.string().default('https://cardano-preprod.blockfrost.io/api/v0'),
  BLOCKFROST_PROJECT_ID: z.string().default(''),

  // Smart Contract addresses
  ESCROW_SCRIPT_ADDRESS: z.string().default(''),
  POOL_SCRIPT_ADDRESS: z.string().default(''),

  // Solver
  SOLVER_SEED_PHRASE: z.string().default(''),
  SOLVER_BATCH_WINDOW_MS: z.coerce.number().int().positive().default(5000),
  SOLVER_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  SOLVER_MIN_PROFIT_LOVELACE: z.coerce.number().int().default(100_000),
  SOLVER_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // JWT
  JWT_SECRET: z.string().min(1).default('dev-secret-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Chart / OHLCV
  CHART_SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  CHART_MAX_CANDLES: z.coerce.number().int().positive().default(500),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

/** Validated environment variables (singleton) */
export const env: Env = loadEnv();
