import crypto from 'node:crypto';
import type http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const pairingStoreMock = vi.hoisted(() => ({
  loadPairedCompanionAuthorization: vi.fn()
}));
const syncGroupStoreMock = vi.hoisted(() => ({
  loadDesktopSyncGroup: vi.fn(() => ({ group_id: 'group-1' })),
  loadSyncGroupMemberByAuthorization: vi.fn((): { host_name: string; state: 'active' } | null => ({ host_name: 'A5', state: 'active' }))
}));
const workgroupKeyStoreMock = vi.hoisted(() => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn((): { group_key: string } | null => ({ group_key: 'paired-device-secret' }))
}));

vi.mock('./companionPairingStore.js', () => pairingStoreMock);
vi.mock('../database/syncGroupStore.js', () => syncGroupStoreMock);
vi.mock('./workgroupKeyStore.js', () => workgroupKeyStoreMock);

import { authenticateCompanionRequest, clearCompanionRequestNonceCache } from './companionRequestAuth.js';

const DEVICE_ID = 'paired-device-1';
const DEVICE_SECRET = 'paired-device-secret';
const SECOND_DEVICE_ID = 'paired-device-2';
const SECOND_DEVICE_SECRET = DEVICE_SECRET;
const NOW_MS = Date.parse('2026-05-01T10:00:00.000Z');
const TIMESTAMP = new Date(NOW_MS).toISOString();
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT_PER_DEVICE = 2_048;

afterEach(() => {
  clearCompanionRequestNonceCache();
  vi.clearAllMocks();
  syncGroupStoreMock.loadDesktopSyncGroup.mockReturnValue({ group_id: 'group-1' });
  syncGroupStoreMock.loadSyncGroupMemberByAuthorization.mockReturnValue({ host_name: 'A5', state: 'active' });
  workgroupKeyStoreMock.loadDesktopWorkgroupKey.mockReturnValue({ group_key: DEVICE_SECRET });
  workgroupKeyStoreMock.consumeDesktopWorkgroupNonce.mockReturnValue(true);
});

function createRequest(headers: http.IncomingHttpHeaders): http.IncomingMessage {
  return {
    headers,
    method: 'GET',
    url: '/companion/workspace-version'
  } as http.IncomingMessage;
}

function sign(args: { nonce: string; pathWithQuery?: string; secret?: string; timestamp?: string }) {
  const pathWithQuery = args.pathWithQuery ?? '/companion/workspace-version';
  const timestamp = args.timestamp ?? TIMESTAMP;
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const canonical = ['GET', pathWithQuery, timestamp, args.nonce, bodyHash].join('\n');
  return crypto.createHmac('sha256', args.secret ?? DEVICE_SECRET).update(canonical).digest('hex');
}

function signedHeaders(args: {
  deviceId?: string;
  nonce: string;
  secret?: string;
  signature?: string;
  timestamp?: string;
}) {
  const timestamp = args.timestamp ?? TIMESTAMP;
  return {
    'x-authorization-id': args.deviceId ?? DEVICE_ID,
    'x-nonce': args.nonce,
    'x-signature': args.signature ?? sign({
      nonce: args.nonce,
      ...(args.secret ? { secret: args.secret } : {}),
      timestamp
    }),
    'x-sync-group-id': 'group-1',
    'x-timestamp': timestamp
  };
}

function mockPairedDevice() {
  const protocolMetadata = {
    negotiated_protocol_version: 1,
    remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  };
  pairingStoreMock.loadPairedCompanionAuthorization.mockImplementation((deviceId: string) => {
    if (deviceId === SECOND_DEVICE_ID) {
      return { ...protocolMetadata, device_id: SECOND_DEVICE_ID, device_secret: SECOND_DEVICE_SECRET };
    }
    if (deviceId === DEVICE_ID) {
      return { ...protocolMetadata, device_id: DEVICE_ID, device_secret: DEVICE_SECRET };
    }
    return null;
  });
}

function assertInvalidSignatureDoesNotConsumeNonce() {
  mockPairedDevice();
  const nonce = 'nonce-1';

  expect(authenticateCompanionRequest({
    nowMs: NOW_MS,
    request: createRequest(signedHeaders({ nonce, signature: sign({ nonce, secret: 'wrong-secret' }) }))
  })).toMatchObject({ error: 'invalid_signature', ok: false });

  expect(authenticateCompanionRequest({
    nowMs: NOW_MS,
    request: createRequest(signedHeaders({ nonce }))
  })).toMatchObject({ device_id: DEVICE_ID, ok: true });
}

