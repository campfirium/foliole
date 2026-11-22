// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { FOLDER_LIST_SORT_MEMORY_SETTING_KEY } from '../../lib/platform/folderListSortMemoryContract.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { writeJsonSetting } from '../database/settingsStore.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const desktopChoice = { sortByListId: { inbox: { direction: 'desc', key: 'dateImported' } }, version: 1 };
const phoneChoice = { sortByListId: { inbox: { direction: 'asc', key: 'name' } }, version: 1 };

it('brings one desktop\'s folder sort choices to another desktop without taking the phones\' choices', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    const source = new Database(fixture.leftSnapshot.databasePath);
    try {
      const driver = createBetterSqlite3Driver(source);
      driver.transaction((tx) => writeJsonSetting(tx, FOLDER_LIST_SORT_MEMORY_SETTING_KEY, desktopChoice, '2026-11-22T10:00:00.000Z'));
      const phonePayload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: '*',
        key: FOLDER_LIST_SORT_MEMORY_SETTING_KEY, platform: 'android', scope: 'user_space', value_json: JSON.stringify(phoneChoice) });
      await applySyncObjectInTransaction(createBetterSqliteDbPort(source), { object_type: 'setting',
        object_id: `user_space:android:phone:*:${FOLDER_LIST_SORT_MEMORY_SETTING_KEY}`,
        content_hash: computeSyncContentHash('setting', phonePayload), deleted_at: null,
        payload_json: JSON.stringify(phonePayload), updated_at: '2026-11-22T10:05:00.000Z' });
    } finally { source.close(); }

    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

    const target = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(target.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(FOLDER_LIST_SORT_MEMORY_SETTING_KEY))
        .toBe(JSON.stringify(desktopChoice));
      expect(target.prepare(`SELECT platform, form_factor, value_json FROM setting_records
        WHERE key = ? AND scope = 'user_space' ORDER BY form_factor`).all(FOLDER_LIST_SORT_MEMORY_SETTING_KEY)).toEqual([
        { form_factor: 'desktop', platform: 'windows', value_json: JSON.stringify(desktopChoice) },
        { form_factor: 'phone', platform: 'android', value_json: JSON.stringify(phoneChoice) }
      ]);
    } finally { target.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
