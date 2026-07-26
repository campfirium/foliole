#!/usr/bin/env node
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

register('../android/ts-js-extension-loader.mjs', import.meta.url);

const {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerSettingsSignature,
  getReviewSchedulerVersion, normalizeReviewSchedulerSettings
} = await import('../../lib/core/review/settings.ts');

type AuditPhase = 'prepare' | 'capture' | 'restart';
type Sqlite = InstanceType<typeof Database>;
type Section<T> = { error?: string; status: 'available' | 'invalid' | 'missing'; value?: T };

interface AuditContext {
  checkpoint: AuditPhase; commitSha: string; deploymentRunId: string; deviceIdentity: string; runId: string;
}

interface AcceptanceSession {
  commitSha: string; deploymentRunId: string; deviceIdentity: string; fsrsNodeId: string; readingNodeIds: string[];
}

const DEFAULT_SIGNATURE = getReviewSchedulerSettingsSignature(DEFAULT_REVIEW_SCHEDULER_SETTINGS);

function section<T>(read: () => T, missing: (error: Error) => boolean = () => false): Section<T> {
  try { return { status: 'available', value: read() }; } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return { error: error.message, status: missing(error) ? 'missing' : 'invalid' };
  }
}

function credentialSafeEndpoint(value: string) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of url.searchParams.keys()) {
      if (/token|secret|password|credential|key/iu.test(key)) url.searchParams.set(key, '[credential-omitted]');
    }
    return url.toString().replace(/\/$/u, '');
  } catch { return value; }
}

function readScheduler(db: Sqlite): Section<Record<string, unknown>> {
  const row = db.prepare(
    "SELECT value_json, updated_at, device_id FROM setting_records WHERE key = 'review_scheduler_settings' " +
    'AND deleted_at IS NULL ORDER BY updated_at DESC, device_id DESC LIMIT 1'
  ).get() as { device_id: string; updated_at: string; value_json: string } | undefined;
  if (!row) return { error: 'review scheduler settings are missing', status: 'missing' };
  const record = { deviceId: row.device_id, rawValue: row.value_json, settingsUpdatedAt: row.updated_at };
  let payload: unknown;
  try { payload = JSON.parse(row.value_json); } catch {
    return { error: 'review scheduler settings are malformed', status: 'invalid', value: record };
  }
  let settings;
  try { settings = normalizeReviewSchedulerSettings(payload); } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return { error: `review scheduler settings are invalid: ${error}`, status: 'invalid', value: { ...record, rawValue: payload } };
  }
  const signature = getReviewSchedulerSettingsSignature(settings);
  const value = {
    ...record, rawValue: payload, schedulerVersion: getReviewSchedulerVersion(settings), settings
  };
  return signature === DEFAULT_SIGNATURE
    ? { error: 'review scheduler settings are still default', status: 'invalid', value }
    : { status: 'available', value };
}

function selectPrepareSession(db: Sqlite, now: string) {
  const fsrs = db.prepare(
    'SELECT n.id, r.due FROM nodes n JOIN node_review r ON r.node_id = n.id ' +
    "WHERE n.deleted_at IS NULL AND TRIM(COALESCE(n.reveal, '')) <> '' AND r.due <= ? ORDER BY r.due, n.id LIMIT 1"
  ).get(now) as { due: string; id: string } | undefined;
  const reading = db.prepare(
    'SELECT n.id, r.next_at FROM nodes n JOIN node_reading r ON r.node_id = n.id ' +
    "WHERE n.deleted_at IS NULL AND r.state = 'active' AND r.next_at <= ? ORDER BY r.next_at, n.id LIMIT 3"
  ).all(now) as Array<{ id: string; next_at: string }>;
  const value = {
    fsrsCandidate: fsrs ?? null, fsrsNodeId: fsrs?.id ?? null, readingCandidates: reading,
    readingNodeIds: reading.map(({ id }) => id), required: { fsrs: 1, reading: 3 }, source: 'database_selection'
  };
  return fsrs && reading.length >= 3 ? { status: 'available' as const, value } : {
    error: `review acceptance data is insufficient: fsrs=${fsrs ? 1 : 0}, reading=${reading.length}, required=1+3`,
    status: 'invalid' as const, value
  };
}

function outgoingState(db: Sqlite, objectType: string, objectId: string) {
  const row = db.prepare(
    'SELECT sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1'
  ).get(objectType, objectId) as { sync_dirty: number } | undefined;
  return { recordPresent: Boolean(row), syncDirty: row?.sync_dirty ?? null };
}

function reviewLogOutgoing(db: Sqlite, log: { op_id: string; reviewed_at: string } | undefined, cursorValue: string | null) {
  if (!log) return 'none';
  if (!cursorValue) return 'pending';
  try {
    const cursor = JSON.parse(cursorValue) as { change_id?: string; created_at?: string };
    return cursor.created_at && (cursor.created_at > log.reviewed_at
      || (cursor.created_at === log.reviewed_at && (cursor.change_id ?? '') >= log.op_id)) ? 'synced' : 'pending';
  } catch { return 'pending'; }
}

