import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { RuntimeRemovedSourceEntry } from '../../shared/platform/removedSourcesRuntimeRepository';

import { sortWorkspaceContentNodeIds } from './workspaceContentNodeOrder';
import { normalizeWorkspaceContentSort, type WorkspaceContentSortState } from './workspaceContentSort';

export interface RemovedSourcesTreeModel {
  collapsibleNodeIds: string[];
  entryByNodeId: Record<string, RuntimeRemovedSourceEntry | undefined>;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  rows: ReturnType<typeof buildNodeTree>['rows'];
}

function normalizeSourcePath(sourcePath: string) {
  return sourcePath.replace(/\\/g, '/').split('/').filter(Boolean);
}

function resolveRemovedAt(entry: RuntimeRemovedSourceEntry) {
  return entry.deletedAt || entry.firstSeenAt;
}

function createRemovedTreeNode(input: {
  createdAt: string;
  id: string;
  kind: NonNullable<WorkspaceListNode['kind']>;
  parentNodeId: string | null;
  title: string;
  updatedAt: string;
}): WorkspaceListNode {
  return {
    createdAt: input.createdAt,
    hasContent: input.kind !== 'folder',
    hasReveal: false,
    id: input.id,
    kind: input.kind,
    parentNodeId: input.parentNodeId,
    reading: null,
    review: null,
    title: input.title,
    updatedAt: input.updatedAt
  };
}

function upsertFolderNode(args: {
  nodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  id: string;
  parentNodeId: string | null;
  title: string;
  timestamp: string;
}) {
  const existing = args.nodesById[args.id];
  if (existing) {
    args.nodesById[args.id] = {
      ...existing,
      updatedAt: existing.updatedAt.localeCompare(args.timestamp) < 0 ? args.timestamp : existing.updatedAt
    };
    return;
  }
  args.nodeOrder.push(args.id);
  args.nodesById[args.id] = createRemovedTreeNode({
    createdAt: args.timestamp,
    id: args.id,
    kind: 'folder',
    parentNodeId: args.parentNodeId,
    title: args.title,
    updatedAt: args.timestamp
  });
}

function addRemovedEntryNode(model: Pick<RemovedSourcesTreeModel, 'entryByNodeId' | 'nodeOrder' | 'nodesById'>, entry: RuntimeRemovedSourceEntry) {
  const pathParts = normalizeSourcePath(entry.sourcePath);
  const folderParts = pathParts.slice(0, -1);
  const timestamp = resolveRemovedAt(entry);
  let parentNodeId: string | null = null;
  folderParts.forEach((part, index) => {
    const folderId = `removed-folder:${entry.ruleId}:${folderParts.slice(0, index + 1).join('/')}`;
    upsertFolderNode({ id: folderId, nodeOrder: model.nodeOrder, nodesById: model.nodesById, parentNodeId, timestamp, title: part });
    parentNodeId = folderId;
  });
  const nodeId = `removed-source:${entry.id}`;
  model.nodeOrder.push(nodeId);
  model.entryByNodeId[nodeId] = entry;
  model.nodesById[nodeId] = createRemovedTreeNode({
    createdAt: entry.firstSeenAt,
    id: nodeId,
    kind: 'topic',
    parentNodeId,
    title: entry.title,
    updatedAt: timestamp
  });
}

export function buildRemovedSourcesTree(entries: RuntimeRemovedSourceEntry[], sort: WorkspaceContentSortState): RemovedSourcesTreeModel {
  const model: RemovedSourcesTreeModel = {
    collapsibleNodeIds: [],
    entryByNodeId: {},
    nodeOrder: [],
    nodesById: {},
    rows: []
  };
  entries.forEach((entry) => addRemovedEntryNode(model, entry));
  const normalizedSort = normalizeWorkspaceContentSort(sort, ['deletedAt', 'name']);
  const sortedNodeOrder = sortWorkspaceContentNodeIds(model.nodeOrder, model.nodesById, normalizedSort);
  const tree = buildNodeTree(sortedNodeOrder, model.nodesById);
  return {
    ...model,
    collapsibleNodeIds: tree.rows.filter((row) => row.hasChildren).map((row) => row.node.id),
    nodeOrder: sortedNodeOrder,
    rows: tree.rows
  };
}

export function getVisibleRemovedSourceRows(rows: RemovedSourcesTreeModel['rows'], collapsedNodeIds: ReadonlySet<string>) {
  return buildVisibleNodeTreeRows(rows, collapsedNodeIds);
}
