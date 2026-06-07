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

function sign(args: { nonce: string; pathWithQuery?: string; secret?: string }) {
  const pathWithQuery = args.pathWithQuery ?? '/companion/workspace-version';
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const canonical = ['GET', pathWithQuery, TIMESTAMP, args.nonce, bodyHash].join('\n');
  return crypto.createHmac('sha256', args.secret ?? DEVICE_SECRET).update(canonical).digest('hex');
}

function signedHeaders(args: { nonce: string; signature?: string }) {
  return {
    'x-device-id': DEVICE_ID,
    'x-nonce': args.nonce,
    'x-signature': args.signature ?? sign({ nonce: args.nonce }),
    'x-timestamp': TIMESTAMP
  };
}

describe('companion request auth', () => {
  it('does not consume nonce values before a request signature is valid', () => {
    pairingStoreMock.loadPairedCompanionDevice.mockReturnValue({
      device_id: DEVICE_ID,
      device_secret: DEVICE_SECRET
    });
    const nonce = 'nonce-1';

    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest(signedHeaders({ nonce, signature: sign({ nonce, secret: 'wrong-secret' }) }))
    })).toMatchObject({ error: 'invalid_signature', ok: false });

    expect(authenticateCompanionRequest({
      nowMs: NOW_MS,
      request: createRequest(signedHeaders({ nonce }))
    })).toEqual({ device_id: DEVICE_ID, ok: true });
  });

  it('still rejects replayed signed requests after consuming a valid nonce', () => {
    pairingStoreMock.loadPairedCompanionDevice.mockReturnValue({
      device_id: DEVICE_ID,
      device_secret: DEVICE_SECRET
    });
    const nonce = 'nonce-2';
    const request = createRequest(signedHeaders({ nonce }));

    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request })).toEqual({ device_id: DEVICE_ID, ok: true });
    expect(authenticateCompanionRequest({ nowMs: NOW_MS, request })).toMatchObject({
      error: 'replayed_nonce',
      ok: false,
      status_code: 409
    });
  });
});
