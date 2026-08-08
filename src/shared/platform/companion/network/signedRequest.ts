import { normalizePairingState, readStoredWebPairingState } from '../../companionPairingState';
import { createCompanionUuid } from '../../companionUuid';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime
} from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

const PAIRING_SIGNATURE_CHECK_PATH = '/companion/sync-pack?after_state_seq=0';

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

export async function createSignedRequestHeaders(args: { bodyText?: string; method: string; pathWithQuery: string }) {
  const timestamp = new Date().toISOString();
  const nonce = createCompanionUuid();
  const bodyHash = await sha256Hex(args.bodyText ?? '');
  if (isNativeCompanionPairingRuntime()) {
    const result = await FolioleCompanionSync.signCompanionSyncRequest({
      body_hash: bodyHash, method: args.method, nonce, path_with_query: args.pathWithQuery, timestamp
    });
    const pairing = normalizePairingState(await FolioleCompanionSync.loadPairingState());
    if (pairing.device_kind !== 'android-capacitor') return result.headers;
    const group = await loadCompanionSyncGroup();
    if (!group) throw new Error('Companion does not belong to a Sync Group.');
    return { ...result.headers, 'X-Sync-Group-Id': group.group_id };
  }
  const stored = readStoredWebPairingState();
  if (!stored?.device_id || !stored.device_secret || normalizePairingState(stored).sync_usable !== true) {
    throw new Error('Companion is not paired with a compatible sync provider.');
  }
  return {
    'X-Device-Id': stored.device_id,
    'X-Nonce': nonce,
    'X-Signature': await hmacSha256Hex(stored.device_secret, canonical({
      bodyHash, method: args.method, nonce, pathWithQuery: args.pathWithQuery, timestamp
    })),
    'X-Sync-Group-Id': 'web-preview',
    'X-Timestamp': timestamp
  };
}

export async function verifyNativePairingCanSignRequest() {
  try {
    const headers = await createSignedRequestHeaders({ method: 'GET', pathWithQuery: PAIRING_SIGNATURE_CHECK_PATH });
    if (!headers['X-Device-Id'] || !headers['X-Signature']) throw new Error('Missing signed request headers.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Native pairing credentials cannot sign sync requests: ${reason}`);
  }
}
