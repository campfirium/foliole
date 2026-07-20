import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../lib/platform/syncProtocolContract';

import {
  createCompanionPairingPublicKey,
  decryptCompanionPairingSecret,
  dropCompanionPairingPrivateKey
} from './companionPairingEncryption';
import { CompanionPairingHttpError, readCompanionPairingError } from './companionPairingHttpError';
import {
  clearWebPairingState,
  normalizePairingState,
  readStoredWebPairingState,
  readWebPairingState,
  writeWebPairingState
} from './companionPairingState';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { createCompanionUuid } from './companionUuid';
import { discoverCompanionDesktop, discoverCompanionDesktops } from './companionWorkspaceDiscovery';
import {
  DISCOVERY_ENDPOINT_PATH,
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  type LoadCompanionDiscoveryResponse,
  normalizeEndpointUrl,
  PAIR_ENDPOINT_PATH,
  PAIR_REQUESTS_ENDPOINT_PATH,
  type PairCompanionWithDesktopArgs,
  type PairCompanionWithDesktopResponse,
  type RequestCompanionPairingArgs,
  type RequestCompanionPairingResponse
} from './companionWorkspaceRuntimeRepository';

const pairingKeyIdsByRequestId = new Map<string, string>();
const PAIRING_SIGNATURE_CHECK_PATH = '/companion/sync-pack?after_state_seq=0';

export { discoverCompanionDesktop, discoverCompanionDesktops };

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string) {
  const encoded = new TextEncoder().encode(text);
  return toHex(await crypto.subtle.digest('SHA-256', encoded));
}

