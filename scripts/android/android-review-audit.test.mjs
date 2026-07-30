// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion, normalizeReviewSchedulerSettings
} from '../../lib/core/review/settings';
import { advanceReadingScheduleCoreFields } from '../../src/features/review/model/unifiedPushQueueRules';
import { auditAndroidReviewDatabase } from './android-review-audit';

const roots = [];
const NOW = '2026-07-26T00:00:00.000Z';
const SETTINGS_INPUT = { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: 0.85 };
const SETTINGS = normalizeReviewSchedulerSettings(SETTINGS_INPUT);

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createDatabase(settings = SETTINGS_INPUT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-review-audit-'));
  roots.push(root);
  const databasePath = path.join(root, 'review.db');
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT, priority INTEGER, shelved_at TEXT,
      content TEXT, body_blob_hash TEXT, reveal TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER);
    CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT, last_review_at TEXT, state INTEGER, reps INTEGER, lapses INTEGER);
    CREATE TABLE node_reading (
      node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER, interval_growth_factor REAL,
      last_handled_at TEXT, next_at TEXT, priority INTEGER, repetition_count INTEGER, state TEXT
    );
    CREATE TABLE review_log (id TEXT PRIMARY KEY, op_id TEXT, node_id TEXT, scheduler_version TEXT, reviewed_at TEXT);
    CREATE TABLE setting_records (key TEXT, value_json TEXT, updated_at TEXT, device_id TEXT, deleted_at TEXT);
    CREATE TABLE sync_object_state (
      object_type TEXT, object_id TEXT, state_seq INTEGER, sync_dirty INTEGER, updated_at TEXT
    );
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  if (settings) db.prepare('INSERT INTO setting_records VALUES (?, ?, ?, ?, NULL)').run(
    'review_scheduler_settings', JSON.stringify(settings), '2026-07-25T00:00:00.000Z', 'desktop'
  );
  ['fsrs-1', 'fsrs-2'].forEach((id, index) => {
    insertNode(db, { id, kind: 'item', position: index, reveal: 'private answer' });
    db.prepare('INSERT INTO node_review VALUES (?, ?, NULL, 2, 4, 1)').run(id, '2026-07-25T00:00:00.000Z');
  });
  ['read-1', 'read-2', 'read-3'].forEach((id, index) => {
    insertNode(db, { id, kind: 'topic', position: index + 2, reveal: null });
    db.prepare('INSERT INTO node_reading VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, 86_400_000, 1.5, '2026-07-24T00:00:00.000Z', '2026-07-25T00:00:00.000Z', 0, 1, 'active'
    );
  });
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_endpoint_url', 'http://127.0.0.1:38641');
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_events', JSON.stringify([{
    endpoint_url: 'http://127.0.0.1:38641', kind: 'run_finished', message: 'Desktop identity rejected.',
    occurred_at: '2026-07-25T01:00:00.000Z', result: 'failed', status: 'failed'
  }]));
  db.close();
  return databasePath;
}

function insertNode(db, { id, kind, position, reveal }) {
  db.prepare('INSERT INTO nodes VALUES (?, NULL, ?, 0, NULL, ?, NULL, ?, ?, ?, NULL)').run(
    id, kind, `private body ${id}`, reveal, '2026-07-20T00:00:00.000Z', '2026-07-25T00:00:00.000Z'
  );
  db.prepare('INSERT INTO node_order VALUES (?, ?)').run(id, position);
}

function prepare(databasePath) {
  const audit = auditAndroidReviewDatabase({ checkpoint: 'prepare', databasePath, now: NOW });
  return {
    audit,
    session: {
      baseline: audit.current,
      expectedActions: audit.selected.expectedActions,
      fsrsNodeId: audit.selected.fsrsNodeId,
      fsrsNodeIds: audit.selected.fsrsNodeIds,
      readingNodeIds: audit.selected.readingNodeIds
    }
  };
}

function markOutgoing(db, objectType, objectId, stateSeq) {
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, 1, ?)').run(
    objectType, objectId, stateSeq, `2026-07-26T00:0${stateSeq}:00.000Z`
  );
}

