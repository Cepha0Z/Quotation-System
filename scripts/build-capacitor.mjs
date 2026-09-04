import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const startedAt = Date.now();
const result = spawnSync(
  process.execPath,
  ['node_modules/vinext/dist/cli.js', 'build'],
  {
    cwd: process.cwd(),
    env: { ...process.env, CAPACITOR_BUILD: '1' },
    encoding: 'utf8',
  },
);

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.status === 0) process.exit(0);

// Vinext 1.0.0-beta.5 can finish a static export on Windows and then trip a
// libuv handle assertion while shutting down its prerender server. Do not make
// Windows development unusable when the newly-created export is demonstrably
// complete; all other failures and all non-Windows failures remain fatal.
const indexPath = 'dist/client/index.html';
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const completedBeforeWindowsShutdownBug =
  process.platform === 'win32' &&
  existsSync(indexPath) &&
  statSync(indexPath).mtimeMs >= startedAt &&
  output.includes('Build complete') &&
  output.includes('UV_HANDLE_CLOSING');

if (completedBeforeWindowsShutdownBug) {
  process.stderr.write(
    '\n[build:ios] Accepted completed static export after known Vinext Windows shutdown assertion.\n',
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
