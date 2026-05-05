import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackLearningObjectsWithDbPort } from '../../lib/core/sync/syncPackLearningObjectsExecutor.js';

it('applies node reading and review payload records', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      {
        content_hash: 'hash-reading',
        deleted_at: null,
        object_id: 'node-1',
        object_type: 'node_reading',
        payload_json: JSON.stringify({
          interval_duration_ms: 3600,
          interval_growth_factor: 1.5,
          reading_position: 128
        }),
        updated_at: '2026-05-04T03:00:00.000Z'
      },
      {
        content_hash: 'hash-review',
        deleted_at: null,
        object_id: 'node-1',
        object_type: 'node_review',
        payload_json: JSON.stringify({ due: '2026-05-05T00:00:00.000Z', reps: 2 }),
        updated_at: '2026-05-04T03:01:00.000Z'
      }
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackLearningObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(2);
  expect(runs[0]?.sql).toContain('INSERT INTO node_reading');
  expect(runs[0]?.params.slice(0, 3)).toEqual(['node-1', 3600, 1.5]);
  expect(runs[1]?.sql).toContain('INSERT INTO node_reading_device_state');
  expect(runs[1]?.params).toEqual(['node-1', '*', 128, '2026-05-04T03:00:00.000Z']);
  expect(runs[2]?.sql).toContain('INSERT INTO node_review');
  expect(runs[2]?.params.slice(0, 3)).toEqual(['node-1', '2026-05-05T00:00:00.000Z', null]);
});

it('deletes learning payload rows for tombstones', async () => {
  const runs: string[] = [];
  const port = {
    query: vi.fn(async () => [
      tombstone('node_reading'),
      tombstone('node_review')
    ]),
    run: vi.fn(async (sql: string) => {
      runs.push(sql);
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackLearningObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(2);
  expect(runs).toEqual([
    'DELETE FROM node_reading WHERE node_id = ?',
    'DELETE FROM node_reading_device_state WHERE node_id = ?',
    'DELETE FROM node_review WHERE node_id = ?'
  ]);
});

function tombstone(objectType: 'node_reading' | 'node_review') {
  return {
    content_hash: `hash-${objectType}`,
    deleted_at: '2026-05-04T04:00:00.000Z',
    object_id: 'node-1',
    object_type: objectType,
    payload_json: null,
    updated_at: '2026-05-04T04:00:00.000Z'
  };
}
