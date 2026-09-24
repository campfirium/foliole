import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackSettingObjectsWithDbPort } from '../../lib/core/sync/syncPackSyncObjectsExecutor.js';
import { materializeDesktopSettingRecord } from '../database/desktopSettingMaterializer.js';

it('makes an incoming Readwise owner visible to the receiving desktop', async () => {
  const owner = JSON.stringify({ device_identity_key: 'mac-device', epoch: 1, host_name: 'Mac' });
  const updatedAt = '2026-09-24T03:16:00.000Z';
  const record = {
    content_hash: 'owner-hash', deleted_at: null,
    object_id: 'user_space:windows:desktop:*:readwise_active_host', object_type: 'setting',
    payload_json: JSON.stringify({ key: 'readwise_active_host', scope: 'user_space',
      platform: 'windows', form_factor: 'desktop', host_name: '*', value_json: owner }),
    updated_at: updatedAt
  };
  const run = vi.fn(async () => ({ changes: 1, lastInsertRowId: null }));
  const port = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM inc.sync_objects')) return [record];
      if (sql.includes("WHERE key = 'host_name'")) return [{ value: '"Windows"' }];
      if (sql.includes('FROM setting_records')) return [{ value_json: owner, updated_at: updatedAt }];
      return [];
    }),
    run
  } as unknown as DbPort;

  await applySyncPackSettingObjectsWithDbPort(port, {
    hostName: 'Windows', incomingAlias: 'inc', onSettingApplied: materializeDesktopSettingRecord
  });

  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO settings (key, value, updated_at)'),
    ['readwise_active_host', owner, updatedAt]
  );
});
