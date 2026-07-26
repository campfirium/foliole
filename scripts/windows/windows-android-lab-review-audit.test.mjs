// @vitest-environment node
/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  if (settings) {
    db.prepare('INSERT INTO setting_records VALUES (?, ?, ?, ?, NULL)').run(
      'review_scheduler_settings', JSON.stringify(settings), '2026-07-25T00:00:00.000Z', 'desktop'
    );
  }
  db.prepare('INSERT INTO nodes VALUES (?, ?, NULL, ?, ?)').run('fsrs-1', 'answer', 'private body', 'private title');
  db.prepare('INSERT INTO node_review VALUES (?, ?, NULL, 2, 4, 1)').run('fsrs-1', '2026-07-25T00:00:00.000Z');
  for (const id of ['read-1', 'read-2', 'read-3']) {
    db.prepare('INSERT INTO nodes VALUES (?, NULL, NULL, ?, ?)').run(id, `secret ${id}`, `title ${id}`);
    db.prepare('INSERT INTO node_reading VALUES (?, ?, ?, 1, ?)').run(
      id, '2026-07-24T00:00:00.000Z', '2026-07-25T00:00:00.000Z', 'active'
    );
  }
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_endpoint_url', 'http://127.0.0.1:38641');
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_events', JSON.stringify([{
    endpoint_url: 'http://127.0.0.1:38641', kind: 'run_finished', message: 'Desktop identity rejected.',
    occurred_at: '2026-07-25T01:00:00.000Z', result: 'failed', status: 'failed'
  }]));
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
    expect(audit.resultStatus).toBe('success');
    expect(audit.selected).toEqual({ fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3'] });
    expect(audit.pairing.value).toEqual({ endpointUrl: 'http://127.0.0.1:38641', target: 'windows_executor' });
    expect(audit.scheduler.value).toMatchObject({ deviceId: 'desktop', rawValue: { desiredRetention: 0.85 } });
    expect(audit.fsrs.value).toMatchObject({ nodeId: 'fsrs-1', outgoing: { recordPresent: false, syncDirty: null } });
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
    expect(audit.reading.map(({ value }) => value.nodeId)).toEqual(['read-3', 'read-2', 'read-1']);
  });

  it('keeps fixed pairing, sync, and acceptance diagnostics when scheduler settings are missing', () => {
    const audit = auditAndroidReviewDatabase({
      context, databasePath: createDatabase(null), now: '2026-07-26T00:00:00.000Z'
    });
    expect(audit).toMatchObject({
      acceptance: { status: 'available' }, pairing: { status: 'available' }, resultStatus: 'failure',
      errorCode: 'review_scheduler_settings_missing', issues: [{ name: 'scheduler', status: 'missing' }],
      scheduler: { error: 'review scheduler settings are missing', status: 'missing' },
      sync: { status: 'available', value: {
        recentEvents: [{ message: 'Desktop identity rejected.', result: 'failed', status: 'failed' }],
        reviewLogPushCursor: null
      } }
    });
    expect(audit.selected).toEqual({ fsrsNodeId: 'fsrs-1', readingNodeIds: ['read-1', 'read-2', 'read-3'] });
  });

  it('reports default settings and acceptance gaps without suppressing either failure', () => {
    const databasePath = createDatabase(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
    const db = new Database(databasePath);
    db.exec("DELETE FROM node_reading WHERE node_id IN ('read-2', 'read-3')");
    db.close();
    const audit = auditAndroidReviewDatabase({ context, databasePath });
    expect(audit.scheduler).toMatchObject({ status: 'invalid', error: 'review scheduler settings are still default' });
    expect(audit.scheduler.value).toMatchObject({ deviceId: 'desktop', rawValue: DEFAULT_REVIEW_SCHEDULER_SETTINGS });
    expect(audit.acceptance).toMatchObject({
      status: 'invalid', value: { readingNodeIds: ['read-1'], required: { fsrs: 1, reading: 3 } }
    });
    expect(audit.acceptance.error).toContain('fsrs=1, reading=1, required=1+3');
    expect(audit.resultStatus).toBe('failure');
  });

  it('keeps the internal pairing target while omitting unrelated URL credentials', () => {
    const databasePath = createDatabase();
    const db = new Database(databasePath);
    db.prepare("UPDATE companion_meta SET value = ? WHERE key = 'workspace_sync_endpoint_url'")
      .run('https://operator:password@lab.internal/sync?workspace=foliole&token=secret-token');
    db.close();
    const audit = auditAndroidReviewDatabase({ context, databasePath });
    expect(audit.pairing.value.endpointUrl).toContain('lab.internal/sync?workspace=foliole');
    expect(audit.pairing.value.endpointUrl).toContain('token=%5Bcredential-omitted%5D');
    expect(JSON.stringify(audit)).not.toContain('password');
    expect(JSON.stringify(audit)).not.toContain('secret-token');
  });

  it('writes failure evidence before the audit CLI exits nonzero', () => {
    const databasePath = createDatabase(null);
    const output = path.join(path.dirname(databasePath), 'review-audit.json');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types', path.resolve('scripts/windows/windows-android-lab-review-audit.ts'),
      '--checkpoint', 'prepare', '--commit', context.commitSha, '--database', databasePath,
      '--deployment-run', context.deploymentRunId, '--device', context.deviceIdentity,
      '--output', output, '--run', context.runId
    ], { cwd: process.cwd(), encoding: 'utf8', env: process.env });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toMatchObject({
      pairing: { status: 'available' }, resultStatus: 'failure', scheduler: { status: 'missing' },
      sync: { status: 'available' }
    });
  });
});
