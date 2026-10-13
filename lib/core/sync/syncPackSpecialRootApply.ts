import type { DbPort, DbRow } from './dbPort.js';
import { ensureSyncSpecialRootNodes } from './syncSpecialRootNodes.js';


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

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
