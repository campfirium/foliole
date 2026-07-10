import { commitPrimaryDeviceToPeer } from '../database/primaryDeviceCommit.js';
import { loadMaxStateSeq } from '../database/syncPackRows.js';

export const PRIMARY_DEVICE_TAKEOVER_PATH = '/companion/primary-device/takeover';

interface PrimaryDeviceTakeoverRequest {
  android_pack_cursor: number;
  candidate_device_id: string;
  desktop_max_state_seq: number;
  local_dirty_count: number;
  pending_ack_count: number;
  push_issue_count: number;
}

function isTakeoverRequest(value: unknown): value is PrimaryDeviceTakeoverRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.candidate_device_id === 'string'
    && Number.isFinite(record.android_pack_cursor)
    && Number.isFinite(record.desktop_max_state_seq)
    && Number.isFinite(record.local_dirty_count)
    && Number.isFinite(record.pending_ack_count)
    && Number.isFinite(record.push_issue_count);
}

function reject(reason: string, statusCode = 409) {
  return {
    ok: false as const,
    statusCode,
    value: { error: reason }
  };
}

export function handlePrimaryDeviceTakeover(bodyText: string, authenticatedDeviceId: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    return reject('invalid_primary_device_takeover_payload', 400);
  }
  if (!isTakeoverRequest(payload)) {
    return reject('invalid_primary_device_takeover_payload', 400);
  }
  const candidateDeviceId = payload.candidate_device_id.trim();
  if (!candidateDeviceId || candidateDeviceId !== authenticatedDeviceId) {
    return reject('candidate_device_mismatch', 401);
  }
  if (payload.local_dirty_count > 0 || payload.pending_ack_count > 0 || payload.push_issue_count > 0) {
    return reject('candidate_not_converged');
  }
  const currentMaxStateSeq = loadMaxStateSeq();
  if (
    payload.desktop_max_state_seq !== currentMaxStateSeq
    || payload.android_pack_cursor < currentMaxStateSeq
  ) {
    return reject('sync_latest_confirmation_missing');
  }
  const commit = commitPrimaryDeviceToPeer({
    primaryDeviceId: candidateDeviceId,
    updatedByDeviceId: candidateDeviceId
  });
  return {
    ok: true as const,
    statusCode: 200,
    value: {
      committed_at: commit.committedAt,
      primary_device_epoch: commit.primaryDeviceEpoch,
      primary_device_id: commit.primaryDeviceId,
      release_ack: true,
      updated_by_device_id: commit.updatedByDeviceId
    }
  };
}
