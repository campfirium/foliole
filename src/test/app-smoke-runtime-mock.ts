import { vi } from 'vitest';

import { recomputeReview, type ReviewEvent } from '../../lib/core/review/recomputeReview';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings';

function createNodeMutationResult(command: string, payload?: Record<string, unknown>) {
  const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : 'node-created';
  const parentNodeId = typeof payload?.parentNodeId === 'string' ? payload.parentNodeId : null;
  const content = typeof payload?.content === 'string' ? payload.content : '';
  const reveal = typeof payload?.reveal === 'string' ? payload.reveal : null;
  const kind =
    typeof payload?.kind === 'string'
      ? payload.kind
      : command === 'create_folder'
        ? 'folder'
        : command === 'create_item'
          ? 'item'
          : 'topic';
  return {
    activeNodeId: typeof payload?.activeNodeId === 'string' ? payload.activeNodeId : nodeId,
    createdNodeIds: [nodeId],
    nodeOrder: Array.isArray(payload?.nodeOrder) ? payload.nodeOrder : [nodeId],
    nodes: [{
      nodeId, parentNodeId, kind,
      title: typeof payload?.title === 'string' ? payload.title : '',
      content, hasContent: typeof payload?.hasContent === 'boolean' ? payload.hasContent : content.trim().length > 0,
      reveal, hasReveal: typeof payload?.hasReveal === 'boolean' ? payload.hasReveal : reveal != null,
      anchorLink: null, reading: null, review: null,
      createdAt: '2026-02-25T00:00:00.000Z', updatedAt: '2026-02-25T00:00:00.000Z'
    }]
  };
}

function applySmokeReview(reviews: Map<string, ReviewEvent[]>, payload?: Record<string, unknown>) {
  if (typeof payload?.nodeId !== 'string' || typeof payload.reviewedAt !== 'string' || typeof payload.grade !== 'number') {
    throw new Error('invalid_smoke_review_fact');
  }
  const events = reviews.get(payload.nodeId) ?? [];
  events.push({ op_id: typeof payload.opId === 'string' ? payload.opId : `smoke-${events.length}`,
    reviewed_at: payload.reviewedAt, kind: 'review', grade: payload.grade, voids_op_id: null });
  reviews.set(payload.nodeId, events);
  return recomputeReview(events, DEFAULT_REVIEW_SCHEDULER_SETTINGS);
}
export function createSmokeRuntimeInvoke() {
  const reviews = new Map<string, ReviewEvent[]>();
  return vi.fn(async (command: string, payload?: Record<string, unknown>) => {
    if (command === 'apply_review_grade') return applySmokeReview(reviews, payload);
    if (command === 'create_folder' || command === 'create_topic' || command === 'create_item') {
      return createNodeMutationResult(command, payload);
    }
    if (command === 'update_node_content' || command === 'update_node_reveal') {
      return { nodes: payload ? [payload] : [], updatedNodeIds: typeof payload?.nodeId === 'string' ? [payload.nodeId] : [] };
    }
    if (command === 'update_node_content_with_anchors') {
      return {
        anchorUpdates: Array.isArray(payload?.affectedAnchors) ? payload.affectedAnchors : [],
        nodes: payload?.parent ? [payload.parent] : []
      };
    }
    if (command === 'soft_delete_nodes') return { deletedNodeIds: Array.isArray(payload?.nodeIds) ? payload.nodeIds : [] };
    if (command === 'restore_nodes') return { restoredNodeIds: Array.isArray(payload?.nodeIds) ? payload.nodeIds : [], skippedConflicts: [] };
    if (command === 'delete_nodes_permanently') {
      const nodeOrder = Array.isArray(payload?.nodeOrder) ? payload.nodeOrder : [];
      const nodeIds = Array.isArray(payload?.nodeIds) ? payload.nodeIds : [];
      return { nodeOrder: nodeOrder.filter((nodeId) => !nodeIds.includes(nodeId)), removedNodeIds: nodeIds };
    }
    if (command === 'move_nodes') return { movedNodeIds: Array.isArray(payload?.nodes)
      ? payload.nodes.flatMap((node) => typeof node?.nodeId === 'string' ? [node.nodeId] : [])
      : [], nodeOrder: payload?.nodeOrder };
    if (command === 'inspect_foliole_published_delete') return { status: 'allowed' };
    if (command === 'load_node_backlinks') return [];
    if (command === 'load_readwise_books_inventory') return { books: [] };
    return null;
  });
}
