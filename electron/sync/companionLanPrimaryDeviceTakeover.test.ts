import { beforeEach, expect, it, vi } from 'vitest';

const takeoverMocks = vi.hoisted(() => ({
  commitPrimaryDeviceToPeer: vi.fn(() => ({
    committedAt: '2026-05-10T00:00:00.000Z',
    primaryDeviceEpoch: 1,
    primaryDeviceId: 'device-android',
    updatedByDeviceId: 'device-android'
  })),
  driver: {},
  loadMaxStateSeq: vi.fn(() => 42)
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: takeoverMocks.driver })
}));
vi.mock('../database/primaryDeviceCommit.js', () => ({
  commitPrimaryDeviceToPeer: takeoverMocks.commitPrimaryDeviceToPeer
}));
vi.mock('../database/syncPackRows.js', () => ({
  loadMaxStateSeq: takeoverMocks.loadMaxStateSeq
}));

beforeEach(() => {
  vi.clearAllMocks();
  takeoverMocks.loadMaxStateSeq.mockReturnValue(42);
});

it('commits a primary device takeover after signed convergence evidence', async () => {
  const { handlePrimaryDeviceTakeover } = await import('./companionLanPrimaryDeviceTakeover.js');

  const result = handlePrimaryDeviceTakeover(JSON.stringify({
    android_pack_cursor: 42,
    candidate_device_id: 'device-android',
    desktop_max_state_seq: 42,
    local_dirty_count: 0,
    pending_ack_count: 0,
    push_issue_count: 0
  }), 'device-android');

  expect(takeoverMocks.commitPrimaryDeviceToPeer).toHaveBeenCalledWith({
    primaryDeviceId: 'device-android',
    updatedByDeviceId: 'device-android'
  });
  expect(takeoverMocks.loadMaxStateSeq).toHaveBeenCalledWith(takeoverMocks.driver);
  expect(result).toEqual({
    ok: true,
    statusCode: 200,
    value: {
      committed_at: '2026-05-10T00:00:00.000Z',
      primary_device_epoch: 1,
      primary_device_id: 'device-android',
      release_ack: true,
      updated_by_device_id: 'device-android'
    }
  });
});

it('rejects takeover when desktop has newer state than Android cursor', async () => {
  const { handlePrimaryDeviceTakeover } = await import('./companionLanPrimaryDeviceTakeover.js');

  const result = handlePrimaryDeviceTakeover(JSON.stringify({
    android_pack_cursor: 41,
    candidate_device_id: 'device-android',
    desktop_max_state_seq: 42,
    local_dirty_count: 0,
    pending_ack_count: 0,
    push_issue_count: 0
  }), 'device-android');

  expect(takeoverMocks.commitPrimaryDeviceToPeer).not.toHaveBeenCalled();
  expect(result).toEqual({
    ok: false,
    statusCode: 409,
    value: { error: 'sync_latest_confirmation_missing' }
  });
});

it('rejects takeover when authenticated device differs from candidate', async () => {
  const { handlePrimaryDeviceTakeover } = await import('./companionLanPrimaryDeviceTakeover.js');

  const result = handlePrimaryDeviceTakeover(JSON.stringify({
    android_pack_cursor: 42,
    candidate_device_id: 'device-android',
    desktop_max_state_seq: 42,
    local_dirty_count: 0,
    pending_ack_count: 0,
    push_issue_count: 0
  }), 'device-other');

  expect(takeoverMocks.commitPrimaryDeviceToPeer).not.toHaveBeenCalled();
  expect(result).toEqual({
    ok: false,
    statusCode: 401,
    value: { error: 'candidate_device_mismatch' }
  });
});

it('rejects malformed takeover json without throwing', async () => {
  const { handlePrimaryDeviceTakeover } = await import('./companionLanPrimaryDeviceTakeover.js');

  const result = handlePrimaryDeviceTakeover('{not-json', 'device-android');

  expect(takeoverMocks.commitPrimaryDeviceToPeer).not.toHaveBeenCalled();
  expect(result).toEqual({
    ok: false,
    statusCode: 400,
    value: { error: 'invalid_primary_device_takeover_payload' }
  });
});
