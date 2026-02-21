import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',

  // ── Packages that MUST remain external ─────────────────────────────
  external: ['@prisma/client', 'prisma', 'pino-pretty', '.prisma/client'],

  // ── CJS interop banner (Phiên bản chống xung đột) ──────────────────
  banner: {
    js: [
      "import { createRequire as _createRequire } from 'module';",
      "const require = _createRequire(import.meta.url);"
    ].join('\n'),
  },

  // Silence "converting circular structure" warnings from lucid
  logOverride: {
    'circular-dependency': 'silent',
  },
});

console.log('✓ esbuild bundle complete → dist/index.js');