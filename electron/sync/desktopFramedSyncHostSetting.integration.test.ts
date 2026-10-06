// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

async function writePrivate(file: string, value: string, scope: string, key: string) {
  const db = new Database(file);
  try {
    const port = createBetterSqliteDbPort(db);
    const hostName = (await readDesktopHostName(port))!;
    const payload = buildCanonicalSettingSyncPayload({ form_factor: 'desktop', host_name: hostName,
      key, platform: 'windows', scope, value_json: value });
    const id = `${scope}:windows:desktop:${hostName}:${key}`;
    await port.transaction((tx) => applySyncObjectInTransaction(tx, { object_type: 'setting', object_id: id,
      content_hash: computeSyncContentHash('setting', payload), deleted_at: null,
      payload_json: JSON.stringify(payload), updated_at: '2026-10-06' },
    { hostName, onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
    return id;
  } finally { db.close(); }
}

function readPrivate(file: string, id: string, key: string) {
  const db = new Database(file, { readonly: true });
  try {
    return { payload: db.prepare('SELECT value_json, content_hash FROM setting_records WHERE key = ?').all(key),
      state: db.prepare("SELECT object_id, content_hash, deleted_at FROM sync_object_state WHERE object_type = 'setting' AND object_id = ?").get(id),
      value: db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) };
  } finally { db.close(); }
}

it.each([{ scope: 'host', key: 'discourse_publish_settings' }, { scope: 'session_resume', key: 'window_state' }])(
  'keeps each peer original $scope setting through shared rounds, restarts and a local tombstone', async ({ scope, key }) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    try {
      const leftId = await writePrivate(fixture.leftSnapshot.databasePath, '{"local":"left"}', scope, key);
      const rightId = await writePrivate(fixture.rightSnapshot.databasePath, '{"local":"right"}', scope, key);
      const before = [readPrivate(fixture.leftSnapshot.databasePath, leftId, key), readPrivate(fixture.rightSnapshot.databasePath, rightId, key)];
      await fixture.left.seed({ content: 'Shared original body', nodeId: 'shared-topic', title: 'Shared' });
      await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      expect([readPrivate(fixture.leftSnapshot.databasePath, leftId, key), readPrivate(fixture.rightSnapshot.databasePath, rightId, key)]).toEqual(before);
      expect(await readFixtureInventory(fixture.right)).toEqual(await readFixtureInventory(fixture.left));
      await fixture.restartLeft();
      const restarted = await fixture.restartRight();
      expect([readPrivate(fixture.leftSnapshot.databasePath, leftId, key), readPrivate(fixture.rightSnapshot.databasePath, rightId, key)]).toEqual(before);
      expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: true });
      const local = new Database(fixture.leftSnapshot.databasePath);
      try {
        const port = createBetterSqliteDbPort(local);
        const hostName = (await readDesktopHostName(port))!;
        await port.transaction((tx) => applySyncObjectInTransaction(tx, { object_type: 'setting', object_id: leftId,
          content_hash: computeSyncContentHash('setting', buildCanonicalSyncTombstone(leftId)),
          deleted_at: '2026-10-07', payload_json: null, updated_at: '2026-10-07' },
        { hostName, onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
        await expect(selectFramedSyncObjectStateFact(port, { globalId: leftId, objectType: 'setting' }, 'private'))
          .rejects.toThrow('framed_sync_object_state_type_invalid');
      } finally { local.close(); }
      expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: true });
      expect(readPrivate(fixture.leftSnapshot.databasePath, leftId, key).value).toBeUndefined();
      expect(readPrivate(fixture.rightSnapshot.databasePath, rightId, key)).toEqual(before[1]);
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await fs.rm(fixture.root, { force: true, recursive: true });
    }
  }, 60_000
);
