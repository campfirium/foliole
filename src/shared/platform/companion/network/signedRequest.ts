import { normalizePairingState, readStoredWebPairingState } from '../../companionPairingState';
import { createCompanionUuid } from '../../companionUuid';
import {
  FolioleCompanionSync,
  isAvailableNativeAndroidCompanionRuntime,
  isNativeCompanionPairingRuntime
} from '../../companionWorkspaceRuntimeRepository';
import { ensureCompanionSyncGroupDataOwner } from '../sync/syncGroupProviderDataOwner';
import {
  loadCompanionSyncGroup
} from '../sync/syncGroupStore';

const PAIRING_SIGNATURE_CHECK_PATH = '/companion/sync-pack?after_state_seq=0';
export const WORKGROUP_ENVELOPE_CONTENT_TYPE = 'application/vnd.foliole.workgroup-aead+json';

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function hmacSha256Hex(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

function canonical(args: { bodyHash: string; method: string; nonce: string; pathWithQuery: string; timestamp: string }) {
  return [args.method.toUpperCase(), args.pathWithQuery, args.timestamp, args.nonce, args.bodyHash].join('\n');
}

export async function createSignedRequestHeaders(args: {
  bodyText?: string;
  endpointUrl?: string;
  method: string;
  pathWithQuery: string;
}) {
  const timestamp = new Date().toISOString();
  const nonce = createCompanionUuid();
  const bodyHash = await sha256Hex(args.bodyText ?? '');
  if (isNativeCompanionPairingRuntime()) {
    const group = await loadCompanionSyncGroup();
    if (group) {
      if (!args.endpointUrl) throw new Error('Sync Group request target is required.');
      const pairing = normalizePairingState(await FolioleCompanionSync.loadPairingState());
      if (pairing.sync_usable !== true) throw new Error('sync_protocol_incompatible');
      const result = await signNativeWorkgroupRequest({
        ...(args.bodyText === undefined ? {} : { bodyText: args.bodyText }),
        bodyHash,
        endpointUrl: args.endpointUrl,
        method: args.method,
        nonce,
        pathWithQuery: args.pathWithQuery,
        timestamp
      }, group.group_id);
      return { ...result.headers, 'X-Sync-Group-Id': group.group_id };
    }
    return (await FolioleCompanionSync.signCompanionSyncRequest({
      body_hash: bodyHash, method: args.method, nonce, path_with_query: args.pathWithQuery, timestamp
    })).headers;
  }
  const stored = readStoredWebPairingState();
  if (!stored?.authorization_id || !stored.credential_secret || normalizePairingState(stored).sync_usable !== true) {
    throw new Error('Companion is not paired with a compatible desktop sync source.');
  }
  return {
    'X-Authorization-Id': stored.authorization_id,
    'X-Nonce': nonce,
    'X-Signature': await hmacSha256Hex(stored.credential_secret, canonical({
      bodyHash, method: args.method, nonce, pathWithQuery: args.pathWithQuery, timestamp
    })),
    'X-Sync-Group-Id': 'web-preview',
    'X-Timestamp': timestamp
  };
}

export async function prepareNativeCompanionWorkgroupRequest(args: {
  bodyText: string; endpointUrl: string; method: string; pathWithQuery: string;
}) {
  const prepared = await prepareNativeCompanionWorkgroupRequestIfPresent(args);
  if (!prepared) throw new Error('android_workgroup_request_required');
  return prepared;
}

export async function prepareNativeCompanionWorkgroupRequestIfPresent(args: {
  bodyText: string; endpointUrl: string; method: string; pathWithQuery: string;
}) {
  if (!isAvailableNativeAndroidCompanionRuntime()) return null;
  const group = await loadCompanionSyncGroup();
  if (!group) return null;
  const nonce = createCompanionUuid();
  const timestamp = new Date().toISOString();
  const bodyHash = await sha256Hex(args.bodyText);
  const result = await signNativeWorkgroupRequest({ ...args, bodyHash, nonce, timestamp }, group.group_id);
  if (!result.body) throw new Error('sync_group_prepared_body_missing');
  return {
    body: result.body,
    headers: { ...result.headers, 'Content-Type': WORKGROUP_ENVELOPE_CONTENT_TYPE,
      'X-Sync-Group-Id': group.group_id }
  };
}

async function signNativeWorkgroupRequest(args: {
  bodyHash: string; bodyText?: string; endpointUrl: string; method: string;
  nonce: string; pathWithQuery: string; timestamp: string;
}, groupId: string) {
  await ensureCompanionSyncGroupDataOwner();
  return FolioleCompanionSync.signCompanionSyncRequest({
    ...(args.bodyText === undefined ? {} : { body: args.bodyText }),
    body_hash: args.bodyHash, endpoint_url: args.endpointUrl, method: args.method,
    nonce: args.nonce, path_with_query: args.pathWithQuery, sync_group_id: groupId,
    timestamp: args.timestamp
  });
}

export async function verifyNativePairingCanSignRequest(endpointUrl?: string) {
  try {
    const headers = await createSignedRequestHeaders({
      ...(endpointUrl ? { endpointUrl } : {}), method: 'GET', pathWithQuery: PAIRING_SIGNATURE_CHECK_PATH
    });
    if (!headers['X-Authorization-Id'] || !headers['X-Signature']) {
      throw new Error('Missing signed request headers.');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Native pairing credentials cannot sign sync requests: ${reason}`);
  }
}
