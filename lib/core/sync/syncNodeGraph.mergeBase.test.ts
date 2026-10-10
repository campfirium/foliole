import { expect, it } from 'vitest';

import type { DbPort } from './dbPort.js';
import { loadMergeBase, storedSyncNodeVersionBody } from './syncNodeGraph.js';
import { mergeSyncText } from './syncTextDiff3.js';

function graph(parents: Record<string, string[]>, bodies: Record<string, string>) {
  const query = async (sql: string, args: unknown[] = []) => {
    const id = String(args[0]);
    if (sql.includes('FROM node_sync_version_parents')) {
      return (parents[id] ?? []).map((parent_version_id) => ({ parent_version_id }));
    }
    if (sql.includes('SELECT parent_version_id FROM node_sync_versions')) {
      return [{ parent_version_id: null }];
    }
    if (sql.includes('SELECT * FROM node_sync_versions')) {
      return [{ version_id: id, body_text: bodies[id] ?? null, snapshot_json: '{"content":null}' }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  return { query } as unknown as DbPort;
}

it('uses the newer common ancestor even when an older shortcut is closer', async () => {
  const port = graph({
    A: [], B: ['A'], left: ['B', 'A'], right: ['B', 'A']
  }, { A: 'x=0\ny=0\n', B: 'x=1\ny=0\n' });

  const base = await loadMergeBase(port, 'left', 'right');
  expect(base?.version_id).toBe('B');
  expect(mergeSyncText(base?.body_text ?? '', 'x=0\ny=0\n', 'x=1\ny=1\n'))
    .toEqual({ kind: 'merged', text: 'x=0\ny=1\n' });
});

it('refuses to choose between incomparable best common ancestors', async () => {
  const port = graph({
    A: [], B: [], left: ['A', 'B'], right: ['B', 'A']
  }, { A: 'a', B: 'b' });

  await expect(loadMergeBase(port, 'left', 'right'))
    .rejects.toThrow('sync_node_merge_base_ambiguous');
});

it('keeps a bodyless version available for ancestry without inventing its text', async () => {
  const port = graph({ A: [], B: ['A'], C: ['B'] }, {});
  const base = await loadMergeBase(port, 'C', 'B');

  expect(base?.version_id).toBe('B');
  expect(storedSyncNodeVersionBody(base!)).toBeNull();
});

it('keeps a legacy missing content field missing without inventing empty text', () => {
  expect(storedSyncNodeVersionBody({
    body_text: null,
    content_hash: '',
    created_at: '',
    host_name: '',
    object_id: 'node',
    snapshot_json: '{}',
    version_id: 'legacy'
  })).toBeNull();
});
