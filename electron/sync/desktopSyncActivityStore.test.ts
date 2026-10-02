// @vitest-environment node
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { buildDesktopSyncDiagnostics } from './buildDesktopSyncDiagnostics.js';
import { loadDesktopSyncActivity, recordDesktopSyncActivity } from './desktopSyncActivityStore.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
setupSyncPackBuilderTestLifecycle();

const peerA = { peer_device_id: 'a', peer_device_name: 'Desktop A' };
const peerB = { peer_device_id: 'b', peer_device_name: 'Desktop B' };
const context = { runId: 'round-1', reason: 'automatic' as const, startedAt: '2026-10-02T00:00:00Z' };

it('retains the actual peer and direction across a round and database reopen without syncing its log', async () => {
  await recordDesktopSyncActivity(context, { direction: 'receive', stage: 'sync_pack',
    kind: 'stage_finished', status: 'completed', confirmation: 'saved', message: 'Saved from A' }, peerA);
  await recordDesktopSyncActivity(context, { direction: 'send', stage: 'sync_pack',
    kind: 'run_finished', status: 'skipped', confirmation: 'sent', result: 'waiting', message: 'Sent to B' }, peerB);
  closeDatabaseConnection();
  expect(loadDesktopSyncActivity().map((event) => [event.peer_device_id, event.direction, event.confirmation]))
    .toEqual([['b', 'send', 'sent'], ['a', 'receive', 'saved']]);
  expect(new Set(loadDesktopSyncActivity().map((event) => event.run_id))).toEqual(new Set(['round-1']));
  const db = openDatabaseConnection().sqlite;
  expect(db.prepare("SELECT count(*) FROM setting_records WHERE key='sync_group_activity'").pluck().get()).toBe(0);
  expect(db.prepare("SELECT count(*) FROM sync_object_state WHERE object_type='setting' AND object_id LIKE '%sync_group_activity'")
    .pluck().get()).toBe(0);
});

it('keeps only recent rounds and redacts credentials and paths from errors', async () => {
  for (let round = 0; round < 105; round++) await recordDesktopSyncActivity({ ...context, runId: `round-${round}` }, {
    direction: 'local', stage: 'run', kind: 'run_finished', status: 'failed', result: 'failed',
    message: 'token=private-value https://private-host/path /Users/private/library'
  });
  const events = loadDesktopSyncActivity();
  expect(events).toHaveLength(100);
  expect(events[0]?.run_id).toBe('round-104');
  expect(events.at(-1)?.run_id).toBe('round-5');
  expect(JSON.stringify(events)).not.toMatch(/private-value|private-host|\/Users\/private/);
});

it('copies a report with stable device aliases while keeping library identities and device names private', async () => {
  await recordDesktopSyncActivity(context, { direction: 'send', stage: 'sync_pack', kind: 'run_finished',
    status: 'skipped', result: 'waiting', confirmation: 'sent', message: 'Sync data sent' }, {
    peer_device_id: '[1,"group","anchor","/Users/private/library"]', peer_device_name: 'Private device name'
  });
  const report = buildDesktopSyncDiagnostics({
    discovery_error: null, host_platform: 'mac', join_requests: [], sync_enabled: false,
    sync_paused: false, participating: false, removing_device_ids: [],
    server_status: { active_device_count: 0, advertised_urls: ['http://private-host:1234'], last_error: null,
      pending_join_request_count: 0, port: null, state: 'stopped', topology_role: 'observing', topology_status: 'observing' }
  }, 'test-version');
  expect(report.report_text).not.toMatch(/private-host|\/Users\/private|Private device name/);
  expect(JSON.parse(report.report_text).activity[0]).toMatchObject({
    peer_device_id: 'device-1', run_id: 'round-1', confirmation: 'sent', result: 'waiting'
  });
});
