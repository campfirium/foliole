import { specialRootNodeDefinition } from '../database/nodeMutationSpecialRoots.js';

import type { DbPort, DbRow } from './dbPort.js';

interface IncomingParentReference extends DbRow {
  parent_id: string;
  referenced_at: string;
}

export async function ensureSyncPackSpecialRootParents(
  port: DbPort,
  incomingAlias = 'inc'
) {
  const alias = quoteIdentifier(incomingAlias);
  const references = await port.query<IncomingParentReference>(
    `SELECT parent_id, MIN(updated_at) AS referenced_at FROM ${alias}.nodes
     WHERE parent_id IS NOT NULL GROUP BY parent_id`
  );
  for (const reference of references) {
    const definition = specialRootNodeDefinition(reference.parent_id);
    if (!definition) continue;
    await port.run(
      `INSERT INTO main.nodes (
        id, parent_id, kind, title, is_title_manual, hide_title_heading,
        content, created_at, updated_at
      ) VALUES (?, NULL, 'folder', ?, 1, 0, '', ?, ?)
      ON CONFLICT(id) DO NOTHING`,
      [reference.parent_id, definition.title, reference.referenced_at, reference.referenced_at]
    );
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
