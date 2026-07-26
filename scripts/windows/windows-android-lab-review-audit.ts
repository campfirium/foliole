#!/usr/bin/env node
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

register('../android/ts-js-extension-loader.mjs', import.meta.url);

const {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getReviewSchedulerSettingsSignature,
  getReviewSchedulerVersion,
  normalizeReviewSchedulerSettings
} = await import('../../lib/core/review/settings.ts');

type AuditPhase = 'prepare' | 'capture' | 'restart';
type Sqlite = InstanceType<typeof Database>;

interface AuditContext {
  checkpoint: AuditPhase;
  commitSha: string;
  deploymentRunId: string;
  deviceIdentity: string;
  runId: string;
}

interface AcceptanceSession {
  commitSha: string;
  deploymentRunId: string;
  deviceIdentity: string;
  fsrsNodeId: string;
  readingNodeIds: string[];
}

const DEFAULT_SIGNATURE = getReviewSchedulerSettingsSignature(DEFAULT_REVIEW_SCHEDULER_SETTINGS);

function latestSettings(db: Sqlite) {
  const row = db.prepare(
    "SELECT value_json, updated_at FROM setting_records WHERE key = 'review_scheduler_settings' AND deleted_at IS NULL " +
    'ORDER BY updated_at DESC, device_id DESC LIMIT 1'
  ).get() as { updated_at: string; value_json: string } | undefined;
  if (!row) throw new Error('review scheduler settings are missing');
  let payload: unknown;
  try { payload = JSON.parse(row.value_json); } catch { throw new Error('review scheduler settings are malformed'); }
  const settings = normalizeReviewSchedulerSettings(payload);
  const signature = getReviewSchedulerSettingsSignature(settings);
  if (signature === DEFAULT_SIGNATURE) throw new Error('review scheduler settings are still default');
  return { schedulerVersion: getReviewSchedulerVersion(settings), settingsUpdatedAt: row.updated_at };
}

function selectPrepareSession(db: Sqlite, now: string): AcceptanceSession {
  const fsrs = db.prepare(
    'SELECT n.id FROM nodes n JOIN node_review r ON r.node_id = n.id ' +
    "WHERE n.deleted_at IS NULL AND TRIM(COALESCE(n.reveal, '')) <> '' AND r.due <= ? ORDER BY r.due, n.id LIMIT 1"
  ).get(now) as { id: string } | undefined;
  const reading = db.prepare(
    'SELECT n.id FROM nodes n JOIN node_reading r ON r.node_id = n.id ' +
    "WHERE n.deleted_at IS NULL AND r.state = 'active' AND r.next_at <= ? ORDER BY r.next_at, n.id LIMIT 3"
  ).all(now) as Array<{ id: string }>;
  if (!fsrs || reading.length < 3) throw new Error('review acceptance data is insufficient');
  return { commitSha: '', deploymentRunId: '', deviceIdentity: '', fsrsNodeId: fsrs.id, readingNodeIds: reading.map(({ id }) => id) };
}

function outgoingState(db: Sqlite, objectType: string, objectId: string) {
  const row = db.prepare(
    'SELECT sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1'
  ).get(objectType, objectId) as { sync_dirty: number } | undefined;
  return row?.sync_dirty === 1 ? 'dirty' : 'clean';
}

function reviewLogOutgoing(db: Sqlite, log: { op_id: string; reviewed_at: string } | undefined) {
  if (!log) return 'none';
  const row = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'sync_review_log_push_cursor' LIMIT 1"
  ).get() as { value: string } | undefined;
  if (!row?.value) return 'pending';
  try {
    const cursor = JSON.parse(row.value) as { change_id?: string; created_at?: string };
    return cursor.created_at && (cursor.created_at > log.reviewed_at
      || (cursor.created_at === log.reviewed_at && (cursor.change_id ?? '') >= log.op_id)) ? 'synced' : 'pending';
  } catch {
    return 'pending';
  }
}

