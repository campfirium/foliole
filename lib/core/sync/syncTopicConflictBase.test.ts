import { expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { loadTopicConflictBase } from './syncTopicConflictBase.js';

function record(version: string): NativeSyncNodeRecord {
  return { version_id: version, body_text: 'Same body', snapshot: {
    content: 'Same body', parent_id: null, deleted_at: null
  } } as NativeSyncNodeRecord;
}

const graph: Record<string, string[]> = { left: ['A', 'B'], right: ['B', 'A'], A: [], B: [] };
function createPort(bodies: [string | null, string | null]) {
  const versions = ['A', 'B'].map((version_id, index) => ({
    version_id, body_text: bodies[index], created_at: '2026-09-30T00:00:00Z',
    snapshot_json: JSON.stringify({ content: bodies[index] })
  }));
  return { query: async (sql: string, args: unknown[]) => {
    if (sql.includes('FROM node_sync_version_parents')) {
      return graph[String(args[0])]!.map((parent_version_id) => ({ parent_version_id }));
    }
    if (sql.includes('SELECT parent_version_id')) return [{ parent_version_id: null }];
    if (sql.includes('SELECT * FROM node_sync_versions')) {
      return versions.filter((version) => args.includes(version.version_id));
    }
    throw new Error(`unexpected_query:${sql}`);
  } } as unknown as DbPort;
}

it.each(['body', 'move', 'delete'] as const)(
  'uses projection rather than guessing incomparable bases for %s divergence', async (change) => {
    const incoming = record('right');
    if (change === 'body') incoming.body_text = 'Other body';
    if (change === 'move') incoming.snapshot.parent_id = 'folder';
    if (change === 'delete') incoming.snapshot.deleted_at = '2026-09-30T00:00:00Z';
    await expect(loadTopicConflictBase(createPort(['Base A', 'Base B']), record('left'), incoming, 'Same body'))
      .resolves.toEqual({ base: null, matchingHeads: false });
  }
);

it('uses the stable earliest candidate when every incomparable base has the same readable body', async () => {
  const result = await loadTopicConflictBase(createPort(['Common body', 'Common body']),
    record('left'), record('right'), 'Same body');
  expect(result.base).toMatchObject({ version_id: 'A', body_text: 'Common body' });
  expect(result.matchingHeads).toBe(false);
});

it('uses projection when any candidate base body is unavailable', async () => {
  await expect(loadTopicConflictBase(createPort(['Common body', null]),
    record('left'), record('right'), 'Same body'))
    .resolves.toEqual({ base: null, matchingHeads: true });
});
