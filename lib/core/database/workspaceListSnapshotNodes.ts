import { isNodeKind, type NodeKind } from '../nodes/nodeKind.js';
import { parseVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';
import type { DatabaseRow } from './driver.js';
import { parseStoredImageRegions } from './imageRegionCodec.js';
import { isWorkspaceBodyStatus } from './workspaceBodyStatus.js';

export interface WorkspaceNodeRow extends DatabaseRow {
  id: string;
  parent_id: string | null;
  kind: string | null;
  priority: number | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  virtual_filter: string | null;
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

function parseNodeKind(value: string | null): NodeKind {
  return isNodeKind(value) ? value : 'topic';
}

function toReadingProfile(row: WorkspaceNodeRow) {
  if (typeof row.reading_last_handled_at !== 'string' || typeof row.reading_next_at !== 'string') {
    return null;
  }
  if (row.reading_state !== 'active' && row.reading_state !== 'done' && row.reading_state !== 'dismissed') {
    return null;
  }
  return {
    intervalDurationMs: row.reading_interval_duration_ms ?? 0,
    intervalGrowthFactor: row.reading_interval_growth_factor ?? 1,
    lastHandledAt: row.reading_last_handled_at,
    nextAt: row.reading_next_at,
    priority: row.reading_priority ?? 0,
    readingPosition: row.reading_position ?? 0,
    repetitionCount: row.reading_repetition_count ?? 0,
    state: row.reading_state
  };
}

function toReviewProfile(row: WorkspaceNodeRow) {
  if (typeof row.review_due !== 'string') {
    return null;
  }
  return {
    due: row.review_due,
    lastReviewAt: row.review_last_review_at,
    state: (row.review_state ?? 0) as 0 | 1 | 2 | 3,
    stability: row.review_stability ?? 0,
    difficulty: row.review_difficulty ?? 0,
    elapsedDays: row.review_elapsed_days ?? 0,
    scheduledDays: row.review_scheduled_days ?? 0,
    reps: row.review_reps ?? 0,
    lapses: row.review_lapses ?? 0
  };
}

export function buildWorkspaceListNodesById(rows: WorkspaceNodeRow[]) {
  const nodesById: Record<string, Record<string, unknown>> = {};
  const trashedNodeIds: string[] = [];
  const directOpeningById = new Map<string, string | null>();
  for (const row of rows) {
    const imageRegions = parseStoredImageRegions(row.image_regions);
    const directOpening = typeof row.opening_text === 'string' && row.opening_text.trim() ? row.opening_text : null;
    directOpeningById.set(row.id, directOpening);
    nodesById[row.id] = {
      id: row.id,
      parentNodeId: row.parent_id,
      kind: parseNodeKind(row.kind),
      priority: row.priority,
      desiredRetention: row.desired_retention,
      enableShortTerm: typeof row.enable_short_term === 'number' ? row.enable_short_term === 1 : null,
      title: row.title,
      isTitleManual: row.is_title_manual === 1,
      hideTitleHeading: row.hide_title_heading === 1,
      ...(isWorkspaceBodyStatus(row.body_status) ? { bodyStatus: row.body_status } : {}),
      hasContent: row.has_content === 1,
      hasReveal: row.has_reveal === 1,
      openingText: null,
      content: '',
      virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
      reveal: null,
      anchorLink: parseStoredAnchorLink(row.anchor_link),
      ...(imageRegions ? { imageRegions } : {}),
      reading: toReadingProfile(row),
      review: toReviewProfile(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    if (row.deleted_at) {
      trashedNodeIds.push(row.id);
    }
  }
  return { directOpeningById, nodesById, trashedNodeIds };
}
