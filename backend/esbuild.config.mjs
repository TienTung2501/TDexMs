/**
 * esbuild bundle config for production deployment.
 *
 * Bundles the entire backend into a single ESM file, inlining all JS/TS
 * dependencies (including libsodium-wrappers-sumo, lucid-evolution, etc.).
 *
 * @prisma/client is kept external because it ships a native Query Engine
 * binary (.node) that cannot be inlined.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',

  // ── Packages that MUST remain external ─────────────────────────────
  // @prisma/client — contains native .node Query Engine binary
  // prisma        — CLI binary used by migrate deploy
  // pino-pretty   — optional dev formatter, not needed in production
  external: ['@prisma/client', 'prisma', 'pino-pretty', '.prisma/client'],

  // ── CJS interop banner ───────────────────────────────────────────────
  // Some transitive deps still use require() internally; esbuild needs
  // require to be defined in the ESM bundle.
  banner: {
    js: [
      "import { createRequire } from 'module';",
      "const require = createRequire(import.meta.url);",
    ].join('\n'),
  },

  // Silence "converting circular structure" warnings from lucid
  logOverride: {
    'circular-dependency': 'silent',
  },
});

console.log('✓ esbuild bundle complete → dist/index.js');
