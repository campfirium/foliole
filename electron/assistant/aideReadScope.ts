import {
  buildAideReachContext,
  isAideMaterialReachable,
  type AideCollection,
  type AideMaterialPlacement,
  type AideReachContext,
  type AideReadScopes
} from '../../lib/core/assistant/aideReadReach.js';
import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

/**
 * Where a reply's read tools may look, from the read switches: the current materials (linked to the conversation
 * or open in the window) and the places they belong to, plus whole areas such as Home, External and Trash.
 * The places are worked out on first use and kept for the reply.
 */
export interface AideReadScope {
  currentIds: readonly string[];
  /** Listing indexes, Dives or the trash is also what managing them needs. */
  manage: { dives: boolean; indexes: boolean; trash: boolean };
  scopes: AideReadScopes;
  reach?: AideReachContext;
}

// Tools that read one material named by its id argument.
const READ_BY_ID = new Set(['read_material', 'read_pdf_page', 'search_in_material', 'trace_source']);

interface PlacementRow extends DatabaseRow {
  anchor_link: string | null;
  deleted_at: string | null;
  id: string;
  kind: string;
  virtual_filter: string | null;
}

interface CollectionRow extends DatabaseRow {
  id: string;
  manual_child_order: string | null;
  parent_id: string | null;
  virtual_filter: string | null;
}

interface FamilyRow extends DatabaseRow {
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
}

const FAMILY_LIMIT = 200;

// The current materials are the ones linked to the conversation and the one open in the window.
export function readAideCurrentMaterialIds(context: {
  activeNodeId?: string | null | undefined;
  conversationMaterials?: ReadonlyArray<{ nodeId: string }> | undefined;
  scope?: string | undefined;
} | undefined) {
  const ids = context?.conversationMaterials?.map((material) => material.nodeId) ?? [];
  const open = context?.scope === 'node' ? context.activeNodeId : null;
  return open && !ids.includes(open) ? [...ids, open] : ids;
}

/** Refuses a read the switches do not reach; returns null when the call may go ahead. */
export async function checkAideReadTarget(scope: AideReadScope, tool: string, body: Record<string, unknown>) {
  if (READ_BY_ID.has(tool)) return await reachesMaterial(scope, String(body.id)) ? null : 'outside_read_scope';
  if (tool === 'list_folder') {
    const parentId = typeof body.parent_id === 'string' ? body.parent_id : null;
    return (parentId === null ? scope.scopes.home : await reachesMaterial(scope, parentId)) ? null : 'outside_read_scope';
  }
  if (tool === 'read_external_document') return scope.scopes.external ? null : 'outside_read_scope';
  if (tool === 'list_trash') return scope.scopes.trash || scope.manage.trash ? null : 'outside_read_scope';
  if (tool === 'list_virtual_folders') return scope.scopes.virtual || scope.manage.indexes ? null : 'outside_read_scope';
  if (tool === 'read_virtual_folder') {
    if (scope.manage.indexes) return null;
    return scope.scopes.virtual && (await readReach(scope)).indexIds.has(String(body.id)) ? null : 'outside_read_scope';
  }
  if (tool === 'list_dives') return scope.scopes.dives || scope.manage.dives ? null : 'outside_read_scope';
  return null;
}

/** Drops listed or found materials the switches do not reach. */
export async function filterAideReadResult(scope: AideReadScope, tool: string, payload: unknown) {
  if (!payload || typeof payload !== 'object') return payload;
  const record = payload as Record<string, unknown>;
  if (tool === 'search_materials' && Array.isArray(record.results)) {
    return runWithDatabaseConnectionOwner(() => {
      const results = (record.results as SearchHit[]).filter(createAideSearchFilter(scope));
      return { ...record, count: results.length, results };
    });
  }
  if (tool === 'list_folder' && Array.isArray(record.children)) {
    return { ...record, children: await keep(record.children as Array<{ id?: unknown }>, (item) => reachesMaterial(scope, String(item.id))) };
  }
  if (tool === 'read_virtual_folder' && Array.isArray(record.items) && !scope.manage.indexes) {
    return { ...record, items: await keep(record.items as Array<{ material_id?: unknown }>, (item) => reachesMaterial(scope, String(item.material_id))) };
  }
  if (tool === 'list_virtual_folders' && Array.isArray(record.virtual_folders) && !scope.manage.indexes) {
    const reach = await readReach(scope);
    const folders = (record.virtual_folders as Array<{ id?: unknown }>).filter((folder) => reach.indexIds.has(String(folder.id)));
    return { ...record, count: folders.length, virtual_folders: folders };
  }
  if (tool === 'list_dives' && Array.isArray(record.dives) && !scope.manage.dives) {
    const reach = await readReach(scope);
    return { ...record, dives: (record.dives as Array<{ id?: unknown }>).filter((dive) => reach.diveIds.has(String(dive.id))) };
  }
  return payload;
}

