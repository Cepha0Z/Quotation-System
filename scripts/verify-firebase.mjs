import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = '/private/tmp/firebase-verification.cjs';
await build({
  entryPoints: ['scripts/verify-firebase-entry.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
});
await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
