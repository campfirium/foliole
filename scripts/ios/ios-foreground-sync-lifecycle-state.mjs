import { spawnSync } from 'node:child_process';

import { waitForAcceptanceObservation } from './ios-simulator-acceptance-runner.mjs';
import {
  isForegroundSyncLifecycleSnapshotSettled,
  parseForegroundSyncLifecycleSnapshot
} from './ios-foreground-sync-lifecycle-snapshot.mjs';

const SNAPSHOT_SQL = "SELECT key, value FROM companion_meta WHERE key IN ('device_id','workspace_sync_endpoint_url','workspace_sync_last_synced_at','workspace_sync_events','sync_pack_cursor')";

export function readForegroundSyncLifecycleSnapshot(repoRoot, databasePath) {
  const result = spawnSync('sqlite3', ['-json', databasePath, SNAPSHOT_SQL], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `sqlite3 failed with ${result.status}`);
  return parseForegroundSyncLifecycleSnapshot(result.stdout);
}

export function waitForForegroundSyncLifecycleSnapshot(args) {
  return waitForAcceptanceObservation({
    accept: (snapshot) => isForegroundSyncLifecycleSnapshotSettled(snapshot) &&
      (!args.previousRunId || snapshot.latestFinished.runId !== args.previousRunId),
    describe: (snapshot) => `latest run=${snapshot.latestFinished?.runId ?? 'missing'} status=${snapshot.latestFinished?.status ?? 'missing'}`,
    initialObservation: 'permanent recovery snapshot was not readable',
    label: 'permanent foreground sync recovery',
    read: () => readForegroundSyncLifecycleSnapshot(args.repoRoot, args.databasePath),
    timeoutMs: 20_000
  });
}
