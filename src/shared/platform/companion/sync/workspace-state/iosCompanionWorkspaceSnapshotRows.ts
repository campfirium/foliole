import {
  buildWorkspaceSnapshotNode,
  type WorkspaceNodeRowShape,
  type WorkspaceNodeSnapshot
} from '../../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { PersistedNodeViewState } from '../../../../../../lib/platform/persistedNodeViewState';
import { normalizeNodeViewStateWriteSource } from '../../../../../../lib/platform/persistedNodeViewState';

type SqlRow = Record<string, unknown>;

export function buildIosWorkspaceNodes(rows: SqlRow[]) {
  const nodesById: Record<string, WorkspaceNodeSnapshot> = {};
  const trashedNodeIds: string[] = [];
  for (const row of rows) {
    const node = buildWorkspaceSnapshotNode(toWorkspaceNodeRow(row));
    if (typeof row.position === 'number') node.position = row.position;
    nodesById[node.id] = node;
    if (node.deletedAt) trashedNodeIds.push(node.id);
  }
  return { nodesById, trashedNodeIds };
}

export function attachIosWorkspaceNodeAttachments(
  nodesById: Record<string, WorkspaceNodeSnapshot>,
  rows: SqlRow[]
) {
  for (const node of Object.values(nodesById)) node.attachments = [];
  for (const row of rows) {
    const node = typeof row.node_id === 'string' ? nodesById[row.node_id] : undefined;
    if (!node || typeof row.attachment_id !== 'string' || typeof row.role !== 'string') continue;
    node.attachments?.push({
      attachmentId: row.attachment_id,
      mimeType: typeof row.mime_type === 'string' ? row.mime_type : null,
      originalName: typeof row.original_name === 'string' ? row.original_name : null,
      role: row.role
    });
  }
}

export function buildIosPersistedNodeViews(rows: SqlRow[]) {
  const result: Record<string, PersistedNodeViewState | undefined> = {};
  for (const row of rows) {
    if (typeof row.node_id !== 'string' || typeof row.updated_at !== 'string') continue;
    result[row.node_id] = {
      nodeId: row.node_id,
      scrollTop: typeof row.scroll_top === 'number' ? row.scroll_top : 0,
      selectionFrom: typeof row.selection_from === 'number' ? row.selection_from : null,
      selectionTo: typeof row.selection_to === 'number' ? row.selection_to : null,
      source: normalizeNodeViewStateWriteSource(row.source),
      updatedAt: row.updated_at
    };
  }
  return result;
}

function toWorkspaceNodeRow(row: SqlRow) {
  return {
    ...row,
    reading_interval_duration_ms: row.interval_duration_ms,
    reading_interval_growth_factor: row.interval_growth_factor,
    reading_last_handled_at: row.last_handled_at,
    reading_next_at: row.next_at,
    reading_repetition_count: row.repetition_count,
    review_due: row.due,
    review_last_review_at: row.last_review_at
  } as unknown as WorkspaceNodeRowShape;
}
