import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { waitForAcceptanceObservation } from './ios-simulator-acceptance-runner.mjs';
import {
  isForegroundSyncLifecycleSnapshotSettled,
  parseForegroundSyncLifecycleSnapshot
} from './ios-foreground-sync-lifecycle-snapshot.mjs';

const SNAPSHOT_SQL = `SELECT key, value FROM companion_meta
  WHERE key IN ('device_id','workspace_sync_endpoint_url','workspace_sync_last_synced_at','workspace_sync_events')
  UNION ALL SELECT 'sync_pack_cursor', MAX(CAST(cursor_value AS INTEGER)) FROM sync_peer_cursors
  WHERE stream_name = 'sync-pack-receive'`;
const RUN_SETTLEMENT_TIMEOUT_MS = 120_000;

export function readForegroundSyncLifecycleSnapshot(repoRoot, databasePath) {
  const result = spawnSync('sqlite3', ['-json', databasePath, SNAPSHOT_SQL], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `sqlite3 failed with ${result.status}`);
  return parseForegroundSyncLifecycleSnapshot(result.stdout);
}

export function waitForForegroundSyncLifecycleSnapshot(args) {
  return waitForAcceptanceObservation({
    accept: (snapshot) => isForegroundSyncLifecycleSnapshotSettled(snapshot) &&
      (!args.previousRunId || snapshot.latestFinished.runId !== args.previousRunId),
    describe: (snapshot) => `snapshot=${JSON.stringify(snapshot)}`,
    initialObservation: 'permanent recovery snapshot was not readable',
    label: 'permanent foreground sync recovery',
    read: () => readForegroundSyncLifecycleSnapshot(args.repoRoot, args.databasePath),
    timeoutMs: RUN_SETTLEMENT_TIMEOUT_MS
  });
}

export function waitForForegroundSyncLifecycleRunCompletion(args) {
  return waitForAcceptanceObservation({
    accept: (snapshot) => snapshot.latestFinished?.runId &&
      snapshot.latestFinished.runId !== args.previousRunId &&
      snapshot.latestFinished.result === args.expectedResult,
    describe: (snapshot) => `snapshot=${JSON.stringify(snapshot)}`,
    initialObservation: 'foreground sync run completion was not readable',
    label: `${args.expectedResult} foreground sync run completion`,
    read: () => readForegroundSyncLifecycleSnapshot(args.repoRoot, args.databasePath),
    timeoutMs: RUN_SETTLEMENT_TIMEOUT_MS
  });
}

export function waitForForegroundSyncRequestPhase(options, phase, count) {
  return waitForAcceptanceObservation({
    accept: (value) => value.foreground_sync_lifecycle.phase_requests[phase] === count &&
      value.foreground_sync_lifecycle.active_requests === 0,
    describe: (value) => `${phase} requests=${value.foreground_sync_lifecycle?.phase_requests?.[phase] ?? 0}`,
    initialObservation: `${phase} request was not observed`, label: `${phase} canonical sync pass`,
    read: () => readServiceObservations(options), timeoutMs: 30_000
  });
}

export function readServiceObservations(options) {
  return JSON.parse(readFileSync(path.join(options.artifactDir, 'service-observations.json'), 'utf8'));
}
