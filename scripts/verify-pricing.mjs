import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = '/private/tmp/pricing-verification.cjs';
await build({
  entryPoints: ['scripts/verify-pricing-entry.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
});
await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
