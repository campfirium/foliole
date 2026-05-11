import type { NativeReadwiseCleanupEntry } from '../../lib/platform/nativeImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';

interface ReadwiseBookNodeRow {
  created_at: string;
  id: string;
  title: string;
  updated_at: string;
}

function hasLearningState(nodeId: string) {
  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT 1 AS found FROM node_review WHERE node_id = ?
       UNION ALL
       SELECT 1 AS found FROM node_reading WHERE node_id = ?
       LIMIT 1`
    )
    .get(nodeId, nodeId) as { found: number } | undefined;
  return Boolean(row);
}

function resolveReadwiseBookCleanupAction(row: ReadwiseBookNodeRow): Pick<NativeReadwiseCleanupEntry, 'action' | 'reason'> {
  if (hasLearningState(row.id)) {
    return { action: 'keep', reason: 'Readwise Books placeholder has reading or review state.' };
  }
  if (row.updated_at !== row.created_at) {
    return { action: 'keep', reason: 'Readwise Books placeholder was changed.' };
  }
  return { action: 'delete', reason: 'Readwise Books placeholder is unchanged.' };
}

export function readReadwiseBookCleanupEntries(): NativeReadwiseCleanupEntry[] {
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT id, title, created_at, updated_at
       FROM nodes
       WHERE id LIKE 'node-readwise-book-%'
         AND deleted_at IS NULL
       ORDER BY title COLLATE NOCASE ASC`
    )
    .all() as ReadwiseBookNodeRow[];
  return rows.map((row) => ({
    ...resolveReadwiseBookCleanupAction(row),
    node_id: row.id,
    rule_id: 'readwise-books',
    source_path: row.title,
    title: row.title
  }));
}
