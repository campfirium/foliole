import { openDatabaseConnection } from './connection.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { applyReviewGrade } from './reviewMutations.js';

export function seedNode(nodeId: string, parentNodeId: string | null, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind: nodeId === 'node-child' ? 'item' : 'topic',
    title: nodeId,
    isTitleManual: true,
    content: `# ${nodeId}`,
    reveal: nodeId === 'node-child' ? 'answer' : null,
    anchorLink: null,
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

export function getNodeRow(nodeId: string) {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare('SELECT id, parent_id, content, body_blob_hash, anchor_link, deleted_at, virtual_filter FROM nodes WHERE id = ?')
    .get(nodeId) as
    | {
        anchor_link: string | null;
        body_blob_hash: string | null;
        content: string;
        deleted_at: string | null;
        id: string;
        parent_id: string | null;
        virtual_filter: string | null;
      }
    | undefined;
}

export function getNodeOrderRows() {
  return openDatabaseConnection().sqlite
    .prepare('SELECT node_id, position FROM node_order ORDER BY position ASC')
    .all() as Array<{ node_id: string; position: number }>;
}

export function getReviewCounts(nodeId: string) {
  const connection = openDatabaseConnection();
  const reviewCount = connection.sqlite
    .prepare('SELECT COUNT(*) as count FROM node_review WHERE node_id = ?')
    .get(nodeId) as { count: number };
  const reviewLogCount = connection.sqlite
    .prepare('SELECT COUNT(*) as count FROM review_log WHERE node_id = ?')
    .get(nodeId) as { count: number };
  return {
    reviewCount: reviewCount.count,
    reviewLogCount: reviewLogCount.count
  };
}

export function getNodeReviewRow(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT due, last_review_at, reps, state FROM node_review WHERE node_id = ?')
    .get(nodeId) as { due: string; last_review_at: string | null; reps: number; state: number } | undefined;
}

export function getNodeReviewSyncRow(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT object_type, object_id, sync_dirty
       FROM sync_object_state
       WHERE object_type = 'node_review' AND object_id = ?`
    )
    .get(nodeId) as { object_id: string; object_type: string; sync_dirty: number } | undefined;
}

export function getNodeReadingRow(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT node_id, state FROM node_reading WHERE node_id = ?')
    .get(nodeId) as { node_id: string; state: string } | undefined;
}

export function getContentBlobRow(hash: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT hash, kind, mime_type, availability FROM content_blobs WHERE hash = ?')
    .get(hash) as { availability: string; hash: string; kind: string; mime_type: string } | undefined;
}

export function getContentBlobData(hash: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT data FROM content_blob_data WHERE hash = ?')
    .get(hash) as { data: Uint8Array } | undefined;
}

export function seedDismissedReadingNode(nodeId: string, parentNodeId: string | null, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind: 'item',
    title: nodeId,
    isTitleManual: true,
    content: `# ${nodeId}`,
    reveal: 'answer',
    anchorLink: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-06T00:00:00.000Z',
      nextAt: '2026-03-06T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

export function applySeedReviewGrade(nodeId: string) {
  applyReviewGrade({
    nodeId,
    grade: 3,
    reviewedAt: '2026-03-06T00:00:00.000Z',
    cardBefore: {
      due: '2026-03-06T00:00:00.000Z',
      last_review: null,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0
    },
    cardAfter: {
      due: '2026-03-10T00:00:00.000Z',
      last_review: '2026-03-06T00:00:00.000Z',
      state: 1,
      stability: 2.5,
      difficulty: 3.1,
      elapsed_days: 1,
      scheduled_days: 4,
      reps: 1,
      lapses: 0
    }
  });
}
