import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  applySyncPackSettingObjectsWithDbPort,
  isConsumableSyncPackSyncObject,
  loadSyncPackSyncObjectsWithDbPort
} from '../../lib/core/sync/syncPackSyncObjectsExecutor.js';

it('loads applyable sync object records from the attached pack', async () => {
  const port = {
    query: vi.fn(async () => [
      syncObjectRow('setting', 'device:android:phone:*:theme'),
      syncObjectRow('view_state', 'session_resume:android:phone:device-1:node:node-1'),
      syncObjectRow('view_state', 'session_resume:android:phone:other-device:node:node-2')
    ])
  } as unknown as DbPort;

  await expect(loadSyncPackSyncObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toEqual([
    syncObjectRow('setting', 'device:android:phone:*:theme'),
    syncObjectRow('view_state', 'session_resume:android:phone:device-1:node:node-1')
  ]);
  expect(port.query).toHaveBeenCalledWith(expect.stringContaining('FROM incoming.sync_objects incoming'));
  expect(port.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY updated_at ASC, object_type ASC, object_id ASC'));
});

it('filters view state records to the current mobile device', () => {
  expect(isConsumableSyncPackSyncObject({
    object_id: 'session_resume:android:phone:device-1:node:node-1',
    object_type: 'view_state'
  }, 'device-1')).toBe(true);
  expect(isConsumableSyncPackSyncObject({
    object_id: 'session_resume:android:phone:device-2:node:node-1',
    object_type: 'view_state'
  }, 'device-1')).toBe(false);
  expect(isConsumableSyncPackSyncObject({
    object_id: 'device:android:phone:*:theme',
    object_type: 'setting'
  }, 'device-1')).toBe(true);
});

it('applies setting payload records from sync objects', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      {
        content_hash: 'hash-setting',
        deleted_at: null,
        object_id: 'device:android:phone:*:theme',
        object_type: 'setting',
        payload_json: JSON.stringify({ key: 'theme', scope: 'device', value_json: '{"mode":"dark"}' }),
        updated_at: '2026-05-04T02:00:00.000Z'
      }
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackSettingObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(1);
  expect(runs).toEqual([{
    params: [
      'device',
      'android',
      'phone',
      '*',
      'theme',
      '{"mode":"dark"}',
      'hash-setting',
      '2026-05-04T02:00:00.000Z',
      null
    ],
    sql: expect.stringContaining('INSERT INTO setting_records')
  }]);
});

function syncObjectRow(objectType: string, objectId: string) {
  return {
    content_hash: `hash-${objectId}`,
    deleted_at: null,
    object_id: objectId,
    object_type: objectType,
    payload_json: '{}',
    updated_at: '2026-05-04T02:00:00.000Z'
  };
}