function fsrsAudit(db: Sqlite, nodeId: string) {
  const state = db.prepare(
    'SELECT due, last_review_at, state, reps, lapses FROM node_review WHERE node_id = ? LIMIT 1'
  ).get(nodeId) as Record<string, unknown> | undefined;
  if (!state) throw new Error('selected FSRS item is missing');
  const log = db.prepare(
    'SELECT op_id, reviewed_at, scheduler_version FROM review_log WHERE node_id = ? ORDER BY reviewed_at DESC, id DESC LIMIT 1'
  ).get(nodeId) as { op_id: string; reviewed_at: string; scheduler_version: string } | undefined;
  return {
    dirty: outgoingState(db, 'node_review', nodeId), itemKind: 'fsrs', nodeId,
    reviewLogCount: Number((db.prepare('SELECT COUNT(*) AS count FROM review_log WHERE node_id = ?').get(nodeId) as { count: number }).count),
    reviewLogOutgoing: reviewLogOutgoing(db, log), schedulerVersion: log?.scheduler_version ?? null, ...state
  };
}

function readingAudit(db: Sqlite, nodeId: string) {
  const state = db.prepare(
    'SELECT last_handled_at, next_at, repetition_count, state FROM node_reading WHERE node_id = ? LIMIT 1'
  ).get(nodeId) as Record<string, unknown> | undefined;
  if (!state) throw new Error('selected Reading item is missing');
  return { dirty: outgoingState(db, 'node_reading', nodeId), itemKind: 'reading', nodeId, ...state };
}

function pairingTarget(db: Sqlite) {
  const row = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'workspace_sync_endpoint_url' LIMIT 1"
  ).get() as { value: string } | undefined;
  if (!row?.value) return 'unpaired';
  return /^https?:\/\/(?:127\.0\.0\.1|localhost):38641(?:\/|$)/u.test(row.value) ? 'windows_executor' : 'remote_peer';
}

export function auditAndroidReviewDatabase(args: {
  context: AuditContext;
  databasePath: string;
  session?: AcceptanceSession;
  now?: string;
}) {
  const db = new Database(args.databasePath, { fileMustExist: true, readonly: true });
  try {
    const scheduler = latestSettings(db);
    const selected = args.session ?? selectPrepareSession(db, args.now ?? new Date().toISOString());
    return {
      ...args.context, capturedAt: new Date().toISOString(), fsrs: fsrsAudit(db, selected.fsrsNodeId),
      pairingTarget: pairingTarget(db), reading: selected.readingNodeIds.map((id) => readingAudit(db, id)),
      scheduler, schemaVersion: 1,
      selected: { fsrsNodeId: selected.fsrsNodeId, readingNodeIds: selected.readingNodeIds }
    };
  } finally {
    db.close();
  }
}

function parseCli(argv: string[]) {
  const values = Object.fromEntries(argv.reduce<Array<[string, string]>>((entries, key, index) => {
    if (key.startsWith('--') && argv[index + 1]) entries.push([key.slice(2), argv[index + 1]]);
    return entries;
  }, []));
  const checkpoint = values.checkpoint as AuditPhase;
  if (!['prepare', 'capture', 'restart'].includes(checkpoint)) throw new Error('invalid review checkpoint');
  for (const key of ['commit', 'database', 'deployment-run', 'device', 'output', 'run']) {
    if (!values[key]) throw new Error(`missing --${key}`);
  }
  return { checkpoint, values };
}

function main() {
  const { checkpoint, values } = parseCli(process.argv.slice(2));
  const session = values.session ? JSON.parse(fs.readFileSync(values.session, 'utf8')) as AcceptanceSession : undefined;
  const audit = auditAndroidReviewDatabase({
    context: {
      checkpoint, commitSha: values.commit, deploymentRunId: values['deployment-run'],
      deviceIdentity: values.device, runId: values.run
    }, databasePath: values.database, session
  });
  fs.writeFileSync(values.output, `${JSON.stringify(audit, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) {
    console.error(`[windows-android-lab-review-audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
