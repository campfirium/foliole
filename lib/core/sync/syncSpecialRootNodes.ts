import { specialRootNodeDefinition } from '../database/nodeMutationSpecialRoots.js';

import type { DbPort } from './dbPort.js';

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
