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

  // BỎ HOÀN TOÀN ĐOẠN BANNER NÀY ĐI
  // banner: { ... },

  // Silence "converting circular structure" warnings from lucid
  logOverride: {
    'circular-dependency': 'silent',
  },
});

console.log('✓ esbuild bundle complete → dist/index.js');