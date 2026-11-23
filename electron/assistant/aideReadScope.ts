import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

/**
 * Which materials a reply's read tools may open by id.
 * The materials linked to the conversation are always in reach. "Get base topic details" opens the whole
 * Base Topic each linked material belongs to (the Base Topic and every material derived from it), and
 * "Find in the library" opens whatever a library search can find, which is any material.
 */
export interface AideReadScope {
  anyMaterial: boolean;
  baseFamily: boolean;
  linkedIds: ReadonlySet<string>;
}

// Tools that read one material named by its id argument.
export const AIDE_SCOPED_READ_TOOLS: ReadonlySet<string> = new Set([
  'read_material', 'read_pdf_page', 'search_in_material', 'trace_source'
]);

export interface AideMaterialLineage {
  baseTopicId: string | null;
  /** The material itself, then its parents up to the root. */
  chainIds: string[];
}

export type AideLineageReader = (id: string) => AideMaterialLineage | null;

interface LineageRow extends DatabaseRow {
  anchor_link: string | null;
  id: string;
  kind: string;
}

interface FamilyRow extends DatabaseRow {
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
}

const FAMILY_LIMIT = 200;

// The materials linked to the conversation are the ones its read tools may always open.
export function readAideLinkedMaterialIds(context: { conversationMaterials?: ReadonlyArray<{ nodeId: string }> | undefined } | undefined) {
  return context?.conversationMaterials?.map((material) => material.nodeId) ?? [];
}

export async function isAideMaterialInReach(scope: AideReadScope, id: string, readLineage: AideLineageReader = readAideMaterialLineage) {
  if (scope.linkedIds.has(id) || scope.anyMaterial) return true;
  if (!scope.baseFamily || !scope.linkedIds.size) return false;
  return runWithDatabaseConnectionOwner(() => {
    const chain = readLineage(id)?.chainIds ?? [];
    return [...scope.linkedIds].some((linkedId) => {
      const baseTopicId = readLineage(linkedId)?.baseTopicId;
      return Boolean(baseTopicId && chain.includes(baseTopicId));
    });
  });
}

// A derived material's Base Topic is where its chain of excerpt anchors ends.
export function readAideMaterialLineage(id: string): AideMaterialLineage | null {
  const rows = openDatabaseConnection().driver.queryAll<LineageRow>(
    `WITH RECURSIVE chain(id, depth) AS (
       SELECT id, 0 FROM nodes WHERE id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT n.parent_id, chain.depth + 1 FROM nodes n JOIN chain ON n.id = chain.id
       WHERE n.parent_id IS NOT NULL AND chain.depth < 64
     )
     SELECT n.id, n.kind, n.anchor_link FROM chain JOIN nodes n ON n.id = chain.id ORDER BY chain.depth ASC`,
    [id]
  );
  if (!rows.length) return null;
  let index = 0;
  while (hasAnchor(rows[index]) && rows[index + 1]) index += 1;
  const source = rows[index];
  return {
    baseTopicId: source?.kind === 'topic' ? source.id : null,
    chainIds: rows.map((row) => row.id)
  };
}

// The Base Topic's own material list: everything derived from it, nearest first.
export function listAideBaseTopicFamily(baseTopicId: string) {
  const rows = openDatabaseConnection().driver.queryAll<FamilyRow>(
    `WITH RECURSIVE family(id, depth) AS (
       SELECT id, 0 FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT n.id, family.depth + 1 FROM nodes n JOIN family ON n.parent_id = family.id
       WHERE n.deleted_at IS NULL AND family.depth < 64
     )
     SELECT n.id, n.parent_id, n.kind, n.title FROM family JOIN nodes n ON n.id = family.id
     ORDER BY family.depth, COALESCE(n.position, 999999), n.created_at, n.id
     LIMIT ${FAMILY_LIMIT + 1}`,
    [baseTopicId]
  );
  return {
    materials: rows.slice(0, FAMILY_LIMIT).map((row) => ({ id: row.id, kind: row.kind, parent_id: row.parent_id, title: row.title })),
    truncated: rows.length > FAMILY_LIMIT
  };
}

function hasAnchor(row: LineageRow | undefined) {
  if (!row?.anchor_link) return false;
  try {
    return parseStoredAnchorLink(row.anchor_link) !== null;
  } catch {
    return false;
  }
}
