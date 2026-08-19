import { isReadingState } from '../review/readingState.js';

import type { DbPort } from './dbPort.js';
import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export interface SyncObjectPayloadApplyOptions {
  hostName?: string;
}

export async function applyNodeReadingObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions = {}
) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_reading WHERE node_id = ?', [record.object_id]);
    await port.run('DELETE FROM node_reading_host_state WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const state = text(payload.state);
  if (!isReadingState(state)) {
    throw new Error('invalid node_reading state');
  }
  const incomingLastHandledAt = text(payload.last_handled_at) ?? record.updated_at;
  const incomingRepetitionCount = integer(payload.repetition_count);
  if (!await shouldApplyNodeReading(
    port,
    record,
    incomingLastHandledAt,
    incomingRepetitionCount
  )) {
    return false;
  }
  await port.run(
    `INSERT INTO node_reading (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET interval_duration_ms = excluded.interval_duration_ms, ` +
    `interval_growth_factor = excluded.interval_growth_factor, last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, ` +
    `priority = excluded.priority, repetition_count = excluded.repetition_count, state = excluded.state`,
    [record.object_id, integer(payload.interval_duration_ms), numberOrNull(payload.interval_growth_factor) ?? 1,
      incomingLastHandledAt, text(payload.next_at) ?? record.updated_at,
      numberOrNull(payload.priority) ?? 0, incomingRepetitionCount, state]
  );
  await applyReadingPosition(port, record, payload, options.hostName);
}

async function shouldApplyNodeReading(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  incomingLastHandledAt: string,
  incomingRepetitionCount: number
) {
  const existing = (await port.query<{
    content_hash: string | null;
    last_handled_at: string;
    repetition_count: number;
  }>(
    `SELECT r.last_handled_at, r.repetition_count, s.content_hash
     FROM node_reading r LEFT JOIN sync_object_state s
       ON s.object_type = 'node_reading' AND s.object_id = r.node_id
     WHERE r.node_id = ?`,
    [record.object_id]
  ))[0];
  if (!existing) return true;
  const incomingKey = [
    incomingLastHandledAt,
    String(incomingRepetitionCount).padStart(12, '0'),
    record.content_hash
  ];
  const existingKey = [
    existing.last_handled_at,
    String(existing.repetition_count).padStart(12, '0'),
    existing.content_hash ?? ''
  ];
  return incomingKey.join('\n') > existingKey.join('\n');
}

export async function applyNodeReviewObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_review WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  const incomingReps = integer(payload.reps);
  if (!await shouldApplyNodeReview(port, record, text(payload.last_review_at), incomingReps)) {
    return false;
  }
  await port.run(
    `INSERT INTO node_review (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET due = excluded.due, ` +
    `last_review_at = excluded.last_review_at, state = excluded.state, stability = excluded.stability, ` +
    `difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days, ` +
    `reps = excluded.reps, lapses = excluded.lapses`,
    [record.object_id, text(payload.due) ?? record.updated_at, text(payload.last_review_at), integer(payload.state),
      numberOrNull(payload.stability) ?? 0, numberOrNull(payload.difficulty) ?? 0, integer(payload.elapsed_days),
      integer(payload.scheduled_days), incomingReps, integer(payload.lapses)]
  );
}

async function shouldApplyNodeReview(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  incomingLastReviewAt: string | null,
  incomingReps: number
) {
  const existing = (await port.query<{ content_hash: string | null; last_review_at: string | null; reps: number }>(
    `SELECT r.last_review_at, r.reps, s.content_hash
     FROM node_review r LEFT JOIN sync_object_state s
       ON s.object_type = 'node_review' AND s.object_id = r.node_id
     WHERE r.node_id = ?`,
    [record.object_id]
  ))[0];
  if (!existing) return true;
  if (incomingReps === 0 && existing.reps > 0) return false;
  const incomingKey = [incomingLastReviewAt ?? '', String(incomingReps).padStart(12, '0'), record.content_hash];
  const existingKey = [existing.last_review_at ?? '', String(existing.reps).padStart(12, '0'), existing.content_hash ?? ''];
  return incomingKey.join('\n') > existingKey.join('\n');
}

async function applyReadingPosition(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  payload: Record<string, unknown>,
  localHostName?: string
) {
  if (!('reading_position' in payload)) return;
  const payloadHostName = text(payload.host_name);
  if (!payloadHostName || payloadHostName !== localHostName) return;
  await port.run(
    `INSERT INTO node_reading_host_state (node_id, host_name, reading_position, updated_at) VALUES (?, ?, ?, ?) ` +
    `ON CONFLICT(node_id, host_name) DO UPDATE SET reading_position = excluded.reading_position, updated_at = excluded.updated_at`,
    [record.object_id, localHostName, integer(payload.reading_position), record.updated_at]
  );
}
