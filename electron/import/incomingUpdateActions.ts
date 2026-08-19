import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { writeNewNode } from '../../lib/core/database/importPipelineNodes.js';
import type { NodeAnchorLinkPayload, NodeImageRegionGroupPayload } from '../../lib/core/database/nodeMutationPayloads.js';
import { resolveImportedNodeTitle, shouldHideImportedTitleHeading } from '../../lib/core/import/importedNodeTitle.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import {
  clearPendingIncomingUpdate,
  loadPendingIncomingUpdateById,
  type IncomingUpdateRecord
} from './incomingUpdates.js';

interface IncomingUpdateNodeRow extends DatabaseRow {
  anchor_link: string | null;
  created_at: string;
  desired_retention: number | null;
  enable_short_term: 0 | 1 | null;
  hide_title_heading: 0 | 1;
  id: string;
  image_regions: string | null;
  is_title_manual: 0 | 1;
  kind: 'folder' | 'item' | 'topic';
  manual_child_order: string | null;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  sequential_reading_enabled: 0 | 1 | null;
  shelved_at: string | null;
  title: string;
  virtual_filter: string | null;
}

interface IncomingUpdateReadingRow extends DatabaseRow {
  interval_duration_ms: number;
  interval_growth_factor: number;
  last_handled_at: string;
  next_at: string;
  priority: number;
  reading_position: number | null;
  repetition_count: number;
  state: 'active' | 'dismissed' | 'done' | 'locked';
}

interface IncomingUpdateReviewRow extends DatabaseRow {
  difficulty: number;
  due: string;
  elapsed_days: number;
  lapses: number;
  last_review_at: string | null;
  reps: number;
  scheduled_days: number;
  stability: number;
  state: 0 | 1 | 2 | 3;
}

function parseJsonOrNull<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readIncomingUpdateNode(update: IncomingUpdateRecord) {
  return openDatabaseConnection().driver.queryOne<IncomingUpdateNodeRow>(
    `SELECT id, parent_id, kind, priority, desired_retention, enable_short_term,
            sequential_reading_enabled, shelved_at, manual_child_order, title,
            is_title_manual, hide_title_heading, virtual_filter, reveal,
            anchor_link, image_regions, position, created_at
     FROM nodes
     WHERE id = ?
       AND deleted_at IS NULL`,
    [update.topicId]
  );
}

function readIncomingUpdateReading(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<IncomingUpdateReadingRow>(
    `SELECT reading.interval_duration_ms, reading.interval_growth_factor,
            reading.last_handled_at, reading.next_at, reading.priority,
            reading.repetition_count, reading.state,
            device_state.reading_position
     FROM node_reading reading
     LEFT JOIN node_reading_host_state device_state
       ON device_state.node_id = reading.node_id
     WHERE reading.node_id = ?
     ORDER BY device_state.updated_at DESC
     LIMIT 1`,
    [nodeId]
  );
}

function readIncomingUpdateReview(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<IncomingUpdateReviewRow>(
    `SELECT due, last_review_at, state, stability, difficulty,
            elapsed_days, scheduled_days, reps, lapses
     FROM node_review
     WHERE node_id = ?`,
    [nodeId]
  );
}

function toNodeReadingPayload(row: IncomingUpdateReadingRow | null | undefined) {
  return row
    ? {
        intervalDurationMs: row.interval_duration_ms,
        intervalGrowthFactor: row.interval_growth_factor,
        lastHandledAt: row.last_handled_at,
        nextAt: row.next_at,
        priority: row.priority,
        readingPosition: row.reading_position ?? 0,
        repetitionCount: row.repetition_count,
        state: row.state
      }
    : null;
}

function toNodeReviewPayload(row: IncomingUpdateReviewRow | null | undefined) {
  return row
    ? {
        difficulty: row.difficulty,
        due: row.due,
        elapsedDays: row.elapsed_days,
        lapses: row.lapses,
        lastReviewAt: row.last_review_at,
        reps: row.reps,
        scheduledDays: row.scheduled_days,
        stability: row.stability,
        state: row.state
      }
    : null;
}

export function acceptPendingIncomingUpdate(input: { content: string; id: string }) {
  const update = loadPendingIncomingUpdateById(input.id);
  if (!update) {
    return { incoming_update_id: input.id, node_id: null, status: 'unavailable' as const };
  }
  const node = readIncomingUpdateNode(update);
  if (!node) {
    clearPendingIncomingUpdate(input.id);
    return { incoming_update_id: input.id, node_id: update.topicId, status: 'unavailable' as const };
  }
  const updatedAt = new Date().toISOString();
  upsertNodeSnapshot({
    anchorLink: parseJsonOrNull<NodeAnchorLinkPayload>(node.anchor_link),
    content: input.content,
    createdAt: node.created_at,
    desiredRetention: node.desired_retention,
    enableShortTerm: node.enable_short_term == null ? null : node.enable_short_term === 1,
    hideTitleHeading: node.hide_title_heading === 1,
    imageRegions: parseJsonOrNull<NodeImageRegionGroupPayload[]>(node.image_regions),
    isTitleManual: node.is_title_manual === 1,
    kind: node.kind,
    manualChildOrder: parseJsonOrNull<string[]>(node.manual_child_order),
    nodeId: node.id,
    parentNodeId: node.parent_id,
    position: node.position,
    priority: node.priority,
    reading: toNodeReadingPayload(readIncomingUpdateReading(node.id)),
    reveal: node.reveal,
    review: toNodeReviewPayload(readIncomingUpdateReview(node.id)),
    sequentialReadingEnabled: node.sequential_reading_enabled == null ? null : node.sequential_reading_enabled === 1,
    shelvedAt: node.shelved_at,
    title: node.title,
    updatedAt,
    virtualFilter: parseJsonOrNull(node.virtual_filter)
  }, { searchInvalidation: { workspaceInvalidation: 'defer' } });
  clearPendingIncomingUpdate(input.id);
  enqueueCoalescedWorkspaceSearchInvalidation([node.id]);
  scheduleMirrorSync([node.id]);
  return { incoming_update_id: input.id, node_id: node.id, status: 'accepted' as const };
}

export function dismissPendingIncomingUpdate(id: string) {
  const update = loadPendingIncomingUpdateById(id);
  if (!update) {
    return { incoming_update_id: id, node_id: null, status: 'unavailable' as const };
  }
  clearPendingIncomingUpdate(id);
  return { incoming_update_id: id, node_id: update.topicId, status: 'dismissed' as const };
}

export function importPendingIncomingUpdateAsNewTopic(id: string) {
  const update = loadPendingIncomingUpdateById(id);
  if (!update) {
    return { incoming_update_id: id, node_id: null, status: 'unavailable' as const };
  }
  const node = readIncomingUpdateNode(update);
  if (!node) {
    clearPendingIncomingUpdate(id);
    return { incoming_update_id: id, node_id: update.topicId, status: 'unavailable' as const };
  }
  const importedAt = new Date().toISOString();
  const sourceName = path.basename(update.sourcePath) || 'incoming-update.md';
  const newNodeId = writeNewNode({
    content: update.updatedContent,
    driver: openDatabaseConnection().driver,
    hideTitleHeading: shouldHideImportedTitleHeading(update.updatedContent),
    importedAt,
    targetParentNodeId: node.parent_id,
    title: resolveImportedNodeTitle({
      content: update.updatedContent,
      sourceName,
      titleStrategy: 'heading'
    })
  });
  clearPendingIncomingUpdate(id);
  scheduleMirrorSync([newNodeId]);
  return { incoming_update_id: id, node_id: newNodeId, status: 'imported_as_new' as const };
}
