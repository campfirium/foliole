// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings';
import { auditAndroidReviewDatabase } from './windows-android-lab-review-audit';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createDatabase(settings = { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: 0.85 }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-review-audit-'));
  roots.push(root);
  const databasePath = path.join(root, 'review.db');
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, reveal TEXT, deleted_at TEXT, content TEXT, title TEXT);
    CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT, last_review_at TEXT, state INTEGER, reps INTEGER, lapses INTEGER);
    CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, last_handled_at TEXT, next_at TEXT, repetition_count INTEGER, state TEXT);
    CREATE TABLE review_log (id TEXT PRIMARY KEY, op_id TEXT, node_id TEXT, scheduler_version TEXT, reviewed_at TEXT);
    CREATE TABLE setting_records (key TEXT, value_json TEXT, updated_at TEXT, device_id TEXT, deleted_at TEXT);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, sync_dirty INTEGER);
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.prepare('INSERT INTO setting_records VALUES (?, ?, ?, ?, NULL)').run(
    'review_scheduler_settings', JSON.stringify(settings), '2026-07-25T00:00:00.000Z', 'desktop'
  );
  db.prepare('INSERT INTO nodes VALUES (?, ?, NULL, ?, ?)').run('fsrs-1', 'answer', 'private body', 'private title');
  db.prepare('INSERT INTO node_review VALUES (?, ?, NULL, 2, 4, 1)').run('fsrs-1', '2026-07-25T00:00:00.000Z');
  for (const id of ['read-1', 'read-2', 'read-3']) {
    db.prepare('INSERT INTO nodes VALUES (?, NULL, NULL, ?, ?)').run(id, `secret ${id}`, `title ${id}`);
    db.prepare('INSERT INTO node_reading VALUES (?, ?, ?, 1, ?)').run(
      id, '2026-07-24T00:00:00.000Z', '2026-07-25T00:00:00.000Z', 'active'
    );
  }
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_endpoint_url', 'http://127.0.0.1:38641');
  db.close();
  return databasePath;
}

const context = {
  checkpoint: 'prepare', commitSha: 'a'.repeat(40), deploymentRunId: '900-aaaaaaaaaaaa',
  deviceIdentity: 'A5-STABLE', runId: '1000-aaaaaaaaaaaa-prepare'
};

describe('Windows Android lab Review audit', () => {
  it('selects one revealed due FSRS item and three due Reading items without content leakage', () => {
    const databasePath = createDatabase();
    const audit = auditAndroidReviewDatabase({
      context, databasePath, now: '2026-07-26T00:00:00.000Z'
    });
    expect(audit.selected).toEqual({ fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3'] });
    expect(audit.pairingTarget).toBe('windows_executor');
    expect(audit.scheduler.schedulerVersion).toContain('dr=0.85');
    expect(Object.keys(audit.fsrs).sort()).toEqual([
      'dirty', 'due', 'itemKind', 'lapses', 'last_review_at', 'nodeId', 'reps',
      'reviewLogCount', 'reviewLogOutgoing', 'schedulerVersion', 'state'
    ]);
    const serialized = JSON.stringify(audit);
    for (const forbidden of ['private body', 'private title', 'secret read', databasePath, 'attachment']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('binds capture to the session objects even when another item becomes earlier', () => {
    const databasePath = createDatabase();
    const audit = auditAndroidReviewDatabase({
      context: { ...context, checkpoint: 'capture', runId: '1001-aaaaaaaaaaaa-capture' },
      databasePath,
      session: {
        commitSha: context.commitSha, deploymentRunId: context.deploymentRunId,
        deviceIdentity: context.deviceIdentity, fsrsNodeId: 'fsrs-1',
        readingNodeIds: ['read-3', 'read-2', 'read-1']
      }
    });
    expect(audit.reading.map(({ nodeId }) => nodeId)).toEqual(['read-3', 'read-2', 'read-1']);
  });

  it('rejects default scheduler settings and insufficient acceptance data', () => {
    expect(() => auditAndroidReviewDatabase({
      context, databasePath: createDatabase(DEFAULT_REVIEW_SCHEDULER_SETTINGS)
    })).toThrow('still default');
  });
});
