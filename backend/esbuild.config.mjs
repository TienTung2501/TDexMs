/**
 * esbuild config — fast TypeScript transpilation for backend
 *
 * Replaces `tsc` for the production build step.
 * - No bundling (imports stay as-is) → avoids WASM/native-module issues
 * - ~10–20x faster than tsc
 * - Type checking is skipped here; run `pnpm type-check` separately if needed
 */

import { build } from 'esbuild'
import { readdirSync } from 'fs'
import { join } from 'path'

/** Recursively collect .ts files, excluding tests and declaration files */
function collectTs(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTs(full))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.spec.')
    ) {
      results.push(full)
    }
  }
  return results
}

// Collect all TypeScript source files
const entryPoints = collectTs('src')

await build({
  entryPoints,
  bundle: false,       // transpile only — do NOT bundle (keeps pnpm node_modules intact)
  platform: 'node',
  target: 'node20',
  format: 'esm',       // matches "type": "module" in package.json
  outdir: 'dist',
  outbase: 'src',      // preserve directory structure under dist/
  sourcemap: true,
  minify: false,
  logLevel: 'info',
})

console.log(`✓ esbuild transpiled ${entryPoints.length} files → dist/`)
