// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it.each([
  { platform: 'windows', formFactor: 'desktop', failProjection: false },
  { platform: 'windows', formFactor: 'desktop', failProjection: true },
  { platform: 'android', formFactor: 'phone', failProjection: false }
])('applies the global $platform setting with projection failure=$failProjection', async ({ platform, formFactor, failProjection }) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const payload = buildCanonicalSettingSyncPayload({ form_factor: formFactor, host_name: '*',
    key: 'review_scheduler_settings', platform, scope: 'user_space', value_json: '{"dailyLimit":20}' });
  try {
    const source = new Database(fixture.leftSnapshot.databasePath);
    try {
      await applySyncObjectInTransaction(createBetterSqliteDbPort(source), { object_type: 'setting',
        object_id: `user_space:${platform}:${formFactor}:*:review_scheduler_settings`, content_hash: computeSyncContentHash('setting', payload),
        deleted_at: null, payload_json: JSON.stringify(payload), updated_at: '2026-10-06' });
    } finally { source.close(); }
    if (failProjection) {
      const target = new Database(fixture.rightSnapshot.databasePath);
      try { target.exec(`CREATE TRIGGER reject_setting_projection BEFORE INSERT ON settings
        WHEN NEW.key = 'review_scheduler_settings' BEGIN SELECT RAISE(ABORT, 'projection_write_rejected'); END`); }
      finally { target.close(); }
      await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).rejects.toThrow('projection_write_rejected');
      const failed = new Database(fixture.rightSnapshot.databasePath);
      try {
        expect(failed.prepare("SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings'").get()).toBeUndefined();
        expect(failed.prepare("SELECT object_id FROM sync_object_state WHERE object_type = 'setting' AND object_id = 'user_space:windows:desktop:*:review_scheduler_settings'").all()).toEqual([]);
        expect(failed.prepare("SELECT COUNT(*) FROM framed_sync_receipts WHERE transfer_id IN (SELECT transfer_id FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply')").pluck().get()).toBe(0);
        failed.exec('DROP TRIGGER reject_setting_projection');
      } finally { failed.close(); }
    }
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const target = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(target.prepare("SELECT value FROM settings WHERE key = 'review_scheduler_settings'").pluck().get())
        .toBe(platform === 'windows' ? payload.value_json : undefined);
      expect(target.prepare("SELECT value_json FROM setting_records WHERE key = 'review_scheduler_settings' AND scope = 'user_space'")
        .pluck().get()).toBe(payload.value_json);
    } finally { target.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
