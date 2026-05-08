import type { DbPort } from './dbPort.js';
import { asObject, integer, numberOrNull, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export interface SyncObjectPayloadApplyOptions {
  deviceId?: string;
}

export async function applyNodeReadingObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: SyncObjectPayloadApplyOptions = {}
) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_reading WHERE node_id = ?', [record.object_id]);
    await port.run('DELETE FROM node_reading_device_state WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO node_reading (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET interval_duration_ms = excluded.interval_duration_ms, ` +
    `interval_growth_factor = excluded.interval_growth_factor, last_handled_at = excluded.last_handled_at, next_at = excluded.next_at, ` +
    `priority = excluded.priority, repetition_count = excluded.repetition_count, state = excluded.state`,
    [record.object_id, integer(payload.interval_duration_ms), numberOrNull(payload.interval_growth_factor) ?? 1,
      text(payload.last_handled_at) ?? record.updated_at, text(payload.next_at) ?? record.updated_at,
      numberOrNull(payload.priority) ?? 0, integer(payload.repetition_count), text(payload.state) ?? 'active']
  );
  await applyReadingPosition(port, record, payload, options.deviceId);
}

export async function applyNodeReviewObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM node_review WHERE node_id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO node_review (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET due = excluded.due, ` +
    `last_review_at = excluded.last_review_at, state = excluded.state, stability = excluded.stability, ` +
    `difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days, ` +
    `reps = excluded.reps, lapses = excluded.lapses`,
    [record.object_id, text(payload.due) ?? record.updated_at, text(payload.last_review_at), integer(payload.state),
      numberOrNull(payload.stability) ?? 0, numberOrNull(payload.difficulty) ?? 0, integer(payload.elapsed_days),
      integer(payload.scheduled_days), integer(payload.reps), integer(payload.lapses)]
  );
}

async function applyReadingPosition(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  payload: Record<string, unknown>,
  localDeviceId?: string
) {
  if (!('reading_position' in payload)) return;
  const payloadDeviceId = text(payload.device_id);
  if (!payloadDeviceId || payloadDeviceId !== localDeviceId) return;
  await port.run(
    `INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at) VALUES (?, ?, ?, ?) ` +
    `ON CONFLICT(node_id, device_id) DO UPDATE SET reading_position = excluded.reading_position, updated_at = excluded.updated_at`,
    [record.object_id, localDeviceId, integer(payload.reading_position), record.updated_at]
  );
}
