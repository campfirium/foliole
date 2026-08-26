import crypto from 'node:crypto';
import type http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

const group = vi.hoisted(() => ({
  devices: [
    { device_identity_key: 'device-a', device_name: 'A5', state: 'active' },
    { device_identity_key: 'device-b', device_name: 'Phone', state: 'active' }
  ] as Array<{ device_identity_key: string; device_name: string; state: 'active' | 'left' }>
}));
const workgroup = vi.hoisted(() => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn((): { group_key: string } | null => ({ group_key: 'group-secret' }))
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group-1', devices: group.devices })
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
    { device_identity_key: 'device-a', device_name: 'A5', state: 'active' },
    { device_identity_key: 'device-b', device_name: 'Phone', state: 'active' }
  ];
  workgroup.loadDesktopWorkgroupKey.mockReturnValue({ group_key: 'group-secret' });
  workgroup.consumeDesktopWorkgroupNonce.mockReturnValue(true);
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

  it('fails closed when the Group key is unavailable', () => {
    workgroup.loadDesktopWorkgroupKey.mockReturnValue(null);
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: request('device-a', 'missing-key') }))
      .toEqual({ error: 'sync_group_workgroup_key_missing', ok: false, status_code: 401 });
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
