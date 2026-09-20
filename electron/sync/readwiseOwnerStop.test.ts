import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  apiActive: false,
  guard: null as null | { epoch: number; groupId: string; mode: 'api' | 'relay';
    ownerId: string; state: 'active' | 'relinquished'; targetId: string | null },
  keepActive: false,
  mode: 'api' as 'api' | 'relay',
  ownerId: 'old-device' as string | null,
  ownerEpoch: 0
}));
const cancel = vi.hoisted(() => vi.fn());

vi.mock('../database/readwiseHostAssignment.js', () => ({
  loadReadwiseHostAssignment: () => ({
    active_device_identity_key: state.ownerId, active_owner_epoch: state.ownerEpoch
  })
}));
vi.mock('../database/readwiseOwnerGuard.js', () => ({
  loadReadwiseOwnerGuard: () => state.guard,
  saveReadwiseOwnerGuard: (guard: typeof state.guard) => { state.guard = guard; }
}));
vi.mock('../database/readwiseSourceMode.js', () => ({
  loadReadwiseSourceModeState: () => ({ mode: state.mode })
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group', local_device_identity_key: 'old-device',
    devices: [{ device_identity_key: 'old-device', platform: 'macOS', state: 'active' },
      { device_identity_key: 'new-device', platform: 'Windows 11', state: 'active' },
      { device_identity_key: 'third-device', platform: 'Windows 11', state: 'active' }] })
}));
vi.mock('../import/keepImportRunnerOwner.js', () => ({
  hasActiveReadwiseKeepImportRuns: () => state.keepActive
}));
vi.mock('../import/readwiseApiImportRun.js', () => ({
  cancelReadwiseApiImport: cancel,
  isReadwiseApiImportActive: () => state.apiActive
}));

import { isReadwiseExecutionStopping } from '../import/readwiseExecutionBarrier.js';

import { handleReadwiseOwnerStop, resumeReadwiseExecutionAfterActivation } from './readwiseOwnerStop.js';

function request(targetId = 'new-device') {
  return JSON.stringify({ epoch: state.ownerEpoch, groupId: 'group', mode: state.mode,
    ownerId: state.ownerId, requestId: 'request-one', targetId });
}

beforeEach(() => {
  state.apiActive = false;
  state.keepActive = false;
  state.guard = null;
  state.mode = 'api';
  state.ownerId = 'old-device';
  state.ownerEpoch = 0;
  cancel.mockReset();
  resumeReadwiseExecutionAfterActivation();
});

it('blocks admission, waits for both runner classes, then persists relinquishment before ACK', () => {
  state.apiActive = true;
  state.keepActive = true;
  expect(handleReadwiseOwnerStop(request(), 'new-device')).toEqual({
    status: 'pending', requestId: 'request-one'
  });
  expect(isReadwiseExecutionStopping()).toBe(true);
  expect(state.guard).toBeNull();
  state.apiActive = false;
  expect(handleReadwiseOwnerStop(request(), 'new-device')).toMatchObject({ status: 'pending' });
  state.keepActive = false;
  expect(handleReadwiseOwnerStop(request(), 'new-device')).toMatchObject({
    status: 'stopped', oldDeviceId: 'old-device', targetId: 'new-device', epoch: 0
  });
  expect(state.guard).toMatchObject({ state: 'relinquished', targetId: 'new-device' });
  expect(cancel).toHaveBeenCalled();
  expect(handleReadwiseOwnerStop(request(), 'new-device')).toMatchObject({ status: 'stopped' });
});

it('rejects a competing candidate and a sender other than the target', () => {
  state.keepActive = true;
  handleReadwiseOwnerStop(request(), 'new-device');
  expect(() => handleReadwiseOwnerStop(request('third-device'), 'third-device'))
    .toThrow('readwise_stop_competing_request');
  expect(() => handleReadwiseOwnerStop(request(), 'old-device'))
    .toThrow('readwise_stop_not_group_desktop');
});

it('allows an unassigned legacy group to stop a non-owner member without claiming it', () => {
  state.ownerId = null;
  expect(handleReadwiseOwnerStop(request(), 'new-device')).toMatchObject({
    status: 'stopped', ownerId: null
  });
  expect(state.guard).toMatchObject({ ownerId: 'old-device', state: 'relinquished' });
});