function assertRejectsReplayedSignedRequests() {
  mockPairedDevice();
  const nonce = 'nonce-2';
  const request = createRequest(signedHeaders({ nonce }));

  expect(authenticateCompanionRequest({ nowMs: NOW_MS, request })).toMatchObject({ device_id: DEVICE_ID, ok: true });
  expect(authenticateCompanionRequest({ nowMs: NOW_MS, request })).toMatchObject({
    error: 'replayed_nonce',
    ok: false,
    status_code: 409
  });
}

function assertPrunesExpiredNoncesBeforeCapacityEviction() {
  mockPairedDevice();
  const expiredNonceTimestamp = new Date(NOW_MS).toISOString();
  for (let index = 0; index < NONCE_CACHE_LIMIT_PER_DEVICE; index += 1) {
    const nonce = `expired-nonce-${index}`;
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest(signedHeaders({ nonce, timestamp: expiredNonceTimestamp }))
    })).toMatchObject({ device_id: DEVICE_ID, ok: true });
  }

  const replayNowMs = NOW_MS + NONCE_TTL_MS + 1;
  const replayTimestamp = new Date(replayNowMs).toISOString();
  const sentinelNonce = 'sentinel-live-nonce';

  expect(authenticateCompanionRequest({
    nowMs: replayNowMs,
    request: createRequest(signedHeaders({ nonce: sentinelNonce, timestamp: replayTimestamp }))
  })).toMatchObject({ device_id: DEVICE_ID, ok: true });
  expect(authenticateCompanionRequest({
    nowMs: replayNowMs,
    request: createRequest(signedHeaders({ nonce: sentinelNonce, timestamp: replayTimestamp }))
  })).toMatchObject({
    error: 'replayed_nonce',
    ok: false,
    status_code: 409
  });
}

function assertCrossDeviceNonceFloodDoesNotAllowReplay() {
  mockPairedDevice();
  const sentinelNonce = 'device-a-live-nonce';
  const sentinelRequest = createRequest(signedHeaders({ nonce: sentinelNonce }));

  expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: sentinelRequest })).toMatchObject({ device_id: DEVICE_ID, ok: true });

  for (let index = 0; index < NONCE_CACHE_LIMIT_PER_DEVICE + 1; index += 1) {
    const nonce = `device-b-nonce-${index}`;
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest(signedHeaders({
        deviceId: SECOND_DEVICE_ID,
        nonce,
        secret: SECOND_DEVICE_SECRET
      }))
    })).toMatchObject({ device_id: SECOND_DEVICE_ID, ok: true });
  }

  expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: sentinelRequest })).toMatchObject({
    error: 'replayed_nonce',
    ok: false,
    status_code: 409
  });
}

describe('companion request auth', () => {
  it('rejects the legacy Device ID header before authentication', () => {
    mockPairedDevice();
    const { 'x-authorization-id': authorizationId, ...headers } = signedHeaders({ nonce: 'legacy-device-header' });

    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest({ ...headers, 'x-device-id': authorizationId })
    })).toEqual({ error: 'missing_headers', ok: false, status_code: 401 });
    expect(syncGroupStoreMock.loadSyncGroupMemberByAuthorization).not.toHaveBeenCalled();
  });

  it('rejects a valid old credential after its Device is no longer active', () => {
    mockPairedDevice();
    syncGroupStoreMock.loadSyncGroupMemberByAuthorization.mockReturnValue(null);
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request: createRequest({
      ...signedHeaders({ nonce: 'departed-device' }), 'x-sync-group-id': 'group-1'
    }) })).toEqual({
      error: 'sync_group_member_not_authorized', ok: false, status_code: 401
    });
  });

  it('fails closed when the database membership has no safe-storage workgroup key', () => {
    workgroupKeyStoreMock.loadDesktopWorkgroupKey.mockReturnValue(null);

    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest(signedHeaders({ nonce: 'repair-nonce' }))
    })).toEqual({
      error: 'sync_group_workgroup_key_missing',
      ok: false,
      status_code: 401
    });
  });

  it('does not consume nonce values before a request signature is valid', () => {
    assertInvalidSignatureDoesNotConsumeNonce();
  });

  it('still rejects replayed signed requests after consuming a valid nonce', () => {
    assertRejectsReplayedSignedRequests();
  });

  it('prunes expired nonce entries before applying the capacity eviction boundary', () => {
    assertPrunesExpiredNoncesBeforeCapacityEviction();
  });

  it('keeps each paired device nonce cache isolated under capacity pressure', () => {
    assertCrossDeviceNonceFloodDoesNotAllowReplay();
  });
});
