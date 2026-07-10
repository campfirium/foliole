import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

import { projectAgentMaterialIdentity, type AgentMaterialSpecialKind } from './agentControlMaterialIdentity.js';
import type { AgentMaterialParentSummary } from './agentControlMaterials.js';

interface MaterialListParentRow extends DatabaseRow {
  anchor_link: string | null;
  deleted_at: string | null;
  depth: number;
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

export interface AgentMaterialListParentSummary {
  deleted: boolean;
  id: string;
  kind: string;
  parent_titles: string[];
  parents: AgentMaterialParentSummary[];
  special_kind?: AgentMaterialSpecialKind;
  title: string;
  updated_at: string;
}

export function readAgentControlMaterialListParent(parentId: string | null): AgentMaterialListParentSummary | null {
  if (parentId === null) return null;
  const rows = openDatabaseConnection().driver.queryAll<MaterialListParentRow>(
    `WITH RECURSIVE ancestors AS (
       SELECT n.id, n.parent_id, n.kind, n.title, n.anchor_link,
              n.deleted_at, n.updated_at, 0 AS depth
       FROM nodes n
       WHERE n.id = ?
       UNION ALL
       SELECT parent.id, parent.parent_id, parent.kind, parent.title, parent.anchor_link,
              parent.deleted_at, parent.updated_at, ancestors.depth + 1
       FROM nodes parent
       JOIN ancestors ON parent.id = ancestors.parent_id
     )
     SELECT * FROM ancestors
     ORDER BY depth ASC`,
    [parentId]
  );
  const parent = rows[0];
  if (!parent) return null;
  return {
    deleted: rows.some((row) => row.deleted_at !== null),
    id: parent.id,
    kind: parent.kind,
    parent_titles: rows.slice(1).reverse().map((row) => row.title),
    parents: rows.slice(1).reverse().map((row) => ({ id: row.id, title: row.title })),
    ...projectAgentMaterialIdentity(parent),
    title: parent.title,
    updated_at: parent.updated_at
  };
}
