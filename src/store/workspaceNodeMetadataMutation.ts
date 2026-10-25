import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';

import { assertWorkspaceMetadataParent, collectWorkspaceMetadataSubtree } from './workspaceNodeMetadataHistory';

export type WorkspaceMetadataCommand =
  | { type: 'create'; kind: 'folder' | 'topic' | 'item'; title: string; parentNodeId: string | null; nodeId: string }
  | { type: 'rename'; nodeId: string; title: string }
  | { type: 'move'; nodeId: string; parentNodeId: string | null }
  | { type: 'delete' | 'restore' | 'shelve' | 'unshelve'; nodeId: string };

export function buildWorkspaceMetadataMutation(command: WorkspaceMetadataCommand,
  nodes: Record<string, WorkspaceNodeSnapshot>, now: string) {
  if (command.type === 'create') {
    if (nodes[command.nodeId] || !command.title.trim()) throw new Error('node_create_unavailable');
    const node: WorkspaceNodeSnapshot = { id: command.nodeId, kind: command.kind, title: command.title.trim(),
      parentNodeId: command.parentNodeId, isTitleManual: true, hideTitleHeading: false, content: '',
      reveal: null, anchorLink: null, reading: null, review: null, createdAt: now, updatedAt: now, deletedAt: null };
    assertWorkspaceMetadataParent(node, node.parentNodeId, nodes);
    return { nodes: [node], subtreeNodeIds: [node.id], title: `Create ${node.kind}` };
  }
  const node = nodes[command.nodeId];
  if (!node || node.id.startsWith('special-') || node.virtualFilter ||
    (command.type === 'restore' ? !node.deletedAt : node.deletedAt)) throw new Error('node_mutation_unavailable');
  const next = { ...node, updatedAt: now };
  if (command.type === 'rename') {
    if (!command.title.trim()) throw new Error('node_title_required');
    next.title = command.title.trim();
    next.isTitleManual = true;
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
