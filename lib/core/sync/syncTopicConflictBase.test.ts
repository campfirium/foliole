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
const port = { query: async (sql: string, args: unknown[]) => {
  if (sql.includes('FROM node_sync_version_parents')) {
    return graph[String(args[0])]!.map((parent_version_id) => ({ parent_version_id }));
  }
  if (sql.includes('SELECT parent_version_id')) return [{ parent_version_id: null }];
  throw new Error(`unexpected_query:${sql}`);
} } as unknown as DbPort;

it.each(['body', 'move', 'delete', 'unavailable'] as const)(
  'keeps incomparable bases unresolved when the heads disagree on %s', async (change) => {
    const incoming = record('right');
    if (change === 'body') incoming.body_text = 'Other body';
    if (change === 'move') incoming.snapshot.parent_id = 'folder';
    if (change === 'delete') incoming.snapshot.deleted_at = '2026-09-30T00:00:00Z';
    if (change === 'unavailable') {
      incoming.body_text = null;
      // Wire snapshots use null to distinguish collected content from an empty body.
      Object.assign(incoming.snapshot, { content: null });
    }
    await expect(loadTopicConflictBase(port, record('left'), incoming, 'Same body'))
      .rejects.toThrow('sync_node_merge_base_ambiguous');
  }
);
