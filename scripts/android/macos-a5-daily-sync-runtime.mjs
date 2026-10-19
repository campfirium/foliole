import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { readElectronDevSnapshot } from '../desktop/electron-dev-control-state.mjs';
import { MACOS_DAILY_LIBRARY_HOME, resolveMacosElectronDevPaths } from '../macos/macos-electron-dev-paths.mjs';
import { PAIR_SYNC_PORT } from '../sync-group/pair-sync-transport.mjs';

const execute = promisify(execFile);

export async function assertMacosA5DailySyncRuntime(repoRoot, dependencies = {}) {
  const snapshot = (dependencies.readSnapshot ?? readElectronDevSnapshot)(resolveMacosElectronDevPaths(repoRoot));
  if (!snapshot.running) throw new Error('daily_sync_runtime_not_ready');
  const pid = snapshot.ready.appReady.pid;
  const run = dependencies.execute ?? execute;
  const listener = await run('/usr/sbin/lsof', ['-nP', `-iTCP:${PAIR_SYNC_PORT}`, '-sTCP:LISTEN', '-t']);
  const pids = [...new Set(listener.stdout.trim().split(/\s+/u))];
  if (pids.length !== 1 || pids[0] !== String(pid)) throw new Error('daily_sync_listener_mismatch');
  const database = path.join(MACOS_DAILY_LIBRARY_HOME, 'Data', 'foliole.db');
  const owner = await run('/usr/sbin/lsof', ['-a', '-p', String(pid), '-t', '--', database]);
  if (owner.stdout.trim() !== String(pid)) throw new Error('daily_sync_library_mismatch');
  return { pid };
}
