import type { DatabaseRow } from './driver.js';
import { isWorkspaceBodyStatus } from './workspaceBodyStatus.js';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

export interface WorkspaceNodeRow extends DatabaseRow {
  id: string;
  parent_id: string | null;
  kind: string | null;
  priority: number | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  sequential_reading_enabled: number | null;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  virtual_filter: string | null;
  body_blob_hash: string | null;
  opening_text: string | null;
  body_status: string | null;
  has_content: number;
  has_reveal: number;
  anchor_link: string | null;
  image_regions: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reading_interval_duration_ms: number | null;
  reading_interval_growth_factor: number | null;
  reading_last_handled_at: string | null;
  reading_next_at: string | null;
  reading_priority: number | null;
  reading_position: number | null;
  reading_repetition_count: number | null;
  reading_state: string | null;
  review_due: string | null;
  review_last_review_at: string | null;
  review_state: number | null;
  review_stability: number | null;
  review_difficulty: number | null;
  review_elapsed_days: number | null;
  review_scheduled_days: number | null;
  review_reps: number | null;
  review_lapses: number | null;
}

export interface WorkspaceListNodeSnapshot extends WorkspaceNodeSnapshot {
  hasContent: boolean;
  hasReveal: boolean;
}

export function buildWorkspaceListNodesById(rows: WorkspaceNodeRow[]) {
  const nodesById: Record<string, WorkspaceListNodeSnapshot> = {};
  const trashedNodeDeletedAtById: Record<string, string> = {};
  const trashedNodeIds: string[] = [];
  const directOpeningById = new Map<string, string | null>();
  for (const row of rows) {
    const directOpening = typeof row.opening_text === 'string' && row.opening_text.trim() ? row.opening_text : null;
    directOpeningById.set(row.id, directOpening);
    const node = buildWorkspaceSnapshotNode({
      ...row,
      content: '',
      reveal: null
    });
    nodesById[row.id] = {
      ...node,
      ...(isWorkspaceBodyStatus(row.body_status) ? { bodyStatus: row.body_status } : {}),
      hasContent: row.has_content === 1,
      hasReveal: row.has_reveal === 1,
      openingText: null,
      content: '',
      reveal: null
    };
    if (row.deleted_at) {
      trashedNodeIds.push(row.id);
      trashedNodeDeletedAtById[row.id] = row.deleted_at;
    }
  }
  return { directOpeningById, nodesById, trashedNodeDeletedAtById, trashedNodeIds };
}
