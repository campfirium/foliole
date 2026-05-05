import type { DbPort } from './dbPort.js';
import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';
import {
  loadSyncPackSyncObjectsWithDbPort,
  type SyncPackSyncObjectRecord,
  type SyncPackSyncObjectsOptions
} from './syncPackSyncObjectsExecutor.js';

export async function applySyncPackLearningObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'node_reading' || record.object_type === 'node_review');
  for (const record of records) {
    if (record.object_type === 'node_reading') {
      await applyNodeReadingObject(port, record);
    } else {
      await applyNodeReviewObject(port, record);
    }
  }
  return records.length;
}

async function applyNodeReadingObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_reading WHERE node_id = ?', [record.object_id]);
    await port.run('DELETE FROM node_reading_device_state WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO node_reading (` +
    `node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, ` +
    `priority, repetition_count, state` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(node_id) DO UPDATE SET ` +
    `interval_duration_ms = excluded.interval_duration_ms, interval_growth_factor = excluded.interval_growth_factor, ` +
    `last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, priority = excluded.priority, ` +
    `repetition_count = excluded.repetition_count, state = excluded.state`,
    [
      record.object_id,
      integer(payload.interval_duration_ms),
      numberOrNull(payload.interval_growth_factor) ?? 1,
      text(payload.last_handled_at) ?? record.updated_at,
      text(payload.next_at) ?? record.updated_at,
      numberOrNull(payload.priority) ?? 0,
      integer(payload.repetition_count),
      text(payload.state) ?? 'active'
    ]
  );
  if ('reading_position' in payload) {
    await port.run(
      `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at) ` +
      `VALUES (?, ?, ?, ?) ` +
      `ON CONFLICT(node_id, device_id) DO UPDATE SET ` +
      `reading_position = excluded.reading_position, updated_at = excluded.updated_at`,
      [record.object_id, text(payload.device_id) ?? '*', integer(payload.reading_position), record.updated_at]
    );
  }
}

async function applyNodeReviewObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_review WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO node_review (` +
    `node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(node_id) DO UPDATE SET ` +
    `due = excluded.due, last_review_at = excluded.last_review_at, state = excluded.state, ` +
    `stability = excluded.stability, difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days, ` +
    `scheduled_days = excluded.scheduled_days, reps = excluded.reps, lapses = excluded.lapses`,
    [
      record.object_id,
      text(payload.due) ?? record.updated_at,
      text(payload.last_review_at),
      integer(payload.state),
      numberOrNull(payload.stability) ?? 0,
      numberOrNull(payload.difficulty) ?? 0,
      integer(payload.elapsed_days),
      integer(payload.scheduled_days),
      integer(payload.reps),
      integer(payload.lapses)
    ]
  );
}
