import crypto from 'node:crypto';
import type http from 'node:http';

import { beforeEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const pairingStore = vi.hoisted(() => ({ loadPairedCompanionAuthorization: vi.fn() }));

vi.mock('./companionPairingStore.js', () => pairingStore);
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group-1' }),
  loadSyncGroupMemberByAuthorization: (_groupId: string, authorizationId: string) => ({
    host_name: authorizationId,
    state: 'active'
  })
}));
vi.mock('./workgroupKeyStore.js', () => ({
  consumeDesktopWorkgroupNonce: () => true,
  loadDesktopWorkgroupKey: () => ({ group_key: 'group-secret' })
}));

import { authenticateCompanionRequest, clearCompanionRequestNonceCache } from './companionRequestAuth.js';

const nowMs = Date.parse('2026-08-22T02:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  clearCompanionRequestNonceCache();
});

it('stops an old profile without blocking a current member', () => {
  pairingStore.loadPairedCompanionAuthorization.mockImplementation(profileForAuthorization);
  expect(authenticate('old-auth', 'old-generation'))
    .toEqual({ error: 'sync_protocol_incompatible', ok: false, status_code: 409 });
  expect(authenticate('current-auth', 'current-generation'))
    .toMatchObject({ authorization_id: 'current-auth', ok: true });
});

it('accepts the original authorization after v3 renegotiation', () => {
  pairingStore.loadPairedCompanionAuthorization.mockReturnValue(profile('old-auth', 2));
  expect(authenticate('old-auth', 'before-repair'))
    .toMatchObject({ error: 'sync_protocol_incompatible', ok: false });

  pairingStore.loadPairedCompanionAuthorization.mockReturnValue(profile('old-auth', 3));
  expect(authenticate('old-auth', 'after-repair'))
    .toMatchObject({ authorization_id: 'old-auth', ok: true });
});

function profileForAuthorization(authorizationId: string) {
  return profile(authorizationId, authorizationId === 'old-auth' ? 2 : 3);
}

function profile(authorizationId: string, version: 2 | 3) {
  return {
    authorization_id: authorizationId,
    credential_secret: 'credential-secret',
    negotiated_protocol_version: version,
    remote_protocol: {
      ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      max_supported_version: version,
      min_supported_version: version,
      version
    }
  };
}

function authenticate(authorizationId: string, nonce: string) {
  const timestamp = new Date(nowMs).toISOString();
  const path = '/companion/sync-pack?after_state_seq=7';
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const canonical = ['GET', path, timestamp, nonce, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', 'group-secret').update(canonical).digest('hex');
  const request = {
    headers: {
      'x-authorization-id': authorizationId,
      'x-nonce': nonce,
      'x-signature': signature,
      'x-sync-group-id': 'group-1',
      'x-timestamp': timestamp
    },
    method: 'GET',
    url: path
  } as unknown as http.IncomingMessage;
  return authenticateCompanionRequest({ nowMs, request });
}
