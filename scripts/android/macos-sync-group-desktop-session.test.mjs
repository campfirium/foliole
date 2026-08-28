import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  ensureMacosDeviceSyncGroup,
  sanitizeMacosSyncGroupOverview,
  waitForMacosAutomaticRun,
  waitForMacosDeviceRequest
} from './macos-sync-group-desktop-session.mjs';

const overview = (overrides = {}) => ({
  current_device: { device_name: 'Mac', platform: 'darwin' },
  join_requests: [], server_status: { last_error: null, port: 38641, state: 'running' },
  sync_enabled: true, sync_group: { devices: [{ device_identity_key: 'device-mac' }],
    group_id: 'group-1' }, sync_paused: false, ...overrides
});

it('uses a product apply event when a new automatic run is not yet durable', async () => {
  const waitForEvent = vi.fn(async () => undefined);
  const loadSyncTriggerResult = vi.fn()
    .mockResolvedValueOnce({ reason: 'automatic', run_id: 'old', status: 'completed' })
    .mockResolvedValue({ reason: 'automatic', run_id: 'new', status: 'completed' });
  await expect(waitForMacosAutomaticRun({ loadSyncTriggerResult, waitForEvent }, 'old'))
    .resolves.toMatchObject({ run_id: 'new' });
  expect(waitForEvent).toHaveBeenCalledWith('onWorkspaceSyncApplied', { timeoutMs: 90_000 });
});

it('sanitizes only Device/request facts from the active Sync Group overview', () => {
  expect(sanitizeMacosSyncGroupOverview(overview({
    join_requests: [{ device_name: 'A5', request_id: 'request-1' }]
  }))).toEqual({
    currentDevice: { device_name: 'Mac', platform: 'darwin' }, deviceCount: 1,
    groupId: 'group-1', pendingRequestIds: ['request-1'], serverLastError: null,
    serverPort: 38641, serverState: 'running', syncEnabled: true
  });
});

it('creates, resumes, or enables the single Device group without a legacy selection', async () => {
  const create = vi.fn(async () => 'created');
  const enable = vi.fn(async () => 'enabled');
  const resume = vi.fn(async () => 'resumed');
  await expect(ensureMacosDeviceSyncGroup({ create, enable, resume,
    load: async () => overview({ sync_group: null }) })).resolves.toBe('created');
  await expect(ensureMacosDeviceSyncGroup({ create, enable, resume,
    load: async () => overview({ sync_paused: true }) })).resolves.toBe('resumed');
  await expect(ensureMacosDeviceSyncGroup({ create, enable, resume,
    load: async () => overview() })).resolves.toBe('enabled');
});

it('binds acceptance to the fixed A5 Device request id', async () => {
  const request = { device_name: 'A5', request_id: 'request-a5' };
  const waitForState = vi.fn(async () => overview({ join_requests: [request] }));
  await expect(waitForMacosDeviceRequest({ waitForState }, 'A5', {
    timeoutMs: 100
  })).resolves.toBe(request);
  expect(waitForState).toHaveBeenCalledWith({ command: 'load_sync_group_overview',
    condition: { count: 1, kind: 'join-request-count' },
    eventName: 'onSyncGroupJoinRequestsChanged', timeoutMs: 100 });
});

it('observes automatic sync from the source-bound hidden Electron main path', () => {
  const source = fs.readFileSync('scripts/android/macos-sync-group-desktop-session.mjs', 'utf8');
  expect(source).toContain('FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH');
  expect(source).not.toContain("electronApp.getAppPath(), 'sync'");
});
