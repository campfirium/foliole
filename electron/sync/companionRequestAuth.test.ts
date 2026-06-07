import crypto from 'node:crypto';
import type http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

const pairingStoreMock = vi.hoisted(() => ({
  loadPairedCompanionDevice: vi.fn()
}));

vi.mock('./companionPairingStore.js', () => pairingStoreMock);

import { authenticateCompanionRequest, clearCompanionRequestNonceCache } from './companionRequestAuth.js';

const DEVICE_ID = 'paired-device-1';
const DEVICE_SECRET = 'paired-device-secret';
const NOW_MS = Date.parse('2026-05-01T10:00:00.000Z');
const TIMESTAMP = new Date(NOW_MS).toISOString();
const AUTH_WINDOW_MS = 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT = 2_048;

afterEach(() => {
  clearCompanionRequestNonceCache();
  vi.clearAllMocks();
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

function signedHeaders(args: { nonce: string; signature?: string; timestamp?: string }) {
  const timestamp = args.timestamp ?? TIMESTAMP;
  return {
    'x-device-id': DEVICE_ID,
    'x-nonce': args.nonce,
    'x-signature': args.signature ?? sign({ nonce: args.nonce, timestamp }),
    'x-timestamp': timestamp
  };
}

function mockPairedDevice() {
  pairingStoreMock.loadPairedCompanionDevice.mockReturnValue({
    device_id: DEVICE_ID,
    device_secret: DEVICE_SECRET
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
  })).toEqual({ device_id: DEVICE_ID, ok: true });
}

function assertRejectsReplayedSignedRequests() {
  mockPairedDevice();
  const nonce = 'nonce-2';
  const request = createRequest(signedHeaders({ nonce }));

  expect(authenticateCompanionRequest({ nowMs: NOW_MS, request })).toEqual({ device_id: DEVICE_ID, ok: true });
  expect(authenticateCompanionRequest({ nowMs: NOW_MS, request })).toMatchObject({
    error: 'replayed_nonce',
    ok: false,
    status_code: 409
  });
}

function assertPrunesExpiredNoncesBeforeCapacityEviction() {
  mockPairedDevice();
  const expiredNonceTimestamp = new Date(NOW_MS).toISOString();
  const sentinelNowMs = NOW_MS + AUTH_WINDOW_MS + 1;
  const sentinelTimestamp = new Date(sentinelNowMs).toISOString();
  const replayNowMs = sentinelNowMs + AUTH_WINDOW_MS;
  const sentinelNonce = 'sentinel-live-nonce';

  expect(authenticateCompanionRequest({
    nowMs: sentinelNowMs,
    request: createRequest(signedHeaders({ nonce: sentinelNonce, timestamp: sentinelTimestamp }))
  })).toEqual({ device_id: DEVICE_ID, ok: true });

  for (let index = 0; index < NONCE_CACHE_LIMIT; index += 1) {
    const nonce = `expired-nonce-${index}`;
    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest(signedHeaders({ nonce, timestamp: expiredNonceTimestamp }))
    })).toEqual({ device_id: DEVICE_ID, ok: true });
  }

  expect(replayNowMs).toBe(NOW_MS + NONCE_TTL_MS + 1);
  expect(authenticateCompanionRequest({
    nowMs: replayNowMs,
    request: createRequest(signedHeaders({ nonce: 'fresh-trigger-nonce', timestamp: new Date(replayNowMs).toISOString() }))
  })).toEqual({ device_id: DEVICE_ID, ok: true });
  expect(authenticateCompanionRequest({
    nowMs: replayNowMs,
    request: createRequest(signedHeaders({ nonce: sentinelNonce, timestamp: sentinelTimestamp }))
  })).toMatchObject({
    error: 'replayed_nonce',
    ok: false,
    status_code: 409
  });
}

describe('companion request auth', () => {
  it('does not consume nonce values before a request signature is valid', () => {
    assertInvalidSignatureDoesNotConsumeNonce();
  });

  it('still rejects replayed signed requests after consuming a valid nonce', () => {
    assertRejectsReplayedSignedRequests();
  });

  it('prunes expired nonce entries before applying the capacity eviction boundary', () => {
    assertPrunesExpiredNoncesBeforeCapacityEviction();
  });
});
