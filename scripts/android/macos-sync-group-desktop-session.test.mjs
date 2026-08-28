import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  ensureMacosDeviceSyncGroup,
  sanitizeMacosSyncGroupOverview,
  waitForMacosDeviceRequest
} from './macos-sync-group-desktop-session.mjs';

const overview = (overrides = {}) => ({
  current_device: { device_name: 'Mac', platform: 'darwin' },
  join_requests: [], server_status: { last_error: null, port: 38641, state: 'running' },
  sync_enabled: true, sync_group: { devices: [{ device_identity_key: 'device-mac' }],
    group_id: 'group-1' }, sync_paused: false, ...overrides
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
  const load = vi.fn()
    .mockResolvedValueOnce(overview())
    .mockResolvedValue(overview({ join_requests: [request] }));
  await expect(waitForMacosDeviceRequest({ load }, 'A5', {
    now: (() => { let value = 0; return () => value += 10; })(), timeoutMs: 100,
    wait: async () => undefined
  })).resolves.toBe(request);
});

it('observes automatic sync from the source-bound hidden Electron main path', () => {
  const source = fs.readFileSync('scripts/android/macos-sync-group-desktop-session.mjs', 'utf8');
  expect(source).toContain('FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH');
  expect(source).not.toContain("electronApp.getAppPath(), 'sync'");
});
