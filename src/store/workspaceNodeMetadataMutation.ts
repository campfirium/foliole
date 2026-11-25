import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { DIVE_NODE_FILTER, normalizeDiveTitle, readDiveNode } from '../../lib/core/nodes/dive';
import { createKeywordVirtualNodeFilter, createManualVirtualNodeFilter, isVirtualIndexFolderNode } from '../../lib/core/nodes/virtualNodeFilter';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';

import { assertWorkspaceMetadataParent, collectWorkspaceMetadataSubtree } from './workspaceNodeMetadataHistory';

export type WorkspaceMetadataCommand =
  | { type: 'create'; kind: 'folder' | 'topic' | 'item'; title: string; parentNodeId: string | null; nodeId: string }
  | { type: 'create-dive'; title: string; nodeId: string; sourceId: string | null }
  | { type: 'create-index'; title: string; nodeId: string; keyword?: string }
  // A null priority clears the item's own value so it inherits again.
  | { type: 'set-priority'; nodeId: string; priority: number | null }
  | { type: 'rename'; nodeId: string; title: string }
  | { type: 'move'; nodeId: string; parentNodeId: string | null }
  | { type: 'delete' | 'restore' | 'shelve' | 'unshelve'; nodeId: string };

export function buildWorkspaceMetadataMutation(command: WorkspaceMetadataCommand,
  nodes: Record<string, WorkspaceNodeSnapshot>, now: string) {
  if (command.type === 'create' || command.type === 'create-dive' || command.type === 'create-index') {
    if (nodes[command.nodeId] || !command.title.trim()) throw new Error('node_create_unavailable');
    const isDive = command.type === 'create-dive';
    const isIndex = command.type === 'create-index';
    const node: WorkspaceNodeSnapshot = { id: command.nodeId, kind: command.type === 'create' ? command.kind : 'folder',
      title: isDive ? normalizeDiveTitle(command.title) : command.title.trim(),
      parentNodeId: isIndex ? VIRTUAL_ROOT_NODE_ID : command.type === 'create' ? command.parentNodeId : null,
      isTitleManual: true, hideTitleHeading: false, content: '',
      reveal: null, anchorLink: null, reading: null, review: null, createdAt: now, updatedAt: now, deletedAt: null };
    if (isDive) {
      node.virtualFilter = DIVE_NODE_FILTER;
      node.manualChildOrder = command.sourceId ? [command.sourceId] : [];
    }
    if (isIndex) {
      // A keyword makes a saved search; without one the index is filled by hand.
      if (command.keyword !== undefined && !command.keyword.trim()) throw new Error('node_create_unavailable');
      node.virtualFilter = command.keyword ? createKeywordVirtualNodeFilter(command.keyword) : createManualVirtualNodeFilter();
    }
    else assertWorkspaceMetadataParent(node, node.parentNodeId, nodes);
    return { nodes: [node], subtreeNodeIds: [node.id], title: isDive ? 'Create Dive' : isIndex ? 'Create in Virtual' : `Create ${node.kind}` };
  }
  const node = nodes[command.nodeId];
  const trashAction = command.type === 'delete' || command.type === 'restore';
  const index = isVirtualIndexFolderNode(node);
  const dive = Boolean(readDiveNode(node));
  const virtualAction = ((trashAction || command.type === 'rename') && dive) || (index && (trashAction || command.type === 'rename'));
  if (!node || node.id.startsWith('special-') || (node.virtualFilter && !virtualAction) ||
    (command.type === 'restore' ? !node.deletedAt : node.deletedAt)) throw new Error('node_mutation_unavailable');
  const next = { ...node, updatedAt: now };
  if (command.type === 'rename') {
    if (!command.title.trim()) throw new Error('node_title_required');
    next.title = dive ? normalizeDiveTitle(command.title) : command.title.trim();
    next.isTitleManual = true;
  } else if (command.type === 'set-priority') {
    if ((node.kind !== 'topic' && node.kind !== 'item') || (command.priority !== null &&
      (!Number.isInteger(command.priority) || command.priority < 0 || command.priority > 9))) {
      throw new Error('node_priority_unavailable');
    }
    if ((node.priority ?? null) === command.priority) return { nodes: [], subtreeNodeIds: null, title: command.type };
    next.priority = command.priority;
  } else if (command.type === 'move') {
    if (!canNodeBeMoved(node)) throw new Error('node_move_unavailable');
    assertWorkspaceMetadataParent(node, command.parentNodeId, nodes);
    next.parentNodeId = command.parentNodeId;
  } else if (command.type === 'shelve' || command.type === 'unshelve') {
    if (node.kind !== 'topic' || node.anchorLink) throw new Error('node_shelve_unavailable');
    next.shelvedAt = command.type === 'shelve' ? now : null;
  } else {
    const subtreeNodeIds = collectWorkspaceMetadataSubtree(node.id, nodes);
    return { nodes: subtreeNodeIds.map(id => ({ ...nodes[id]!, updatedAt: now,
      deletedAt: command.type === 'delete' ? now : null })), subtreeNodeIds, title: command.type === 'delete' ? 'Delete' : 'Restore' };
  }
  return { nodes: [next], subtreeNodeIds: null, title: command.type };
}
