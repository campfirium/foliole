import { createHash } from 'node:crypto';

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { orderSuperMemoImportWrites, orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import type { NativeMoveNodePatch } from '../../lib/platform/nativeMoveContract.js';
import type { NativeSuperMemoDirectoryUpdate, NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { moveNodes } from '../database/nodeMutations.js';

import { prepareSuperMemoRows, type runSuperMemoImport, writeSuperMemoRows } from './runSuperMemoImport.js';
import { createSuperMemoAnchorReparentPlanner, type ReparentedSuperMemoAnchor } from './superMemoAnchorReparent.js';
import { superMemoBatchKey } from './superMemoBatchKey.js';

interface BatchEntry {
  id: number;
  nodeId: string | null;
  outcome: NativeSuperMemoPreview['rows'][number]['outcome'];
  importedParentNodeId?: string | null;
  importedAnchorLink?: string | null;
  sourceChildren?: number[];
  unresolvedImages?: unknown[];
}
interface Batch {
  entries: BatchEntry[];
  directoryRequiresCollection?: boolean;
  imported: number;
  skipped: number;
  percent: number;
  unresolvedImages: number;
}
type LiveNode = {
  parent_id: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
  anchor_link: string | null;
  anchor_resolution_status: string | null;
  image_regions: string | null;
  deleted_at: string | null;
  virtual_filter: string | null;
  title: string;
};

type PlannedMove = { entry: BatchEntry; nodeId: string; from: string | null; to: string | null;
  anchor?: ReparentedSuperMemoAnchor };
type UpdateStatus = NativeSuperMemoDirectoryUpdate['changes'][number]['status'];

type ImportInput = Parameters<typeof runSuperMemoImport>[0];
type AdditionWriter = (sourceIds: number[], rows: NativeSuperMemoPreview['rows'],
  existingNodeIds: ReadonlyMap<number, string>, percent: number, now: string) => ReturnType<typeof writeSuperMemoRows>;

function requiredParents(rows: NativeSuperMemoPreview['rows'], parents: Map<number, number | null>, entries: Map<number, BatchEntry>) {
  const required = new Set<number>();
  for (const row of rows) {
    if (!entries.get(row.id)?.nodeId || row.outcome === 'skipped') continue;
    for (let parent = parents.get(row.id); parent != null && !required.has(parent); parent = parents.get(parent)) {
      required.add(parent);
    }
  }
  return required;
}

function canMove(nodeId: string, parentId: string | null, read: (id: string) => LiveNode | undefined,
  projectedParents: ReadonlyMap<string, string | null>) {
  const visited = new Set([nodeId]);
  for (let id = parentId; id !== null;) {
    const ancestor = read(id);
    if (!ancestor || ancestor.deleted_at || ancestor.virtual_filter || visited.has(id)) return false;
    visited.add(id);
    id = projectedParents.has(id) ? projectedParents.get(id)! : ancestor.parent_id;
  }
  return true;
}

function createNodeLookup(driver: ReturnType<typeof openDatabaseConnection>['driver']) {
  const lookup = new Map<string, LiveNode | undefined>();
  const read = (id: string) => {
    if (!lookup.has(id)) lookup.set(id, driver.queryOne<LiveNode>(
      'SELECT parent_id, kind, created_at, updated_at, anchor_link, anchor_resolution_status, image_regions, deleted_at, virtual_filter, title FROM nodes WHERE id = ?', [id]) ?? undefined);
    return lookup.get(id);
  };
  return { lookup, read };
}

function classifyMove(planAnchor: ReturnType<typeof createSuperMemoAnchorReparentPlanner>, entry: BatchEntry, node: LiveNode | undefined,
  allowedTarget: boolean, target: string | null | undefined): { status: UpdateStatus; anchor?: ReparentedSuperMemoAnchor } {
  if (!node || node.deleted_at || node.virtual_filter || node.kind !== entry.outcome) return { status: 'protected' };
  const untouched = node.created_at === node.updated_at;
  const originalParent = entry.importedParentNodeId === undefined ? untouched : node.parent_id === entry.importedParentNodeId;
  const originalAnchor = entry.importedAnchorLink === undefined ? untouched : node.anchor_link === entry.importedAnchorLink;
  if (!originalParent || ((node.anchor_link || entry.importedAnchorLink) && !originalAnchor)) return { status: 'protected' };
  if (!allowedTarget) return { status: 'unavailable' };
  if (!node.anchor_link) return { status: 'move' };
  const anchor = node.parent_id && target && !node.image_regions && !node.anchor_resolution_status?.startsWith('unmapped_')
    ? planAnchor(node.anchor_link, node.parent_id, target) : null;
  return anchor ? { status: 'move', anchor } : { status: 'anchor-unverified' };
}

function planMoves(batch: Batch, preview: NativeSuperMemoPreview) {
  const { driver } = openDatabaseConnection();
  const rows = orderSuperMemoSourceRows(preview.rows);
  const parents = planSuperMemoImportParents(rows);
  const entries = new Map(batch.entries.map(entry => [entry.id, entry]));
  const required = requiredParents(rows, parents, entries);
  const existingNodeIds = new Map<number, string>();
  const additions = new Map<number, { pendingId: string; target: string | null }>();
  const { lookup, read } = createNodeLookup(driver);
  const planAnchor = createSuperMemoAnchorReparentPlanner(driver);
  const projectedParents = new Map<string, string | null>();
  const changes: NativeSuperMemoDirectoryUpdate['changes'] = [];
  const moves: PlannedMove[] = [];
  for (const { row } of orderSuperMemoImportWrites(rows.map(row => ({ row })), parents)) {
    const entry = entries.get(row.id);
    if (!entry) continue;
    const targetSource = parents.get(row.id);
    const target = targetSource == null ? (row.outcome === 'folder' ? null : INBOX_NODE_ID)
      : existingNodeIds.get(targetSource) ?? additions.get(targetSource)?.pendingId;
    const targetNode = target ? read(target) : undefined;
    const targetKindValid = !targetNode || targetNode.kind === 'folder' ||
      (targetNode.kind === 'topic' && row.outcome !== 'folder');
    if (!entry.nodeId && entry.outcome === 'skipped' && required.has(row.id) &&
        (row.outcome === 'folder' || row.outcome === 'topic') && target !== undefined && targetKindValid) {
      const pendingId = `supermemo-pending:${row.id}`;
      if (!canMove(pendingId, target, read, projectedParents)) continue;
      additions.set(row.id, { pendingId, target });
      lookup.set(pendingId, { parent_id: target, kind: row.outcome, title: row.title,
        created_at: '', updated_at: '', anchor_link: null, anchor_resolution_status: null, image_regions: null, deleted_at: null, virtual_filter: null });
      changes.push({ sourceId: row.id, title: row.title, from: null, to: targetNode?.title ?? null, status: 'add' });
    }
    if (!entry.nodeId || entry.outcome !== row.outcome) continue;
    const node = read(entry.nodeId);
    if (node && !node.deleted_at && !node.virtual_filter && node.kind === row.outcome) existingNodeIds.set(row.id, entry.nodeId);
    if (node && target === node.parent_id) continue;
    const allowedTarget = target !== undefined && targetKindValid && canMove(entry.nodeId, target, read, projectedParents);
    const { status, anchor } = classifyMove(planAnchor, entry, node, allowedTarget, target);
    changes.push({ sourceId: row.id, title: node?.title ?? row.title,
      from: node?.parent_id ? read(node.parent_id)?.title ?? null : null, to: targetNode?.title ?? null, status,
      ...(anchor ? { reanchor: true } : {}) });
    if (status === 'move' && node && target !== undefined) {
      moves.push({ entry, nodeId: entry.nodeId, from: node.parent_id, to: target, ...(anchor ? { anchor } : {}) });
      projectedParents.set(entry.nodeId, target);
    }
  }
  return { changes, moves, additions, existingNodeIds, rows };
}

function applyMoves(moves: ReturnType<typeof planMoves>['moves'], now: string) {
  const { driver } = openDatabaseConnection();
  const nodes: NativeMoveNodePatch[] = moves.map(move => ({
    nodeId: move.nodeId, expectedParentNodeId: move.from, parentNodeId: move.to, updatedAt: now
  }));
  const changed = new Set(nodes.map(node => node.nodeId));
  const parentOrders = [...new Set(moves.flatMap(move => [move.from, move.to]))].map(parentNodeId => {
    const expectedChildIds = readMoveParentOrder(driver, parentNodeId).visibleIds;
    return { parentNodeId, expectedChildIds, childIds: [
      ...expectedChildIds.filter(id => !changed.has(id)), ...moves.filter(move => move.to === parentNodeId).map(move => move.nodeId)
    ] };
  });
  moveNodes({ nodes, parentOrders, maintainSequentialReading: false, defaultPriority: 5 });
}

function applyUpdate(batch: Batch, plan: ReturnType<typeof planMoves>, now: string, writeAdditions?: AdditionWriter) {
  const { additions, moves, rows, existingNodeIds } = plan;
  if (additions.size && !writeAdditions) throw new Error('supermemo_update_additions_not_prepared');
  const created = additions.size ? writeAdditions!([...additions.keys()], rows, existingNodeIds, batch.percent, now) : [];
  const bySource = new Map(created.map(entry => [entry.id, entry]));
  const replacements = new Map<string, string>();
  for (const [sourceId, { pendingId }] of additions) {
    const id = bySource.get(sourceId)?.nodeId;
    if (!id) throw new Error('supermemo_update_addition_missing');
    replacements.set(pendingId, id);
  }
  const resolvedMoves = moves.map(move => ({ ...move, to: move.to === null ? null : replacements.get(move.to) ?? move.to }));
  if (resolvedMoves.length) applyMoves(resolvedMoves, now);
  for (const move of resolvedMoves) {
    move.entry.importedParentNodeId = move.to;
    if (!move.anchor) continue;
    const { driver } = openDatabaseConnection();
    const anchorLink = JSON.stringify(move.anchor.link);
    driver.execute(`UPDATE nodes SET anchor_link = ?, anchor_resolution_status = 'resolved', anchor_source_version_id = ?
      WHERE id = ?`, [anchorLink, move.anchor.sourceVersionId, move.nodeId]);
    move.entry.importedAnchorLink = anchorLink;
  }
  batch.entries = batch.entries.map(entry => bySource.get(entry.id) ?? entry);
  batch.imported = batch.entries.filter(entry => entry.nodeId).length;
  batch.skipped = batch.entries.length - batch.imported;
  batch.unresolvedImages = batch.entries.reduce((total, entry) => total + (entry.unresolvedImages?.length ?? 0), 0);
}

export function updateSuperMemoDirectories(elements: SuperMemoXmlDraftElement[], preview: NativeSuperMemoPreview,
  confirmation?: string, writeAdditions?: AdditionWriter) {
  const { driver } = openDatabaseConnection();
  const { batchId, key } = superMemoBatchKey(elements);
  return driver.transaction(() => {
    const saved = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
    if (!saved) {
      if (confirmation) throw new Error('supermemo_update_source_changed');
      return undefined;
    }
    const batch = JSON.parse(saved.value) as Batch;
    const pairedSourceRequired = !preview.pairedCollection &&
      Boolean(batch.directoryRequiresCollection || batch.entries.some(entry => entry.sourceChildren !== undefined));
    const plan = pairedSourceRequired ? undefined : planMoves(batch, preview);
    const changes = plan?.changes ?? [];
    const signature = createHash('sha256').update(JSON.stringify({ batchId, pairedSourceRequired, changes,
      moves: plan?.moves.map(({ nodeId, from, to, anchor }) => [nodeId, from, to, anchor]), additions: [...plan?.additions ?? []]
    })).digest('hex');
    if (confirmation && (confirmation !== signature || !plan)) throw new Error('supermemo_update_changed');
    if (confirmation && plan && (plan.moves.length || plan.additions.size)) {
      const now = new Date().toISOString();
      applyUpdate(batch, plan, now, writeAdditions);
      if (preview.pairedCollection) batch.directoryRequiresCollection = true;
      driver.execute('UPDATE workspace_meta SET value = ?, updated_at = ? WHERE key = ?', [JSON.stringify(batch), now, key]);
    }
    return { batchId, signature, pairedSourceRequired, changes,
      imported: batch.imported, skipped: batch.skipped, unresolvedImages: batch.unresolvedImages };
  });
}

export async function confirmSuperMemoDirectoryUpdate(input: ImportInput, signature: string) {
  const { elements, preview, collectionDirectory, expectedImages } = input;
  const plan = updateSuperMemoDirectories(elements, preview);
  if (!plan || plan.signature !== signature || plan.pairedSourceRequired) throw new Error('supermemo_update_changed');
  const additions = new Set(plan.changes.filter(change => change.status === 'add').map(change => change.sourceId));
  const prepared = await prepareSuperMemoRows(preview.rows.filter(row => additions.has(row.id)),
    new Map(elements.map(element => [element.id, element])), collectionDirectory, expectedImages);
  return updateSuperMemoDirectories(elements, preview, signature, (_sourceIds, allRows, existingNodeIds, percent, now) =>
    writeSuperMemoRows(prepared, { ...input, allRows, existingNodeIds, percent, now }));
}
