import { expect, it, vi } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { reconcileResolutionAlternatives, storeAlternative } from './syncNodeResolution.js';

function alternative(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    body_text: 'Losing body',
    content_hash: 'hash-1',
    host_name: 'Maci',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: null,
    parent_version_ids: [],
    snapshot: { content: 'Losing body' } as NativeSyncNodeRecord['snapshot'],
    updated_at: '2026-08-15T05:00:00.000Z',
    version_created_at: '2026-08-15T05:00:00.000Z',
    version_id: 'Maci#1'
  };
}

it('does not redirty an existing deterministic conflict alternative', async () => {
  let insertCount = 0;
  const run = vi.fn(async (sql: string) => ({
    changes: sql.includes('INSERT INTO node_text_alternatives')
      ? (insertCount++ === 0 ? 1 : 0) : 0
  }));
  const port = { query: vi.fn(async () => []), run } as unknown as DbPort;

  await storeAlternative(port, alternative(), '2026-08-15T05:00:00.001Z');
  await storeAlternative(port, alternative(), '2026-08-15T05:00:00.001Z');

  expect(run.mock.calls.filter(([sql]) => String(sql).includes(
    'INSERT INTO sync_object_state'
  ))).toHaveLength(1);
});

it('tombstones existing alternatives instead of publishing one for a deleted resolution', async () => {
  const calls: Array<{ params: readonly unknown[] | undefined; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [{ alternative_id: 'alternative#existing' }]),
    run: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      calls.push({ params, sql });
      return { changes: 1 };
    })
  } as unknown as DbPort;
  const resolution = alternative();
  resolution.snapshot.deleted_at = '2026-08-15T05:00:00.001Z';
  resolution.version_created_at = '2026-08-15T05:00:00.002Z';

  await reconcileResolutionAlternatives(port, resolution, alternative());

  expect(calls.some(({ sql }) => sql.startsWith('DELETE FROM node_text_alternatives'))).toBe(true);
  expect(calls.some(({ params, sql }) => sql.includes("VALUES ('node_text_alternative'")
    && params?.[0] === 'alternative#existing')).toBe(true);
  expect(calls.some(({ sql }) => sql.includes('INSERT INTO node_text_alternatives'))).toBe(false);
});
