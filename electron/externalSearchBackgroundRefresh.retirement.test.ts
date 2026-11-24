// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../lib/core/database/syncState.js';
import { applySyncObjectsWithDbPort } from '../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqlite3Driver } from './database/betterSqlite3Driver.js';
import { textDevice } from './database/topicTextState.testSupport.js';

const fixture = vi.hoisted(() => ({ open: vi.fn(), submit: vi.fn() }));
vi.mock('electron', () => ({ app: { on: vi.fn(), removeListener: vi.fn() } }));
vi.mock('./database/connection.js', () => ({ openDatabaseConnection: fixture.open,
  runWithDatabaseConnectionOwner: (run: () => unknown) => run() }));
vi.mock('./database/desktopDatabaseWriteQueue.js', () => ({
  runDesktopDatabaseWrite: (_priority: string, run: () => unknown) => run()
}));
vi.mock('./database/externalSearchCache.js', () => ({ refreshExternalSearchIndexes: vi.fn() }));
vi.mock('./desktopOperations.js', () => ({ submitDesktopOperation: fixture.submit }));
vi.mock('./managedPathSafety.js', () => ({ loadManagedPathCandidates: () => [] }));

const bootAt = '2026-10-20T00:00:00.000Z';

it('retires departed mirrors on an otherwise idle desktop at startup and later in the same session', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(bootAt));
  const device = textDevice();
  const driver = createBetterSqlite3Driver(device.sqlite);
  fixture.open.mockReturnValue({ driver, sqlite: device.sqlite });
  const runtime = await import('./externalSearchBackgroundRefreshRuntime.js');
  try {
    seedGroup(device, 'local-group');
    seedGroup(device, 'other-group');
    driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
      VALUES ('local-group', 'local', 'anchor', '/local', 'Local', 'darwin', 'active', ?, ?)`, [bootAt, bootAt]);
    driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'local-group', 'local', 'active', ?)", [bootAt]);
    await seedMirror(device, 'local-group', 'expired', '2026-10-13T00:00:00.000Z');
    await seedMirror(device, 'local-group', 'grace', '2026-10-13T00:01:00.000Z');
    await seedMirror(device, 'other-group', 'other', '2026-10-10T00:00:00.000Z');
    expect(mirrorIds(device)).toEqual(['expired', 'grace', 'other']);

    runtime.startExternalSearchBackgroundRefresh();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mirrorIds(device)).toEqual(['grace', 'other']);
    expect(driver.queryAll("SELECT object_id FROM sync_object_state WHERE object_id = 'expired'")).toEqual([]);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(mirrorIds(device)).toEqual(['other']);
    expect(driver.queryAll("SELECT object_id FROM sync_object_state WHERE object_id = 'grace'")).toEqual([]);
    expect(fixture.submit).not.toHaveBeenCalled();
  } finally {
    runtime.stopExternalSearchBackgroundRefresh();
    vi.useRealTimers();
    device.sqlite.close();
  }
});

type Device = ReturnType<typeof textDevice>;

function seedGroup(device: Device, groupId: string) {
  device.sqlite.prepare('INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?)').run(groupId, groupId, 'key', bootAt, bootAt);
}

async function seedMirror(device: Device, group: string, id: string, leftAt: string) {
  const owner = `owner-${id}`;
  const payload = { id, source_ref: `external:${id}`, host_name: id, host_platform: 'darwin',
    attachment_mode: 'document_relative', excluded_dirs_json: '[]', owner_device_identity_key: owner };
  await applySyncObjectsWithDbPort(device.db, [{ object_type: 'external_folder', object_id: id,
    content_hash: computeSyncContentHash('external_folder', payload), payload_json: JSON.stringify(payload),
    updated_at: '2026-10-01T00:00:00.000Z', deleted_at: null }]);
  device.sqlite.prepare(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
    canonical_library_path, device_name, platform, state, joined_at, left_at, updated_at)
    VALUES (?, ?, 'anchor', '/provider', ?, 'darwin', 'left', ?, ?, ?)`).run(group, owner, id, leftAt, leftAt, leftAt);
}

function mirrorIds(device: Device) {
  return device.sqlite.prepare('SELECT id FROM external_search_folders ORDER BY id').pluck().all();
}
