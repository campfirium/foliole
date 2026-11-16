import { createHash } from 'node:crypto';

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { orderSuperMemoImportWrites, orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../lib/core/import/superMemoImportParents.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import type { NativeMoveNodePatch } from '../../lib/platform/nativeMoveContract.js';
import type { NativeSuperMemoDirectoryUpdate, NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { moveNodes } from '../database/nodeMutations.js';

interface BatchEntry {
  id: number;
  nodeId: string | null;
  outcome: NativeSuperMemoPreview['rows'][number]['outcome'];
  importedParentNodeId?: string | null;
  sourceChildren?: number[];
}
interface Batch {
  entries: BatchEntry[];
  directoryRequiresCollection?: boolean;
  imported: number;
  skipped: number;
  unresolvedImages: number;
}
type LiveNode = {
  parent_id: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
  anchor_link: string | null;
  deleted_at: string | null;
  virtual_filter: string | null;
  title: string;
};

export function superMemoBatchKey(elements: SuperMemoXmlDraftElement[]) {
  const batchId = createHash('sha256').update(JSON.stringify(elements)).digest('hex');
  return { batchId, key: `supermemo-import:${batchId}` };
}

function planMoves(batch: Batch, preview: NativeSuperMemoPreview) {
  const { driver } = openDatabaseConnection();
  const rows = orderSuperMemoSourceRows(preview.rows);
  const parents = planSuperMemoImportParents(rows);
  const entries = new Map(batch.entries.map(entry => [entry.id, entry]));
  const lookup = new Map<string, LiveNode | undefined>();
  const read = (id: string) => {
    if (!lookup.has(id)) lookup.set(id, driver.queryOne<LiveNode>(
      'SELECT parent_id, kind, created_at, updated_at, anchor_link, deleted_at, virtual_filter, title FROM nodes WHERE id = ?', [id]) ?? undefined);
    return lookup.get(id);
  };
  const projectedParents = new Map<string, string | null>();
  function canMove(nodeId: string, parentId: string | null) {
    const visited = new Set([nodeId]);
    for (let id = parentId; id !== null;) {
      const ancestor = read(id);
      if (!ancestor || ancestor.deleted_at || ancestor.virtual_filter || visited.has(id)) return false;
      visited.add(id);
      id = projectedParents.has(id) ? projectedParents.get(id)! : ancestor.parent_id;
    }
    return true;
  }
  const changes: NativeSuperMemoDirectoryUpdate['changes'] = [];
  const moves: Array<{ entry: BatchEntry; nodeId: string; from: string | null; to: string | null }> = [];
  for (const { row } of orderSuperMemoImportWrites(rows.map(row => ({ row })), parents)) {
    const entry = entries.get(row.id);
    if (!entry?.nodeId || entry.outcome !== row.outcome) continue;
    const node = read(entry.nodeId);
    const targetSource = parents.get(row.id);
    const targetEntry = targetSource == null ? undefined : entries.get(targetSource);
    const target = targetSource == null ? (row.outcome === 'folder' ? null : INBOX_NODE_ID) : targetEntry?.nodeId;
    if (node && target === node.parent_id) continue;
    const targetNode = target ? read(target) : undefined;
    const eligible = node && !node.deleted_at && !node.anchor_link && !node.virtual_filter && node.kind === row.outcome &&
      (entry.importedParentNodeId === undefined ? node.created_at === node.updated_at : node.parent_id === entry.importedParentNodeId);
    const status = !eligible ? 'protected' : target === undefined || (targetNode && targetNode.kind !== 'folder' &&
      (targetNode.kind !== 'topic' || row.outcome === 'folder')) || !canMove(entry.nodeId, target) ? 'unavailable' : 'move';
    changes.push({ sourceId: row.id, title: node?.title ?? row.title,
      from: node?.parent_id ? read(node.parent_id)?.title ?? null : null, to: targetNode?.title ?? null, status });
    if (status === 'move' && node && target !== undefined) {
      moves.push({ entry, nodeId: entry.nodeId, from: node.parent_id, to: target });
      projectedParents.set(entry.nodeId, target);
    }
  }
  return { changes, moves };
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

export function updateSuperMemoDirectories(elements: SuperMemoXmlDraftElement[], preview: NativeSuperMemoPreview,
  confirmation?: string) {
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
    const { changes, moves } = pairedSourceRequired ? { changes: [], moves: [] } : planMoves(batch, preview);
    const signature = createHash('sha256').update(JSON.stringify({ batchId, pairedSourceRequired, changes,
      moves: moves.map(({ nodeId, from, to }) => [nodeId, from, to]) })).digest('hex');
    if (confirmation && (confirmation !== signature || pairedSourceRequired)) throw new Error('supermemo_update_changed');
    if (confirmation && moves.length) {
      const now = new Date().toISOString();
      applyMoves(moves, now);
      if (preview.pairedCollection) batch.directoryRequiresCollection = true;
      for (const move of moves) move.entry.importedParentNodeId = move.to;
      driver.execute('UPDATE workspace_meta SET value = ?, updated_at = ? WHERE key = ?', [JSON.stringify(batch), now, key]);
    }
    return { batchId, signature, pairedSourceRequired, changes,
      imported: batch.imported, skipped: batch.skipped, unresolvedImages: batch.unresolvedImages };
  });
}
