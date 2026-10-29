import { readNodeAuthorText } from '../nodes/nodeAuthorFrontmatter.js';
import { readTopicCollections } from '../nodes/topicCollectionsFrontmatter.js';

import type { DatabaseRow } from './driver.js';
import { isWorkspaceBodyStatus } from './workspaceBodyStatus.js';
import { buildWorkspaceSnapshotMetadata, type WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

export interface WorkspaceNodeRow extends DatabaseRow {
  id: string;
  current_version_id?: string | null;
  parent_id: string | null;
  kind: string | null;
  priority: number | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  sequential_reading_enabled: number | null;
  shelved_at: string | null;
  manual_child_order: string | null;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  virtual_filter: string | null;
  body_blob_hash: string | null;
  opening_text: string | null;
  body_status: string | null;
  collection_source_content: string | null;
  has_content: number;
  has_reveal: number;
  anchor_link: string | null;
  image_regions: string | null;
  image_sources?: string | null;
  resource_references: string;
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reading_repetition_count: number | null;
  reading_state: import('../review/readingState.js').ReadingState | null;
  review_node_id: string | null;
  review_last_review_at: string | null;
}

export interface WorkspaceListNodeSnapshot extends Omit<WorkspaceNodeSnapshot, 'reading' | 'review'> {
  reading?: WorkspaceNodeSnapshot['reading'];
  review?: WorkspaceNodeSnapshot['review'];
  collections: string[];
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
    const node = buildWorkspaceSnapshotMetadata({
      ...row,
      content: '',
      reveal: null
    });
    const listNode = { ...node };
    delete listNode.imageSources;
    nodesById[row.id] = {
      ...listNode,
      learningSummary: {
        reading: row.reading_state ? { state: row.reading_state, repetitionCount: row.reading_repetition_count ?? 0 } : null,
        review: row.review_node_id ? { lastReviewAt: row.review_last_review_at } : null
      },
      authorText: readNodeAuthorText(row.collection_source_content ?? ''),
      collections: readCollections(row.collection_source_content),
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

function readCollections(content: string | null) {
  if (typeof content !== 'string') return [];
  try {
    return readTopicCollections(content);
  } catch {
    return [];
  }
}
