import { randomUUID } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { SUPER_MEMO_IMPORT_FOLDER_TITLE } from '../../lib/core/import/superMemoImportParents.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

const rootKey = 'supermemo-import-root';

export function ensureSuperMemoImportRoot(driver: DatabaseDriver, now: string) {
  const root = driver.queryOne<{ id: string }>(
    `SELECT n.id FROM workspace_meta m JOIN nodes n ON n.id = m.value
     WHERE m.key = ? AND n.kind = 'folder' AND n.parent_id IS NULL AND n.deleted_at IS NULL
       AND n.title = ? AND n.virtual_filter IS NULL`, [rootKey, SUPER_MEMO_IMPORT_FOLDER_TITLE]);
  if (root) return root.id;
  const nodeId = randomUUID();
  upsertNodeSnapshot({ nodeId, kind: 'folder', parentNodeId: null, position: null,
    title: SUPER_MEMO_IMPORT_FOLDER_TITLE, isTitleManual: true, content: '', reveal: null, anchorLink: null,
    createdAt: now, updatedAt: now });
  driver.execute(`INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [rootKey, nodeId, now]);
  return nodeId;
}
