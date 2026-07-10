import { randomUUID } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';
import { moveNodes, replaceNodeOrder, restoreNodes, upsertNodeSnapshotWithOrder } from '../database/nodeMutations.js';

import { AgentMaterialMutationError } from './agentControlMaterialMutations.js';
import { readAgentControlMaterial } from './agentControlMaterials.js';

interface NodeRow extends DatabaseRow {
  deleted_at: string | null;
  id: string;
  kind: string;
  parent_id: string | null;
  updated_at: string;
}

export function createAgentControlMaterial(input: {
  content?: string;
  kind: 'folder' | 'topic';
  parentId: string | null;
  title: string;
}) {
  const nodes = readNodes();
  ensureParent(nodes, input.parentId);
  const now = new Date().toISOString();
  const id = randomUUID();
  const order = insertAtParentEnd(readActiveOrder(), nodes, [id], input.parentId);
  upsertNodeSnapshotWithOrder({
    anchorLink: null, content: input.content ?? '', createdAt: now, isTitleManual: true,
    kind: input.kind, nodeId: id, parentNodeId: input.parentId, position: null,
    reveal: null, title: input.title, updatedAt: now
  }, order);
  return readMaterialOrThrow(id);
}

export function moveAgentControlMaterial(input: { expectedUpdatedAt: string; id: string; parentId: string | null }) {
  const nodes = readNodes();
  const node = requireActiveNode(nodes, input.id);
  if (node.updated_at !== input.expectedUpdatedAt) throw new AgentMaterialMutationError('conflict', 409);
  ensureParent(nodes, input.parentId);
  const subtree = descendantsOf(nodes, input.id);
  if (input.parentId && subtree.has(input.parentId)) throw new AgentMaterialMutationError('invalid_request', 400);
  const order = readActiveOrder();
  const movedIds = order.filter((id) => subtree.has(id));
  if (!movedIds.includes(node.id)) throw new AgentMaterialMutationError('not_found', 404);
  const remaining = order.filter((id) => !subtree.has(id));
  moveNodes({
    nodeOrder: insertAtParentEnd(remaining, nodes, movedIds, input.parentId),
    nodes: [{ nodeId: node.id, parentNodeId: input.parentId, updatedAt: new Date().toISOString() }]
  });
  return readMaterialOrThrow(node.id);
}

export function reorderAgentControlMaterials(input: { materialIds: string[]; parentId: string | null }) {
  const nodes = readNodes();
  ensureParent(nodes, input.parentId);
  const siblings = nodes.filter((node) => !node.deleted_at && node.parent_id === input.parentId).map((node) => node.id);
  if (!sameIds(siblings, input.materialIds)) throw new AgentMaterialMutationError('conflict', 409);
  const order = readActiveOrder();
  const siblingTree = new Set(siblings.flatMap((id) => [...descendantsOf(nodes, id)]));
  const insertionIndex = order.findIndex((id) => siblingTree.has(id));
  if (insertionIndex < 0 && siblings.length > 0) throw new AgentMaterialMutationError('conflict', 409);
  const ordered = input.materialIds.flatMap((id) => order.filter((item) => descendantsOf(nodes, id).has(item)));
  const remaining = order.filter((id) => !siblingTree.has(id));
  remaining.splice(insertionIndex < 0 ? remaining.length : insertionIndex, 0, ...ordered);
  replaceNodeOrder(remaining);
  return { material_ids: input.materialIds, parent_id: input.parentId, reordered_count: input.materialIds.length };
}

export function restoreAgentControlMaterial(id: string, expectedUpdatedAt: string) {
  const nodes = readNodes();
  const node = nodes.find((item) => item.id === id);
  if (!node) throw new AgentMaterialMutationError('not_found', 404);
  if (node.updated_at !== expectedUpdatedAt) throw new AgentMaterialMutationError('conflict', 409);
  if (!node.deleted_at) return { already_restored: true, material: readMaterialOrThrow(id), restored_ids: [] };
  const subtreeIds = [...descendantsOf(nodes, id)].filter((nodeId) => nodes.find((item) => item.id === nodeId)?.deleted_at);
  const result = restoreNodes({ nodeIds: subtreeIds });
  return {
    already_restored: false,
    material: readMaterialOrThrow(id),
    restored_ids: result.restoredNodeIds,
    skipped_conflicts: result.skippedConflicts
  };
}

function readNodes() {
  return openDatabaseConnection().driver.queryAll<NodeRow>('SELECT id, parent_id, kind, deleted_at, updated_at FROM nodes');
}

function readActiveOrder() {
  return openDatabaseConnection().driver.queryAll<{ node_id: string }>(
    `SELECT no.node_id FROM node_order no JOIN nodes n ON n.id = no.node_id
     WHERE n.deleted_at IS NULL ORDER BY no.position ASC`
  ).map((row) => row.node_id);
}

function requireActiveNode(nodes: NodeRow[], id: string) {
  const node = nodes.find((item) => item.id === id && !item.deleted_at);
  if (!node) throw new AgentMaterialMutationError('not_found', 404);
  return node;
}

function ensureParent(nodes: NodeRow[], parentId: string | null) {
  if (!parentId) return;
  if (requireActiveNode(nodes, parentId).kind !== 'folder') {
    throw new AgentMaterialMutationError('invalid_request', 400);
  }
}

function descendantsOf(nodes: NodeRow[], rootId: string) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!result.has(node.id) && node.parent_id && result.has(node.parent_id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}

function insertAtParentEnd(order: string[], nodes: NodeRow[], inserted: string[], parentId: string | null) {
  if (!parentId) return [...order, ...inserted];
  const parentTree = descendantsOf(nodes, parentId);
  let index = order.length;
  for (let cursor = 0; cursor < order.length; cursor += 1) {
    const candidate = order[cursor];
    if (candidate && parentTree.has(candidate)) index = cursor + 1;
  }
  return [...order.slice(0, index), ...inserted, ...order.slice(index)];
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length && left.every((id) => right.includes(id));
}

function readMaterialOrThrow(id: string) {
  const material = readAgentControlMaterial(id);
  if (!material) throw new AgentMaterialMutationError('not_found', 404);
  return material;
}
