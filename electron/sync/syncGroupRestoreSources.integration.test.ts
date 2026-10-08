// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { OVERWRITE_SOURCE_SETTING_KEYS } from '../../lib/core/database/settingDataPolicy.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';

import { restoreSourcesFixture } from './syncGroupRestoreSources.testSupport.js';

const fixtures: ReturnType<typeof restoreSourcesFixture>[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.close(); });
function fixture() {
  const host = restoreSourcesFixture();
  fixtures.push(host);
  return host;
}

it('clears local and remote source configuration and imports while preserving preferences and disk files', async () => {
  const host = fixture(), preferences = host.preferences();
  for (const table of ['desktop_sources', 'watched_folder_bindings', 'external_search_folders', 'import_sources']) {
    expect(host.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: table === 'desktop_sources' || table === 'import_sources' ? 6 : 2 });
  }
  const removed = await host.port().transaction((tx) => clearWorkgroupSyncDataForRestore(tx, 'overwrite-1'));
  expect(removed.sort()).toEqual(['local-external', 'local-readwise', 'local-watched',
    'remote-external', 'remote-readwise', 'remote-watched'].map((id) => `old-${id}`).sort());
  assertCleared(host, preferences);
  host.reopen();
  assertCleared(host, preferences);
});

function assertCleared(host: ReturnType<typeof restoreSourcesFixture>, preferences: ReturnType<typeof host.preferences>) {
  for (const table of ['desktop_sources', 'watched_folder_bindings', 'external_search_folders', 'import_sources', 'sync_object_state']) {
    expect(host.sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
  }
  for (const key of OVERWRITE_SOURCE_SETTING_KEYS) {
    expect(host.sqlite.prepare('SELECT * FROM settings WHERE key = ?').all(key)).toEqual([]);
    expect(host.sqlite.prepare('SELECT * FROM setting_records WHERE key = ?').all(key)).toEqual([]);
  }
  expect(host.preferences()).toEqual(preferences);
  expect(host.originalFileBytes()).toEqual(host.originalBytes);
  expect(host.sqlite.prepare("SELECT id FROM nodes WHERE id LIKE 'old-%'").all()).toEqual([]);
  expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_objects'").get()).toBeUndefined();
}

it('rolls back all source and business changes when a late node deletion rejects the clear transaction', async () => {
  const host = fixture(), before = host.rows();
  host.sqlite.exec(`CREATE TRIGGER reject_restore_node_delete BEFORE DELETE ON nodes
    WHEN OLD.id LIKE 'old-%' BEGIN SELECT RAISE(ABORT, 'restore_node_delete_rejected'); END`);
  await expect(host.port().transaction((tx) => clearWorkgroupSyncDataForRestore(tx, 'overwrite-2')))
    .rejects.toThrow('restore_node_delete_rejected');
  expect(host.rows()).toEqual(before);
  expect(host.originalFileBytes()).toEqual(host.originalBytes);
  host.reopen();
  expect(host.rows()).toEqual(before);
  expect(host.originalFileBytes()).toEqual(host.originalBytes);
});