function applyAction(db, action, nodeId, index) {
  if (action === 'grade') {
    db.prepare('UPDATE node_review SET due = ?, last_review_at = ?, reps = reps + 1 WHERE node_id = ?')
      .run('2026-07-30T00:00:00.000Z', `2026-07-26T00:0${index + 1}:00.000Z`, nodeId);
    db.prepare('INSERT INTO review_log VALUES (?, ?, ?, ?, ?)').run(
      `log-${index + 1}`, `op-${index + 1}`, nodeId, getReviewSchedulerVersion(SETTINGS),
      `2026-07-26T00:0${index + 1}:00.000Z`
    );
    markOutgoing(db, 'node_review', nodeId, index + 1);
    return;
  }
  const before = db.prepare(
    'SELECT interval_duration_ms, priority, repetition_count, next_at FROM node_reading WHERE node_id = ?'
  ).get(nodeId);
  const handledAt = `2026-07-26T00:0${index + 1}:00.000Z`;
  if (action === 'dismiss') {
    db.prepare("UPDATE node_reading SET last_handled_at = ?, state = 'dismissed' WHERE node_id = ?").run(handledAt, nodeId);
  } else {
    const next = advanceReadingScheduleCoreFields({
      ...(action === 'later' ? { growthFactorExponent: 0.5 } : {}),
      initialIntervalMs: SETTINGS.pushQueue.readingInitialIntervalMs,
      lastHandledAt: handledAt,
      minimumIntervalMs: SETTINGS.pushQueue.readingInitialIntervalMs,
      previousIntervalDurationMs: before.interval_duration_ms,
      previousRepetitionCount: before.repetition_count,
      priorityChain: [before.priority], range: SETTINGS.pushQueue.readingIntervalGrowthFactorRange
    });
    db.prepare(`UPDATE node_reading SET interval_duration_ms = ?, interval_growth_factor = ?,
      last_handled_at = ?, next_at = ?, priority = ?, repetition_count = ? WHERE node_id = ?`).run(
      next.intervalDurationMs, next.intervalGrowthFactor, next.lastHandledAt, next.nextAt,
      next.priority, next.repetitionCount, nodeId
    );
  }
  markOutgoing(db, 'node_reading', nodeId, index + 1);
}

function applyExpectedActions(databasePath, session, omittedAction = null) {
  const db = new Database(databasePath);
  session.expectedActions.forEach((expected, index) => {
    if (expected.action !== omittedAction) applyAction(db, expected.action, expected.nodeId, index);
  });
  db.close();
}

function capture(databasePath, session) {
  return auditAndroidReviewDatabase({
    checkpoint: 'capture', databasePath, session
  });
}

describe('Android Review audit', () => {
  it('uses shared planner identities and emits a redacted prepare baseline', () => {
    const databasePath = createDatabase();
    const { audit } = prepare(databasePath);
    expect(audit.resultStatus).toBe('success');
    expect(audit.acceptance.value.source).toBe('shared_review_planner');
    expect(audit.current.fsrs.nodeId).toBe('fsrs-1');
    expect(audit.current.fsrsItems.map(({ nodeId }) => nodeId)).toEqual(['fsrs-1', 'fsrs-2']);
    expect(audit.current.reading.map(({ nodeId }) => nodeId)).toEqual(['read-1', 'read-2', 'read-3']);
    const serialized = JSON.stringify(audit);
    for (const forbidden of ['private body', 'private answer', databasePath, 'attachment', 'secret']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('fails capture when the bound database is unchanged', () => {
    const databasePath = createDatabase();
    const { session } = prepare(databasePath);
    const audit = capture(databasePath, session);
    expect(audit.resultStatus).toBe('failure');
    expect(audit.transitions.map(({ code }) => code)).toEqual([
      'review_fsrs_transition_missing', 'review_fsrs_transition_missing',
      'review_reading_read_transition_missing',
      'review_reading_later_transition_missing', 'review_reading_dismiss_transition_missing'
    ]);
  });

  it.each(['grade', 'read', 'later', 'dismiss'])('fails when %s lacks its expected transition', (action) => {
    const databasePath = createDatabase();
    const { session } = prepare(databasePath);
    applyExpectedActions(databasePath, session, action);
    expect(capture(databasePath, session).transitions.map(({ code }) => code))
      .toContain(action === 'grade' ? 'review_fsrs_transition_missing' : `review_reading_${action}_transition_missing`);
  });

  it('accepts all bound transitions and rejects object rebinding', () => {
    const databasePath = createDatabase();
    const { session } = prepare(databasePath);
    applyExpectedActions(databasePath, session);
    const audit = capture(databasePath, session);
    expect(audit.resultStatus).toBe('success');
    const rebound = { ...session, readingNodeIds: [...session.readingNodeIds].reverse() };
    expect(capture(databasePath, rebound).resultStatus).toBe('failure');
  });

  it('compares restart state with the captured permanent state', () => {
    const databasePath = createDatabase();
    const { session } = prepare(databasePath);
    applyExpectedActions(databasePath, session);
    const captured = capture(databasePath, session).current;
    expect(auditAndroidReviewDatabase({
      checkpoint: 'restart', databasePath, session: { ...session, captured }
    }).resultStatus).toBe('success');
    const db = new Database(databasePath);
    db.prepare('UPDATE node_review SET reps = reps - 1 WHERE node_id = ?').run(session.fsrsNodeId);
    db.close();
    expect(auditAndroidReviewDatabase({
      checkpoint: 'restart', databasePath, session: { ...session, captured }
    }).errorCode).toBe('review_restart_rollback');
  });

});
