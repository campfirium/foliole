import crypto from 'node:crypto';
import type http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

const group = vi.hoisted(() => ({
  devices: [
    { device_identity_key: 'device-a', device_name: 'A5', platform: 'darwin', state: 'active' },
    { device_identity_key: 'device-b', device_name: 'Phone', platform: 'ios-capacitor', state: 'active' }
  ] as Array<{ device_identity_key: string; device_name: string; platform: string; state: 'active' | 'left' }>
}));
const workgroup = vi.hoisted(() => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn((): { group_key: string } | null => ({ group_key: 'group-secret' }))
}));
const membership = vi.hoisted(() => ({ blocked: vi.fn(() => false) }));
const readiness = vi.hoisted(() => ({ ready: vi.fn(() => false) }));

vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  isDesktopSyncGroupDeviceBlocked: membership.blocked
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group-1', devices: group.devices })
}));
vi.mock('./desktopSyncGroupMemberStateReadiness.js', () => ({
  isDesktopSyncGroupMemberStateReady: readiness.ready
}));
vi.mock('./workgroupKeyStore.js', () => workgroup);

import { authenticateCompanionRequest, clearCompanionRequestNonceCache } from './companionRequestAuth.js';

const NOW_MS = Date.parse('2026-08-26T10:00:00.000Z');
const TIMESTAMP = new Date(NOW_MS).toISOString();
const PATH = '/companion/workspace-version';

afterEach(() => {
  clearCompanionRequestNonceCache();
  vi.clearAllMocks();
  group.devices = [
    { device_identity_key: 'device-a', device_name: 'A5', platform: 'darwin', state: 'active' },
    { device_identity_key: 'device-b', device_name: 'Phone', platform: 'ios-capacitor', state: 'active' }
  ];
  workgroup.loadDesktopWorkgroupKey.mockReturnValue({ group_key: 'group-secret' });
  workgroup.consumeDesktopWorkgroupNonce.mockReturnValue(true);
  membership.blocked.mockReturnValue(false);
  readiness.ready.mockReturnValue(false);
});

function signature(deviceId: string, nonce: string, secret = 'group-secret') {
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const canonical = ['GET', PATH, TIMESTAMP, nonce, bodyHash].join('\n');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

function request(deviceId: string, nonce: string, secret = 'group-secret') {
  return {
    headers: {
      'x-device-id': deviceId,
      'x-nonce': nonce,
      'x-signature': signature(deviceId, nonce, secret),
      'x-sync-group-id': 'group-1',
      'x-timestamp': TIMESTAMP
    },
    method: 'GET',
    url: PATH
  } as unknown as http.IncomingMessage;
}

describe('Sync Group request authentication', () => {
  it('rejects the retired authorization header', () => {
    const legacy = request('device-a', 'legacy');
    delete legacy.headers['x-device-id'];
    legacy.headers['x-authorization-id'] = 'authorization-a';
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: legacy }))
      .toEqual({ error: 'missing_headers', ok: false, status_code: 401 });
  });

  it('rejects a Device after it leaves the Group', () => {
    group.devices[0]!.state = 'left';
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: request('device-a', 'left') }))
      .toEqual({ error: 'sync_group_device_not_active', ok: false, status_code: 401 });
  });

  it('authenticates an unknown key holder only for member-state exchange', () => {
    expect(authenticateCompanionRequest({
      allowUnknownDevice: true, nowMs: NOW_MS, request: request('device-new', 'unknown')
    })).toEqual({ device_id: 'device-new', device_name: 'device-new', ok: true });
  });

  it('blocks normal data requests after a removal decision', () => {
    membership.blocked.mockReturnValue(true);
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: request('device-a', 'removed') }))
      .toEqual({ error: 'sync_group_device_not_active', ok: false, status_code: 401 });
  });
});

describe('Sync Group member-state data gate', () => {
  it('requires desktop peers to exchange member state before data requests', () => {
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS, request: request('device-a', 'not-ready'), requireMemberState: true
    })).toEqual({ error: 'sync_group_member_state_required', ok: false, status_code: 409 });
    readiness.ready.mockReturnValue(true);
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS, request: request('device-a', 'ready'), requireMemberState: true
    })).toMatchObject({ device_id: 'device-a', ok: true });
  });

  it('requires mobile peers to exchange member state before data requests', () => {
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS, request: request('device-b', 'mobile'), requireMemberState: true
    })).toEqual({ error: 'sync_group_member_state_required', ok: false, status_code: 409 });
  });
});

describe('Sync Group signed request replay protection', () => {
  it('fails closed when the Group key is unavailable', () => {
    workgroup.loadDesktopWorkgroupKey.mockReturnValue(null);
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: request('device-a', 'missing-key') }))
      .toEqual({ error: 'sync_group_workgroup_key_missing', ok: false, status_code: 401 });
  });

  it('rejects an expired request before consuming its nonce', () => {
    const expired = request('device-a', 'nonce-expired');
    expired.headers['x-timestamp'] = '2020-01-01T00:00:00.000Z';

    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: expired }))
      .toEqual({ error: 'expired_timestamp', ok: false, status_code: 401 });
    expect(workgroup.consumeDesktopWorkgroupNonce).not.toHaveBeenCalled();
  });

  it('does not consume a nonce before the Group-key signature is valid', () => {
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS, request: request('device-a', 'nonce-a', 'wrong-key')
    })).toMatchObject({ error: 'invalid_signature', ok: false });
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: request('device-a', 'nonce-a') }))
      .toEqual({ device_id: 'device-a', device_name: 'A5', ok: true });
  });

  it('rejects replay per Device without conflating another Device', () => {
    const first = request('device-a', 'nonce-a');
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: first })).toMatchObject({ ok: true });
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: first }))
      .toEqual({ error: 'replayed_nonce', ok: false, status_code: 409 });
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: request('device-b', 'nonce-a') }))
      .toEqual({ device_id: 'device-b', device_name: 'Phone', ok: true });
  });
});