function fsrsAudit(db: Sqlite, nodeId: string, cursorValue: string | null) {
  const state = db.prepare(
    'SELECT due, last_review_at, state, reps, lapses FROM node_review WHERE node_id = ? LIMIT 1'
  ).get(nodeId) as Record<string, unknown> | undefined;
  if (!state) throw new Error('selected FSRS item is missing');
  const log = db.prepare(
    'SELECT id, op_id, reviewed_at, scheduler_version FROM review_log WHERE node_id = ? ORDER BY reviewed_at DESC, id DESC LIMIT 1'
  ).get(nodeId) as { id: string; op_id: string; reviewed_at: string; scheduler_version: string } | undefined;
  return {
    itemKind: 'fsrs', latestReviewLog: log ?? null, nodeId, outgoing: outgoingState(db, 'node_review', nodeId),
    reviewLogCount: Number((db.prepare('SELECT COUNT(*) AS count FROM review_log WHERE node_id = ?').get(nodeId) as { count: number }).count),
    reviewLogOutgoing: reviewLogOutgoing(db, log, cursorValue), ...state
  };
}

function readingAudit(db: Sqlite, nodeId: string) {
  const state = db.prepare(
    'SELECT last_handled_at, next_at, repetition_count, state FROM node_reading WHERE node_id = ? LIMIT 1'
  ).get(nodeId) as Record<string, unknown> | undefined;
  if (!state) throw new Error('selected Reading item is missing');
  return { itemKind: 'reading', nodeId, outgoing: outgoingState(db, 'node_reading', nodeId), ...state };
}

function readPairing(db: Sqlite) {
  const row = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'workspace_sync_endpoint_url' LIMIT 1"
  ).get() as { value: string } | undefined;
  const endpointUrl = row?.value ? credentialSafeEndpoint(row.value) : null;
  const target = !endpointUrl ? 'unpaired'
    : /^https?:\/\/(?:127\.0\.0\.1|localhost):38641(?:\/|$)/u.test(endpointUrl) ? 'windows_executor' : 'remote_peer';
  return { endpointUrl, target };
}

function readSync(db: Sqlite) {
  const cursorRow = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'sync_review_log_push_cursor' LIMIT 1"
  ).get() as { value: string } | undefined;
  const eventsRow = db.prepare(
    "SELECT value FROM companion_meta WHERE key = 'workspace_sync_events' LIMIT 1"
  ).get() as { value: string } | undefined;
  const events = eventsRow?.value ? JSON.parse(eventsRow.value) as Array<Record<string, unknown>> : [];
  return {
    recentEvents: events.slice(0, 12).map((event) => ({
      endpointUrl: typeof event.endpoint_url === 'string' ? credentialSafeEndpoint(event.endpoint_url) : null,
      kind: event.kind ?? null, message: event.message ?? null, occurredAt: event.occurred_at ?? null,
      result: event.result ?? null, status: event.status ?? null
    })),
    reviewLogPushCursor: cursorRow?.value ?? null
  };
}

export function auditAndroidReviewDatabase(args: {
  context: AuditContext; databasePath: string; session?: AcceptanceSession; now?: string;
}) {
  const db = new Database(args.databasePath, { fileMustExist: true, readonly: true });
  try {
    const scheduler = readScheduler(db);
    const pairing = section(() => readPairing(db));
    const sync = section(() => readSync(db));
    const acceptance = args.session ? { status: 'available' as const, value: {
      fsrsNodeId: args.session.fsrsNodeId, readingNodeIds: args.session.readingNodeIds, source: 'review_session'
    } } : selectPrepareSession(db, args.now ?? new Date().toISOString());
    const selected = acceptance.status === 'available' && acceptance.value.fsrsNodeId ? {
      fsrsNodeId: acceptance.value.fsrsNodeId, readingNodeIds: acceptance.value.readingNodeIds
    } : null;
    const cursor = sync.value?.reviewLogPushCursor ?? null;
    const fsrs = selected ? section(() => fsrsAudit(db, selected.fsrsNodeId, cursor)) : { status: 'missing' as const };
    const reading = selected ? selected.readingNodeIds.map((id) => section(() => readingAudit(db, id))) : [];
    const issues = [
      { name: 'scheduler', section: scheduler }, { name: 'pairing', section: pairing },
      { name: 'sync', section: sync }, { name: 'acceptance', section: acceptance },
      { name: 'fsrs', section: fsrs }, ...reading.map((entry, index) => ({ name: `reading[${index}]`, section: entry }))
    ].filter(({ section: entry }) => entry.status !== 'available')
      .map(({ name, section: entry }) => ({ error: entry.error ?? null, name, status: entry.status }));
    const errorCode = scheduler.status === 'missing' ? 'review_scheduler_settings_missing'
      : scheduler.status === 'invalid' ? 'review_scheduler_settings_invalid'
        : acceptance.status !== 'available' ? 'review_acceptance_data_insufficient'
          : issues.length ? 'review_audit_data_invalid' : null;
    return {
      ...args.context, acceptance, capturedAt: new Date().toISOString(), errorCode, fsrs, issues, pairing, reading,
      resultStatus: issues.length ? 'failure' : 'success', scheduler, schemaVersion: 2, selected, sync
    };
  } finally { db.close(); }
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
  const temporary = `${values.output}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(audit, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, values.output);
  if (audit.resultStatus === 'failure') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) {
    console.error(`[windows-android-lab-review-audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
