/**
 * Shared API client for CLI debug scripts.
 * Mirrors frontend/src/lib/api.ts but for Node.js / CLI usage.
 */
import 'dotenv/config';

// R-11 fix: Default to localhost for local development (was production URL)
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const API_V1 = `${API_BASE}/v1`;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { params?: Record<string, string> },
): Promise<T> {
  const { params, ...init } = options || {};

  let url = `${API_V1}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${body?.message || res.statusText}`);
  }
  return res.json();
}

// ─── Helpers ─────────────────────────────────

export function log(label: string, data: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(data, null, 2));
}

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing env var: ${name}. Copy .env.example → .env and fill in values.`);
    process.exit(1);
  }
  return val;
}

export function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      args[key] = rest.join('=') || 'true';
    }
  });
  return args;
}
