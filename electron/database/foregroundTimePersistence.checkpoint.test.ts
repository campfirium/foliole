// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { saveDesktopForegroundSnapshot } from './foregroundTimePersistence.js';
import { loadSyncObjectsFromDriver } from './syncObjectsFromDriver.js';
import { textDevice } from './topicTextState.testSupport.js';

vi.mock('./foregroundTimeOwner.js', () => ({}));
vi.mock('./hostProfile.js', () => ({ loadOrCreateDesktopHostName: () => 'desktop' }));

const sourceId = '805d79bf-5603-4e33-9160-294c4cb3281f';

it('keeps minute checkpoints bounded after loading a long foreground history', () => {
  const device = textDevice();
  try {
    const driver = createBetterSqlite3Driver(device.sqlite);
    const connection = { driver } as Parameters<typeof saveDesktopForegroundSnapshot>[0];
    const history = Array.from({ length: 400 }, (_, index) => ({
      day: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), durationMs: 60_000
    }));
    saveDesktopForegroundSnapshot(connection, { sourceId, buckets: history });
    const query = vi.spyOn(driver, 'queryOne');
    const last = history.at(-1)!;
    const nextDay = '2025-02-04';
    saveDesktopForegroundSnapshot(connection, { sourceId, buckets: [
      { ...last, durationMs: 120_000 }, { day: nextDay, durationMs: 60_000 }
    ] });
    expect(query.mock.calls.filter(([sql]) => !sql.includes('WHERE id = ?')).length).toBeLessThanOrEqual(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('json_group_object'))).toBe(false);
    const payload = assertSyncHash(driver);
    expect(Object.keys(payload.days)).toHaveLength(history.length + 1);
    expect(payload.days).toMatchObject({ [last.day]: 120_000, [nextDay]: 60_000 });
  } finally {
    device.sqlite.close();
  }
});

it('keeps the canonical hash after a peer raises an older day or the local clock moves backward', async () => {
  const local = textDevice();
  const peer = textDevice();
  const day = '2025-02-01';
  const recent = '2025-02-02';
  const localDriver = createBetterSqlite3Driver(local.sqlite);
  const peerDriver = createBetterSqlite3Driver(peer.sqlite);
  const save = (driver: typeof localDriver, days: Record<string, number>) => {
    const connection = driver === localDriver ? localConnection : peerConnection;
    saveDesktopForegroundSnapshot(connection, { sourceId,
      buckets: Object.entries(days).map(([day, durationMs]) => ({ day, durationMs })) });
  };
  const localConnection = { driver: localDriver } as Parameters<typeof saveDesktopForegroundSnapshot>[0];
  const peerConnection = { driver: peerDriver } as Parameters<typeof saveDesktopForegroundSnapshot>[0];
  try {
    save(localDriver, { [day]: 30_000, [recent]: 60_000 });
    await applySyncObjectsWithDbPort(peer.db, loadSyncObjectsFromDriver(localDriver, [sourceId], ['foreground_source']));
    save(peerDriver, { [day]: 90_000 });
    await applySyncObjectsWithDbPort(local.db, loadSyncObjectsFromDriver(peerDriver, [sourceId], ['foreground_source']));
    save(localDriver, { [recent]: 120_000 });
    expect(assertSyncHash(localDriver).days).toEqual({ [day]: 90_000, [recent]: 120_000 });
    save(localDriver, { [day]: 150_000 });
    expect(assertSyncHash(localDriver).days).toEqual({ [day]: 150_000, [recent]: 120_000 });
  } finally {
    local.sqlite.close();
    peer.sqlite.close();
  }
});

function assertSyncHash(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  const [record] = loadSyncObjectsFromDriver(driver, [sourceId], ['foreground_source']);
  const payload = JSON.parse(record!.payload_json!) as { days: Record<string, number>; source_id: string };
  expect(record!.content_hash).toBe(computeSyncContentHash('foreground_source', payload));
  return payload;
}
