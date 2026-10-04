// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { readReadySyncIdentityInventory } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import { readSyncIdentityNodeFactDataRoot } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createLargeFactRestoreFixture } from './syncIdentityFactRestore.testSupport.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

it('restores a complete bounded large history into an empty receiving library in one writer transaction', async () => {
  const fixture = await createLargeFactRestoreFixture();
  try {
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM nodes').get()).toEqual({ count: 0 });
    expect(fixture.packs.length).toBeGreaterThan(fixture.set.object_count);
    await expect(fixture.apply()).resolves.toMatchObject({ applied: true });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 141 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 4097 });
    const port = createBetterSqliteDbPort(fixture.receiver);
    expect(await readReadySyncIdentityInventory(port)).toEqual(fixture.set.inventory);
    expect(await readSyncIdentityNodeFactDataRoot(port)).toBe(fixture.set.fact_data_root);
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_fact_staging').get()).toEqual({ count: 0 });
    await expect(fixture.apply()).resolves.toMatchObject({ applied: false });
  } finally { fixture.close(); }
}, 60_000);

it('keeps the previous library and pending restore intact when the last verified page is damaged', async () => {
  const fixture = await createLargeFactRestoreFixture();
  try {
    fixture.receiver.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('target-only', 'topic', 'Previous library', 'Original content', 'now', 'now')`);
    const previousNodes = fixture.receiver.prepare('SELECT * FROM nodes ORDER BY id').all();
    const previousSettings = fixture.receiver.prepare('SELECT * FROM setting_records ORDER BY key').all();
    await expect(fixture.apply(true)).rejects.toThrow(/sync_identity_pack_/u);
    expect(fixture.receiver.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(previousNodes);
    expect(fixture.receiver.prepare('SELECT * FROM setting_records ORDER BY key').all()).toEqual(previousSettings);
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 0 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get()).toEqual({ count: 0 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_fact_staging').get()).toEqual({ count: 0 });
    expect(fixture.receiver.prepare('SELECT applied_at FROM sync_group_restore_events').get()).toEqual({ applied_at: null });
  } finally { fixture.close(); }
}, 60_000);