async function keep<T>(items: T[], test: (item: T) => Promise<boolean>) {
  const kept: T[] = [];
  for (const item of items) if (await test(item)) kept.push(item);
  return kept;
}

type SearchHit = { id?: unknown; kind?: unknown };

// Search calls this while owning the connection, before projecting or limiting results.
export function createAideSearchFilter(scope: AideReadScope) {
  const reach = readReachWithinOwner(scope);
  const { scopes } = scope;
  const canReadBeyondCurrent = scopes.home || scopes.trash
    || (scopes.baseTopic && reach.baseTopicIds.size > 0)
    || (scopes.folder && reach.topFolderIds.size > 0)
    || (scopes.virtual && reach.indexIds.size > 0)
    || (scopes.dives && reach.diveIds.size > 0);
  const visibleById = new Map<string, boolean>();

  return (item: SearchHit) => {
    if (item.kind === 'external') return scopes.external;
    if (item.kind === 'removed') return scopes.trash;
    const id = item.id;
    if (typeof id !== 'string' || (!canReadBeyondCurrent && !(scopes.current && reach.linkedIds.has(id)))) return false;
    const known = visibleById.get(id);
    if (known !== undefined) return known;
    const placement = readAideMaterialPlacement(id);
    const visible = placement !== null && isAideMaterialReachable(placement, reach, scopes);
    visibleById.set(id, visible);
    return visible;
  };
}

async function reachesMaterial(scope: AideReadScope, id: string) {
  const reach = await readReach(scope);
  return runWithDatabaseConnectionOwner(() => {
    const placement = readAideMaterialPlacement(id);
    return placement ? isAideMaterialReachable(placement, reach, scope.scopes) : false;
  });
}

function readReach(scope: AideReadScope) {
  return runWithDatabaseConnectionOwner(() => readReachWithinOwner(scope));
}

function readReachWithinOwner(scope: AideReadScope) {
  scope.reach ??= buildAideReachContext(
    scope.currentIds.flatMap((id) => readAideMaterialPlacement(id) ?? []),
    readAideCollections()
  );
  return scope.reach;
}

// A derived material's Base Topic is where its chain of excerpt anchors ends.
export function readAideMaterialPlacement(id: string): AideMaterialPlacement | null {
  const rows = openDatabaseConnection().driver.queryAll<PlacementRow>(
    `WITH RECURSIVE chain(id, depth) AS (
       SELECT id, 0 FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.parent_id, chain.depth + 1 FROM nodes n JOIN chain ON n.id = chain.id
       WHERE n.parent_id IS NOT NULL AND chain.depth < 64
     )
     SELECT n.id, n.kind, n.anchor_link, n.deleted_at, n.virtual_filter FROM chain JOIN nodes n ON n.id = chain.id
     ORDER BY chain.depth ASC`,
    [id]
  );
  const root = rows.at(-1);
  if (!root) return null;
  let index = 0;
  while (hasAnchor(rows[index]) && rows[index + 1]) index += 1;
  const source = rows[index];
  return {
    area: root.id === VIRTUAL_ROOT_NODE_ID ? 'virtual' : root.virtual_filter ? 'dive' : 'home',
    baseTopicId: source?.kind === 'topic' ? source.id : null,
    chainIds: rows.map((row) => row.id),
    id,
    rootId: root.id,
    rootIsFolder: root.kind === 'folder' && rows.length > 1,
    trashed: rows.some((row) => Boolean(row.deleted_at?.trim()))
  };
}

function readAideCollections(): AideCollection[] {
  const rows = openDatabaseConnection().driver.queryAll<CollectionRow>(
    `SELECT id, manual_child_order, parent_id, virtual_filter FROM nodes
     WHERE kind = 'folder' AND deleted_at IS NULL AND virtual_filter IS NOT NULL`,
    []
  );
  return rows.flatMap((row): AideCollection[] => {
    const memberIds = parseManualChildOrder(row.manual_child_order) ?? [];
    if (row.parent_id === null) return [{ id: row.id, kind: 'dive', memberIds }];
    return row.parent_id === VIRTUAL_ROOT_NODE_ID && isManualVirtualNodeFilter(parseVirtualNodeFilter(row.virtual_filter))
      ? [{ id: row.id, kind: 'index', memberIds }]
      : [];
  });
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

function hasAnchor(row: PlacementRow | undefined) {
  if (!row?.anchor_link) return false;
  try {
    return parseStoredAnchorLink(row.anchor_link) !== null;
  } catch {
    return false;
  }
}
