import type Database from 'better-sqlite3';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getReviewSchedulerSettingsSignature,
  getReviewSchedulerVersion,
  normalizeReviewSchedulerSettings,
  type ReviewSchedulerSettings
} from '../../lib/core/review/settings.ts';

import type {
  FsrsAuditState, OutgoingState, ReadingAuditState, ReviewAuditState, Section
} from './windows-android-lab-review-audit-types.ts';

type Sqlite = InstanceType<typeof Database>;
const DEFAULT_SIGNATURE = getReviewSchedulerSettingsSignature(DEFAULT_REVIEW_SCHEDULER_SETTINGS);

export function section<T>(read: () => T, missing: (error: Error) => boolean = () => false): Section<T> {
  try { return { status: 'available', value: read() }; } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return { error: error.message, status: missing(error) ? 'missing' : 'invalid' };
  }
}

export function readScheduler(db: Sqlite): Section<{
  deviceId: string;
  rawValue: unknown;
  schedulerVersion: string;
  settings: ReviewSchedulerSettings;
  settingsUpdatedAt: string;
}> {
  const row = db.prepare(
    "SELECT value_json, updated_at, device_id FROM setting_records WHERE key = 'review_scheduler_settings' " +
    'AND deleted_at IS NULL ORDER BY updated_at DESC, device_id DESC LIMIT 1'
  ).get() as { device_id: string; updated_at: string; value_json: string } | undefined;
  if (!row) return { error: 'review scheduler settings are missing', status: 'missing' };
  const record = { deviceId: row.device_id, rawValue: row.value_json, settingsUpdatedAt: row.updated_at };
  let payload: unknown;
  try { payload = JSON.parse(row.value_json); } catch {
    return { error: 'review scheduler settings are malformed', status: 'invalid', value: record as never };
  }
  let settings: ReviewSchedulerSettings;
  try { settings = normalizeReviewSchedulerSettings(payload); } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return { error: `review scheduler settings are invalid: ${error}`, status: 'invalid', value: { ...record, rawValue: payload } as never };
  }
  const value = {
    ...record, rawValue: payload, schedulerVersion: getReviewSchedulerVersion(settings), settings
  };
  return getReviewSchedulerSettingsSignature(settings) === DEFAULT_SIGNATURE
    ? { error: 'review scheduler settings are still default', status: 'invalid', value }
    : { status: 'available', value };
}

function outgoingState(db: Sqlite, objectType: string, objectId: string): OutgoingState {
  const row = db.prepare(
    'SELECT state_seq, sync_dirty, updated_at FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1'
  ).get(objectType, objectId) as { state_seq: number; sync_dirty: number; updated_at: string } | undefined;
  return {
    recordPresent: Boolean(row), stateSeq: row?.state_seq ?? null,
    syncDirty: row?.sync_dirty ?? null, updatedAt: row?.updated_at ?? null
  };
}

function reviewLogOutgoing(db: Sqlite, log: { op_id: string; reviewed_at: string } | undefined, cursorValue: string | null) {
  if (!log) return 'none' as const;
  if (!cursorValue) return 'pending' as const;
  try {
    const cursor = JSON.parse(cursorValue) as { change_id?: string; created_at?: string };
    return cursor.created_at && (cursor.created_at > log.reviewed_at
      || (cursor.created_at === log.reviewed_at && (cursor.change_id ?? '') >= log.op_id)) ? 'synced' as const : 'pending' as const;
  } catch { return 'pending' as const; }
}

function fsrsAudit(db: Sqlite, nodeId: string, cursorValue: string | null): FsrsAuditState {
  const state = db.prepare(
    'SELECT due, last_review_at, state, reps, lapses FROM node_review WHERE node_id = ? LIMIT 1'
  ).get(nodeId) as { due: string; lapses: number; last_review_at: string | null; reps: number; state: number } | undefined;
  if (!state) throw new Error('selected FSRS item is missing');
  const log = db.prepare(
    'SELECT id, op_id, reviewed_at, scheduler_version FROM review_log WHERE node_id = ? ORDER BY reviewed_at DESC, id DESC LIMIT 1'
  ).get(nodeId) as { id: string; op_id: string; reviewed_at: string; scheduler_version: string } | undefined;
  return {
    due: state.due, itemKind: 'fsrs', lapses: state.lapses, lastReviewAt: state.last_review_at,
    latestReviewLog: log ? {
      id: log.id, opId: log.op_id, reviewedAt: log.reviewed_at, schedulerVersion: log.scheduler_version
    } : null,
    nodeId, outgoing: outgoingState(db, 'node_review', nodeId), reps: state.reps,
    reviewLogCount: Number((db.prepare('SELECT COUNT(*) AS count FROM review_log WHERE node_id = ?')
      .get(nodeId) as { count: number }).count),
    reviewLogOutgoing: reviewLogOutgoing(db, log, cursorValue), state: state.state
  };
}

function readingAudit(db: Sqlite, nodeId: string): ReadingAuditState {
  const state = db.prepare(
    `SELECT interval_duration_ms, interval_growth_factor, last_handled_at, next_at,
      priority, repetition_count, state FROM node_reading WHERE node_id = ? LIMIT 1`
  ).get(nodeId) as {
    interval_duration_ms: number; interval_growth_factor: number; last_handled_at: string | null;
    next_at: string | null; priority: number; repetition_count: number; state: string;
  } | undefined;
  if (!state) throw new Error('selected Reading item is missing');
  return {
    intervalDurationMs: state.interval_duration_ms, intervalGrowthFactor: state.interval_growth_factor,
    itemKind: 'reading', lastHandledAt: state.last_handled_at, nextAt: state.next_at, nodeId,
    outgoing: outgoingState(db, 'node_reading', nodeId), priority: state.priority,
    repetitionCount: state.repetition_count, state: state.state
  };
}

export function readReviewAuditState(
  db: Sqlite,
  selected: { fsrsNodeId: string; readingNodeIds: string[] },
  schedulerVersion: string,
  cursorValue: string | null
): ReviewAuditState {
  return {
    fsrs: fsrsAudit(db, selected.fsrsNodeId, cursorValue),
    reading: selected.readingNodeIds.map((id) => readingAudit(db, id)),
    schedulerVersion
  };
}
