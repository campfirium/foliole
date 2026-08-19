import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  applySyncPackMetadataObjectsWithDbPort,
  applySyncPackSettingObjectsWithDbPort,
  isConsumableSyncPackSyncObject,
  loadSyncPackSyncObjectsWithDbPort
} from '../../lib/core/sync/syncPackSyncObjectsExecutor.js';

it('loads applyable sync object records from the attached pack', async () => {
  const port = {
    query: vi.fn(async () => [
      syncObjectRow('setting', 'host:android:phone:Android test host:theme'),
      syncObjectRow('view_state', 'session_resume:android:phone:Android test host:node:node-1'),
      syncObjectRow('view_state', 'session_resume:android:phone:Other host:node:node-2')
    ])
  } as unknown as DbPort;

  await expect(loadSyncPackSyncObjectsWithDbPort(port, {
    hostName: 'Android test host',
    incomingAlias: 'incoming'
  })).resolves.toEqual([
    syncObjectRow('setting', 'host:android:phone:Android test host:theme'),
    syncObjectRow('view_state', 'session_resume:android:phone:Android test host:node:node-1')
  ]);
  expect(port.query).toHaveBeenCalledWith(expect.stringContaining('FROM incoming.sync_objects incoming'));
  expect(port.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY updated_at ASC, object_type ASC, object_id ASC'));
});

it('filters view state records to the current Host', () => {
  expect(isConsumableSyncPackSyncObject({
    object_id: 'session_resume:android:phone:Android test host:node:node-1',
    object_type: 'view_state'
  }, 'Android test host')).toBe(true);
  expect(isConsumableSyncPackSyncObject({
    object_id: 'session_resume:android:phone:Other host:node:node-1',
    object_type: 'view_state'
  }, 'Android test host')).toBe(false);
  expect(isConsumableSyncPackSyncObject({
    object_id: 'host:android:phone:Android test host:theme',
    object_type: 'setting'
  }, 'Android test host')).toBe(true);
});

it('applies setting payload records from sync objects', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      {
        content_hash: 'hash-setting',
        deleted_at: null,
        object_id: 'host:android:phone:Android test host:theme',
        object_type: 'setting',
        payload_json: JSON.stringify({ host_name: 'Android test host', key: 'theme', scope: 'host', value_json: '{"mode":"dark"}' }),
        updated_at: '2026-05-04T02:00:00.000Z'
      }
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackSettingObjectsWithDbPort(port, {
    hostName: 'Android test host',
    incomingAlias: 'incoming'
  })).resolves.toBe(1);
  expect(runs).toEqual([{
    params: [
      'host',
      'android',
      'phone',
      'Android test host',
      'theme',
      '{"mode":"dark"}',
      'hash-setting',
      '2026-05-04T02:00:00.000Z',
      null
    ],
    sql: expect.stringContaining('INSERT INTO setting_records')
  }]);
});

it('applies import source and external folder payload records', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      {
        content_hash: 'hash-source',
        deleted_at: null,
        object_id: 'source-1',
        object_type: 'import_source',
        payload_json: JSON.stringify({ provider: 'readwise', source_name: 'Library' }),
        updated_at: '2026-05-04T02:00:00.000Z'
      },
      {
        content_hash: 'hash-folder',
        deleted_at: null,
        object_id: 'folder-1',
        object_type: 'external_folder',
        payload_json: JSON.stringify({ folder_path: '/library', document_count: 3 }),
        updated_at: '2026-05-04T02:01:00.000Z'
      }
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackMetadataObjectsWithDbPort(port, {
    incomingAlias: 'incoming'
  })).resolves.toBe(2);
  expect(runs[0]?.sql).toContain('INSERT INTO import_sources');
  expect(runs[0]?.params.slice(0, 4)).toEqual(['source-1', 'readwise', 'unknown', 'Library']);
  expect(runs[1]?.sql).toContain('INSERT INTO desktop_sources');
  expect(runs[1]?.sql).toContain('owner_installation_id = NULL');
  expect(runs[1]?.params.slice(0, 2)).toEqual(['external:folder-1', 'folder-1']);
  expect(runs[2]?.sql).toContain('INSERT INTO external_search_folders');
  expect(runs[2]?.params.slice(0, 3)).toEqual(['folder-1', '/library', 'document_relative_first_then_fixed_root']);
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
