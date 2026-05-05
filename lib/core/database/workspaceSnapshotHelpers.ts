import { isNodeKind, type NodeKind } from '../nodes/nodeKind.js';
import { parseVirtualNodeFilter, type VirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import { parseStoredAnchorLink, type StoredAnchorLink } from './anchorLinkCodec.js';
import type { DatabaseDriver } from './driver.js';
import { parseStoredImageRegions, type StoredImageRegionGroup } from './imageRegionCodec.js';

interface WorkspaceReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

interface WorkspaceReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

export interface WorkspaceNodeSnapshot {
  attachments?: WorkspaceNodeAttachmentSnapshot[];
  bodyBlobHash?: string | null;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  id: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  hideTitleHeading: boolean;
  openingText?: string | null;
  content: string;
  currentVersionId?: string | null;
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
  anchorLink: StoredAnchorLink | null;
  imageRegions?: StoredImageRegionGroup[] | null;
  reading: WorkspaceReadingProfile | null;
  review: WorkspaceReviewProfile | null;
  createdAt: string;
  deletedAt?: string | null;
  updatedAt: string;
}

export interface WorkspaceNodeAttachmentSnapshot {
  attachmentId: string;
  mimeType: string | null;
  originalName: string | null;
  role: string;
}

export interface WorkspaceNodeRowShape {
  body_blob_hash?: string | null;
  anchor_link: string | null;
  body_status?: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  desired_retention: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string | null;
  opening_text: string | null;
  parent_id: string | null;
  priority: number | null;
  reading_interval_duration_ms: number | null;
  reading_interval_growth_factor: number | null;
  reading_last_handled_at: string | null;
  reading_next_at: string | null;
  reading_position: number | null;
  reading_priority: number | null;
  reading_repetition_count: number | null;
  reading_state: string | null;
  reveal: string | null;
  review_difficulty: number | null;
  review_due: string | null;
  review_elapsed_days: number | null;
  review_lapses: number | null;
  review_last_review_at: string | null;
  review_reps: number | null;
  review_scheduled_days: number | null;
  review_stability: number | null;
  review_state: number | null;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

function parseNodeKind(value: string | null): NodeKind {
  return isNodeKind(value) ? value : 'topic';
}

function toReadingProfile(row: WorkspaceNodeRowShape): WorkspaceReadingProfile | null {
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

function toReviewProfile(row: WorkspaceNodeRowShape): WorkspaceReviewProfile | null {
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

export function buildWorkspaceSnapshotNode(row: WorkspaceNodeRowShape): WorkspaceNodeSnapshot {
  const imageRegions = parseStoredImageRegions(row.image_regions);
  const node: WorkspaceNodeSnapshot = {
    id: row.id,
    parentNodeId: row.parent_id,
    kind: parseNodeKind(row.kind),
    title: row.title,
    isTitleManual: row.is_title_manual === 1,
    hideTitleHeading: row.hide_title_heading === 1,
    openingText: row.opening_text,
    content: row.content,
    bodyBlobHash: row.body_blob_hash ?? null,
    virtualFilter: parseVirtualNodeFilter(row.virtual_filter),
    reveal: row.reveal,
    anchorLink: parseStoredAnchorLink(row.anchor_link),
    reading: toReadingProfile(row),
    review: toReviewProfile(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (imageRegions) {
    node.imageRegions = imageRegions;
  }
  if (typeof row.priority === 'number') {
    node.priority = row.priority;
  }
  if (typeof row.desired_retention === 'number') {
    node.desiredRetention = row.desired_retention;
  }
  if (
    row.body_status === 'empty' ||
    row.body_status === 'failed' ||
    row.body_status === 'fetching' ||
    row.body_status === 'missing'
  ) {
    node.bodyStatus = row.body_status;
  }
  return node;
}

export function buildOrderedNodeIds<T extends { id: string }>(
  rows: T[],
  orderedRows: Array<{ node_id: string }>,
  nodesById: Record<string, WorkspaceNodeSnapshot>
) {
  const nodeOrder = orderedRows.map((row) => row.node_id).filter((nodeId) => Boolean(nodesById[nodeId]));
  const orderedNodeIds = new Set(nodeOrder);
  for (const row of rows) {
    if (!orderedNodeIds.has(row.id)) {
      nodeOrder.push(row.id);
    }
  }
  return nodeOrder;
}

export function resolveSnapshotActiveNodeId(
  driver: DatabaseDriver,
  nodeOrder: string[],
  nodesById: Record<string, WorkspaceNodeSnapshot>,
  trashedNodeIds: string[],
  activeNodeMetaKey: string
) {
  const row = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [activeNodeMetaKey]);
  const persistedActiveNodeId = row && row.value !== '' ? row.value : null;
  const trashedNodeSet = new Set(trashedNodeIds);
  return (
    (persistedActiveNodeId && nodesById[persistedActiveNodeId] && !trashedNodeSet.has(persistedActiveNodeId)
      ? persistedActiveNodeId
      : null) ?? nodeOrder.find((nodeId) => !trashedNodeSet.has(nodeId)) ?? null
  );
}
