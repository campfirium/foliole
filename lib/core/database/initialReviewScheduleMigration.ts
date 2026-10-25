import type { DbPort } from '../sync/dbPort.js';
import { createOpaqueVersionRef } from '../sync/opaqueSyncRefs.js';
import { buildRemoteNodeVersionUpsert } from '../sync/syncNodeApplyStatements.js';
import { loadCurrentSyncNodeRecord } from '../sync/syncNodeGraph.js';
import { upsertAppliedNodeSyncState } from '../sync/syncNodeStateApplyExecutor.js';
import { topicTextSnapshotHash } from '../sync/topicTextSnapshotHash.js';

import { loadCompanionWorkspaceNodeFromDb } from './companionWorkspaceNodeRead.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import { toWorkspaceNativeNodeVersion } from './workspaceNodeSyncVersion.js';

const UNSCORED = `kind = 'item' AND initial_review_due IS NULL
  AND EXISTS (SELECT 1 FROM node_review WHERE node_id = nodes.id AND reps = 0 AND state = 0 AND last_review_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM review_log WHERE node_id = nodes.id)`;
const BACKFILL = `UPDATE nodes SET initial_review_due = (SELECT due FROM node_review WHERE node_id = nodes.id), sync_dirty = 1
  WHERE ${UNSCORED}`;

export function migrateInitialReviewSchedule(db: DatabaseMigrationTarget) {
  addColumnIfMissing(db, 'nodes', 'initial_review_due', 'TEXT');
  db.exec(BACKFILL);
}

export async function migrateCompanionInitialReviewSchedule(db: DbPort) {
  const columns = await db.query<{ name: string }>('PRAGMA table_info(nodes)');
  if (!columns.some(column => column.name === 'initial_review_due')) await db.run('ALTER TABLE nodes ADD COLUMN initial_review_due TEXT');
  const pending = await db.query<{ id: string; due: string }>(`SELECT id,
    (SELECT due FROM node_review WHERE node_id = nodes.id) AS due FROM nodes WHERE ${UNSCORED}`);
  await db.run(BACKFILL);
  for (const { id, due } of pending) await appendInitialReviewVersion(db, id, due);
}

async function appendInitialReviewVersion(db: DbPort, id: string, due: string) {
  const previous = await loadCurrentSyncNodeRecord(db, id);
  const node = await loadCompanionWorkspaceNodeFromDb(db, id);
  if (!node) throw new Error('initial_review_schedule_node_missing');
  const [host] = await db.query<{ value: string }>("SELECT value FROM companion_meta WHERE key = 'host_name'");
  const hostName = previous?.host_name ?? host?.value;
  if (!hostName) throw new Error('initial_review_schedule_host_missing');
  const snapshot = previous ? { ...previous.snapshot, initial_review_due: due } : null;
  const record = previous && snapshot ? { ...previous, snapshot, version_id: createOpaqueVersionRef(crypto.randomUUID()),
    parent_version_id: previous.version_id, parent_version_ids: previous.version_id ? [previous.version_id] : [],
    content_hash: topicTextSnapshotHash({ ...snapshot, content: previous.body_text ?? snapshot.content ?? '' }) }
    : await toWorkspaceNativeNodeVersion({ ...node, initialReviewDue: due }, hostName);
  const statement = buildRemoteNodeVersionUpsert(record);
  if (!statement) throw new Error('initial_review_schedule_version_missing');
  await db.run(statement.sql, statement.params);
  if (record.parent_version_id) await db.run(
    'INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)',
    [record.version_id, record.parent_version_id]);
  await db.run('UPDATE nodes SET current_version_id = ?, sync_dirty = 0 WHERE id = ?', [record.version_id, id]);
  await upsertAppliedNodeSyncState(db, record, { syncDirty: 1, baseContentHash: previous?.content_hash ?? null });
}
