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
  await ensureSyncSpecialRootNodes(port, references.map((reference) => ({
    nodeId: reference.parent_id, referencedAt: reference.referenced_at
  })));
}

export async function ensureSyncSpecialRootNodes(port: DbPort,
  references: readonly { nodeId: string; referencedAt: string }[]) {
  for (const reference of references) {
    const definition = specialRootNodeDefinition(reference.nodeId);
    if (!definition) continue;
    await port.run(
      `INSERT INTO main.nodes (
        id, parent_id, kind, title, is_title_manual, hide_title_heading,
        content, created_at, updated_at
      ) VALUES (?, NULL, 'folder', ?, 1, 0, '', ?, ?)
      ON CONFLICT(id) DO NOTHING`,
      [reference.nodeId, definition.title, reference.referencedAt, reference.referencedAt]
    );
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
