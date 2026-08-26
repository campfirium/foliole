import type { CompanionPairingSecretPayload } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupJoinRequestInput } from '../../lib/platform/syncGroupJoinContract';
import { FolioleSyncGroupJoinPrepare } from '../shared/platform/companion/sync/syncGroupJoinPrepare';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';

import { postResult } from './iosBridgeAcceptance';

const GROUP_INFO = {
  display_name: 'Acceptance Sync Group', group_id: 'group-t152-ios-runtime',
  workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
};
const DEVICE = {
  canonical_library_path: '/acceptance/requester/foliole.db',
  device_anchor: 'a1111111-1111-4111-8111-111111111111', device_name: 'Acceptance Requester',
  path_flavor: 'posix' as const, platform: 'ios'
};

type AcceptancePlugin = typeof FolioleSyncGroupJoinPrepare & {
  beginAcceptance(options: { group_info: typeof GROUP_INFO }): Promise<{
    provider_restarted_clean: boolean; restart_probe: boolean;
  }>;
  expireRequest(options: { request: SyncGroupJoinRequestInput }): Promise<{ timeout_cleared: boolean }>;
  markRestartProbe(options: { request_id: string }): Promise<{ pending_before_restart: boolean }>;
};
const plugin = FolioleSyncGroupJoinPrepare as AcceptancePlugin;

function base64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function requester() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { keys, request: {
    contract_version: 1 as const, device: DEVICE,
    ephemeral_public_key: base64Url(await crypto.subtle.exportKey('raw', keys.publicKey)),
    group_id: GROUP_INFO.group_id
  } };
}

export async function decryptGroupInfo(envelope: CompanionPairingSecretPayload, privateKey: CryptoKey) {
  if (envelope.algorithm !== 'ECDH-P256-HKDF-SHA256-AES-GCM') throw new Error('Unexpected join cipher.');
  const serverKey = await crypto.subtle.importKey(
    'raw', decodeBase64Url(envelope.server_public_key), { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, privateKey, 256);
  const keyMaterial = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: decodeBase64Url(envelope.salt),
      info: new TextEncoder().encode('Foliole companion pairing v1') }, keyMaterial,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(envelope.iv) }, key, decodeBase64Url(envelope.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, string>;
}

async function runInitial() {
  const primary = await requester();
  const received = await FolioleSyncGroupJoinPrepare.receiveRequest({ request: primary.request });
  const visible = (await FolioleSyncGroupJoinPrepare.loadRequests()).requests
    .some((request) => request.request_id === received.request_id && request.device_name === DEVICE.device_name);
  const before = await FolioleSyncGroupJoinPrepare.collectAcceptance({ request_id: received.request_id });
  await FolioleSyncGroupJoinPrepare.acceptRequest({ request_id: received.request_id });
  const accepted = await FolioleSyncGroupJoinPrepare.collectAcceptance({ request_id: received.request_id });
  if (!accepted?.encrypted_group_info) throw new Error('Accepted group info was not collectible.');
  const decrypted = await decryptGroupInfo(accepted.encrypted_group_info, primary.keys.privateKey);
  const consumed = await FolioleSyncGroupJoinPrepare.collectAcceptance({ request_id: received.request_id });
  const rejected = await requester();
  const rejectedRequest = await FolioleSyncGroupJoinPrepare.receiveRequest({ request: rejected.request });
  const rejection = await FolioleSyncGroupJoinPrepare.rejectRequest({ request_id: rejectedRequest.request_id });
  const timeout = await requester();
  const timeoutResult = await plugin.expireRequest({ request: timeout.request });
  const restart = await requester();
  const restartRequest = await FolioleSyncGroupJoinPrepare.receiveRequest({ request: restart.request });
  const restartResult = await plugin.markRestartProbe({ request_id: restartRequest.request_id });
  postResult({
    acceptance_consumed_once: !consumed, decrypted_group_info: decrypted, error: null,
    key_unavailable_before_accept: !before, pending_before_restart: restartResult.pending_before_restart,
    phase: 'join-observed', rejection_cleared: rejection.rejected, request_visible: visible,
    scenario: 'sync-group-join-runtime', status: 'passed', timeout_cleared: timeoutResult.timeout_cleared
  });
}

export async function runIosSyncGroupJoinAcceptance() {
  try {
    await loadCompanionBootstrapState();
    const state = await plugin.beginAcceptance({ group_info: GROUP_INFO });
    if (!state.restart_probe) return await runInitial();
    postResult({ error: null, phase: 'restart-clean', provider_restarted_clean: state.provider_restarted_clean,
      scenario: 'sync-group-join-runtime', status: 'passed' });
  } catch (error) {
    postResult({ error: error instanceof Error ? error.message : String(error), phase: 'failed',
      scenario: 'sync-group-join-runtime', status: 'failed' });
  }
}
