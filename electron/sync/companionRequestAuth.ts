import type http from 'node:http';

import { loadPairedCompanionDevice } from './companionPairingStore.js';
import { verifyCompanionRequestSignature } from './companionRequestSignature.js';

const AUTH_WINDOW_MS = 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT_PER_DEVICE = 2_048;

const usedNonceExpiryByDeviceId = new Map<string, Map<string, number>>();

interface CompanionRequestAuthSuccess {
  device_id: string;
  ok: true;
}

interface CompanionRequestAuthFailure {
  error:
    | 'expired_timestamp'
    | 'invalid_signature'
    | 'missing_headers'
    | 'protocol_pairing_repair_required'
    | 'replayed_nonce'
    | 'unknown_device';
  ok: false;
  status_code: 401 | 409;
}

export type CompanionRequestAuthResult = CompanionRequestAuthFailure | CompanionRequestAuthSuccess;

function parsePathWithQuery(request: http.IncomingMessage) {
  const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
  return `${parsed.pathname}${parsed.search}`;
}

function pruneDeviceUsedNonces(deviceCache: Map<string, number>, nowMs: number) {
  for (const [key, expiresAtMs] of deviceCache.entries()) {
    if (expiresAtMs <= nowMs) {
      deviceCache.delete(key);
    }
  }
  while (deviceCache.size > NONCE_CACHE_LIMIT_PER_DEVICE) {
    const oldest = deviceCache.keys().next();
    if (oldest.done) {
      return;
    }
    deviceCache.delete(oldest.value);
  }
}

function consumeNonce(deviceId: string, nonce: string, nowMs: number) {
  const deviceCache = usedNonceExpiryByDeviceId.get(deviceId) ?? new Map<string, number>();
  pruneDeviceUsedNonces(deviceCache, nowMs);
  if (deviceCache.has(nonce)) {
    return false;
  }
  deviceCache.set(nonce, nowMs + NONCE_TTL_MS);
  pruneDeviceUsedNonces(deviceCache, nowMs);
  if (deviceCache.size === 0) {
    usedNonceExpiryByDeviceId.delete(deviceId);
  } else {
    usedNonceExpiryByDeviceId.set(deviceId, deviceCache);
  }
  return true;
}

function readHeader(headers: http.IncomingHttpHeaders, key: string) {
  const value = headers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function clearCompanionRequestNonceCache() {
  usedNonceExpiryByDeviceId.clear();
}

export function authenticateCompanionRequest(args: {
  bodyText?: string;
  nowMs?: number;
  request: http.IncomingMessage;
}): CompanionRequestAuthResult {
  const deviceId = readHeader(args.request.headers, 'x-device-id');
  const nonce = readHeader(args.request.headers, 'x-nonce');
  const signature = readHeader(args.request.headers, 'x-signature');
  const timestamp = readHeader(args.request.headers, 'x-timestamp');
  if (!deviceId || !nonce || !signature || !timestamp) {
    return {
      error: 'missing_headers',
      ok: false,
      status_code: 401
    };
  }
  const pairedDevice = loadPairedCompanionDevice(deviceId);
  const pairedDeviceError = validatePairedDevice(pairedDevice);
  if (pairedDeviceError) return pairedDeviceError;
  const authenticatedDevice = pairedDevice!;
  const nowMs = args.nowMs ?? Date.now();
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > AUTH_WINDOW_MS) {
    return {
      error: 'expired_timestamp',
      ok: false,
      status_code: 401
    };
  }
  const validSignature = verifyCompanionRequestSignature({
    ...(args.bodyText === undefined ? {} : { bodyText: args.bodyText }),
    method: args.request.method ?? 'GET',
    nonce,
    pathWithQuery: parsePathWithQuery(args.request),
    secret: authenticatedDevice.device_secret,
    signature,
    timestamp
  });
  if (!validSignature) {
    return {
      error: 'invalid_signature',
      ok: false,
      status_code: 401
    };
  }
  if (!consumeNonce(deviceId, nonce, nowMs)) {
    return {
      error: 'replayed_nonce',
      ok: false,
      status_code: 409
    };
  }
  return {
    device_id: deviceId,
    ok: true
  };
}

function validatePairedDevice(pairedDevice: ReturnType<typeof loadPairedCompanionDevice>) {
  if (!pairedDevice) {
    return { error: 'unknown_device' as const, ok: false as const, status_code: 401 as const };
  }
  if (!pairedDevice.remote_protocol || pairedDevice.negotiated_protocol_version !== 1) {
    return {
      error: 'protocol_pairing_repair_required' as const,
      ok: false as const,
      status_code: 409 as const
    };
  }
  return null;
}