async function hmacSha256Hex(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

function createNonce() {
  return createCompanionUuid();
}

function buildCanonicalRequestPayload(args: {
  bodyHash: string;
  method: string;
  nonce: string;
  pathWithQuery: string;
  timestamp: string;
}) {
  return [args.method.toUpperCase(), args.pathWithQuery, args.timestamp, args.nonce, args.bodyHash].join('\n');
}

export async function loadCompanionPairingState() {
  if (!isNativeCompanionPairingRuntime()) {
    return readWebPairingState();
  }
  return normalizePairingState(await FolioleCompanionSync.loadPairingState());
}

export async function clearCompanionPairingCredentials() {
  if (!isNativeCompanionPairingRuntime()) {
    return clearWebPairingState();
  }
  return normalizePairingState(await runCompanionSyncWriterTask(() => FolioleCompanionSync.clearPairingCredentials()));
}

export async function createSignedRequestHeaders(args: { bodyText?: string; method: string; pathWithQuery: string }) {
  const timestamp = new Date().toISOString();
  const nonce = createNonce();
  const bodyHash = await sha256Hex(args.bodyText ?? '');
  if (isNativeCompanionPairingRuntime()) {
    const result = await FolioleCompanionSync.signCompanionSyncRequest({
      body_hash: bodyHash,
      method: args.method,
      nonce,
      path_with_query: args.pathWithQuery,
      timestamp
    });
    return result.headers;
  }

  const stored = readStoredWebPairingState();
  if (!stored?.device_id || !stored.device_secret || normalizePairingState(stored).sync_usable !== true) {
    throw new Error('Companion is not paired with a compatible desktop sync source.');
  }
  return {
    'X-Device-Id': stored.device_id,
    'X-Nonce': nonce,
    'X-Signature': await hmacSha256Hex(
      stored.device_secret,
      buildCanonicalRequestPayload({
        bodyHash,
        method: args.method,
        nonce,
        pathWithQuery: args.pathWithQuery,
        timestamp
      })
    ),
    'X-Timestamp': timestamp
  };
}

async function verifyNativePairingCanSignRequest() {
  try {
    const headers = await createSignedRequestHeaders({ method: 'GET', pathWithQuery: PAIRING_SIGNATURE_CHECK_PATH });
    if (!headers['X-Device-Id'] || !headers['X-Signature']) {
      throw new Error('Native pairing credentials did not produce signed request headers.');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Native pairing credentials cannot sign sync requests: ${reason}`);
  }
}

export async function loadCompanionDiscovery(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const response = await requestDesktop(`${normalizedEndpointUrl}${DISCOVERY_ENDPOINT_PATH}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Desktop discovery failed with ${response.status}.`);
  }
  return (await response.json()) as LoadCompanionDiscoveryResponse;
}

export async function requestCompanionPairing(args: RequestCompanionPairingArgs) {
  const normalizedEndpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const pairingKeyId = createCompanionUuid();
  const pairingPublicKey = await createCompanionPairingPublicKey(pairingKeyId);
  const response = await requestDesktop(`${normalizedEndpointUrl}${PAIR_REQUESTS_ENDPOINT_PATH}`, {
    body: JSON.stringify({
      device_id: args.deviceId,
      device_kind: args.deviceKind,
      device_name: args.deviceName,
      pairing_public_key: pairingPublicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  if (response.status !== 202 && response.status !== 409) {
    dropCompanionPairingPrivateKey(pairingKeyId);
    throw await readCompanionPairingError(response);
  }
  const payload = (await response.json()) as RequestCompanionPairingResponse & { error?: string };
  if (payload.error) {
    dropCompanionPairingPrivateKey(pairingKeyId);
    throw new CompanionPairingHttpError(response.status, payload.error, payload.compatibility ?? null);
  }
  pairingKeyIdsByRequestId.set(payload.pair_request_id, pairingKeyId);
  return payload;
}

export async function pairCompanionWithDesktop(args: PairCompanionWithDesktopArgs) {
  const normalizedEndpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const response = await requestDesktop(`${normalizedEndpointUrl}${PAIR_ENDPOINT_PATH}`, {
    body: JSON.stringify({
      pair_request_id: args.pairRequestId
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  if (!response.ok) {
    throw await readCompanionPairingError(response);
  }
  const payload = (await response.json()) as PairCompanionWithDesktopResponse;
  const pairingKeyId = pairingKeyIdsByRequestId.get(args.pairRequestId);
  if (!pairingKeyId) {
    throw new Error('Companion pairing key is no longer available.');
  }
  const deviceSecret = await decryptCompanionPairingSecret(pairingKeyId, payload.encrypted_device_secret);
  pairingKeyIdsByRequestId.delete(args.pairRequestId);
  if (!isNativeCompanionPairingRuntime()) {
    return writeWebPairingState({
      device_id: payload.device_id,
      device_kind: args.deviceKind,
      device_name: args.deviceName,
      device_secret: deviceSecret,
      is_paired: true,
      negotiated_protocol_version: payload.compatibility.negotiated_version,
      paired_at: payload.paired_at,
      primary_device_id: payload.peer_id,
      remote_protocol: payload.desktop_protocol
    });
  }
  return runCompanionSyncWriterTask(async () => {
    await FolioleCompanionSync.savePairingCredentials({
      device_id: payload.device_id,
      device_kind: args.deviceKind,
      device_name: args.deviceName,
      device_secret: deviceSecret,
      negotiated_protocol_version: payload.compatibility.negotiated_version ?? CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
      paired_at: payload.paired_at,
      primary_device_id: payload.peer_id,
      remote_protocol: payload.desktop_protocol
    });
    const storedPairingState = normalizePairingState(await FolioleCompanionSync.loadPairingState());
    if (!storedPairingState.is_paired) throw new Error('Native pairing credentials were not saved.');
    await verifyNativePairingCanSignRequest();
    return storedPairingState;
  });
}

async function requestDesktop(
  url: string,
  init: { body?: string; headers?: Record<string, string>; method: string }
) {
  if (!isNativeCompanionPairingRuntime()) {
    return await fetch(url, init);
  }
  const payload = await FolioleCompanionSync.desktopHttpRequest({
    ...(init.body !== undefined ? { body: init.body } : {}),
    ...(init.headers !== undefined ? { headers: init.headers } : {}),
    method: init.method,
    url
  });
  return new Response(payload.body, { status: payload.status });
}
