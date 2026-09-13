// Run with the Realtime Database emulator on 127.0.0.1:9000.
// Uses an isolated demo namespace, never the production Firebase configuration.
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = join(await mkdtemp(join(tmpdir(), 'boq-rules-')), 'test.cjs');
await build({
  entryPoints: ['scripts/verify-firebase-emulator-entry.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  plugins: [{ name: 'isolated-firebase-services', setup(builder) {
    builder.onResolve({ filter: /(?:@\/lib\/firebase|lib\/firebase)$/ }, () => ({ path: 'services', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
      contents: 'export const getFirebaseServices = () => globalThis.__boqTestServices;', loader: 'js',
    }));
  } }],
});
await import(pathToFileURL(output).href);
