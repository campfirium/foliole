import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackViewStateObjectsWithDbPort } from '../../lib/core/sync/syncPackViewStateObjectsExecutor.js';

it('applies active node and node view state payload records', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      viewStateRow('session_resume:android:phone:device-1:active_node', { active_node_id: 'node-1' }),
      viewStateRow('session_resume:android:phone:device-1:node:node-1', { scroll_top: 256, source: 'user-scroll' })
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackViewStateObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(2);
  expect(runs[0]?.sql).toContain('INSERT INTO workspace_meta');
  expect(runs[0]?.params).toEqual(['node-1', '2026-05-04T07:00:00.000Z']);
  expect(runs[1]?.sql).toContain('INSERT INTO node_view_state');
  expect(runs[1]?.params).toEqual(['node-1', 'device-1', 256, 'sync-apply', '2026-05-04T07:00:00.000Z']);
});

it('deletes view state payload rows for tombstones', async () => {
  const runs: string[] = [];
  const port = {
    query: vi.fn(async () => [{
      ...viewStateRow('session_resume:android:phone:device-1:node:node-1', null),
      deleted_at: '2026-05-04T07:00:00.000Z',
      payload_json: null
    }]),
    run: vi.fn(async (sql: string) => {
      runs.push(sql);
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackViewStateObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(1);
  expect(runs).toEqual(['DELETE FROM node_view_state WHERE node_id = ? AND device_id = ?']);
});

function viewStateRow(objectId: string, payload: Record<string, unknown> | null) {
  return {
    content_hash: `hash-${objectId}`,
    deleted_at: null,
    object_id: objectId,
    object_type: 'view_state',
    payload_json: payload ? JSON.stringify(payload) : null,
    updated_at: '2026-05-04T07:00:00.000Z'
  };
}
