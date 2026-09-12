import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = '/private/tmp/quotation-export-verification.cjs';
await build({
  entryPoints: ['scripts/verify-excel-export-entry.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
});
await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
