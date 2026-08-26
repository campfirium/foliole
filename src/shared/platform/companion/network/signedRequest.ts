import { createCompanionUuid } from '../../companionUuid';
import {
  FolioleCompanionSync,
  isAvailableNativeAndroidCompanionRuntime,
  isNativeCompanionNetworkRuntime
} from '../../companionWorkspaceRuntimeRepository';
import { ensureCompanionSyncGroupDataOwner } from '../sync/syncGroupProviderDataOwner';
import {
  loadCompanionSyncGroup,
  loadCompanionSyncGroupWorkgroupKey
} from '../sync/syncGroupStore';

const SIGNATURE_CHECK_PATH = '/companion/sync-pack?after_state_seq=0';
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
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const localDevice = group.devices.find((device) =>
    device.device_identity_key === group.local_device_identity_key && device.state === 'active');
  if (!localDevice) throw new Error('sync_group_local_device_missing');
  if (isNativeCompanionNetworkRuntime()) {
    if (!args.endpointUrl) throw new Error('Sync Group request target is required.');
    const result = await signNativeWorkgroupRequest({
      ...(args.bodyText === undefined ? {} : { bodyText: args.bodyText }), bodyHash,
      endpointUrl: args.endpointUrl, method: args.method, nonce,
      pathWithQuery: args.pathWithQuery, timestamp
    }, group.group_id);
    return { ...result.headers, 'X-Sync-Group-Id': group.group_id };
  }
  const workgroupKey = await loadCompanionSyncGroupWorkgroupKey();
  if (!workgroupKey) throw new Error('sync_group_workgroup_key_missing');
  return {
    'X-Device-Id': localDevice.device_identity_key,
    'X-Nonce': nonce,
    'X-Signature': await hmacSha256Hex(workgroupKey, canonical({
      bodyHash, method: args.method, nonce, pathWithQuery: args.pathWithQuery, timestamp
    })),
    'X-Sync-Group-Id': group.group_id,
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

export async function verifyNativeSyncGroupCanSignRequest(endpointUrl?: string) {
  try {
    const headers = await createSignedRequestHeaders({
      ...(endpointUrl ? { endpointUrl } : {}), method: 'GET', pathWithQuery: SIGNATURE_CHECK_PATH
    });
    if (!headers['X-Device-Id'] || !headers['X-Signature']) {
      throw new Error('Missing signed request headers.');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Sync Group credentials cannot sign sync requests: ${reason}`);
  }
}
