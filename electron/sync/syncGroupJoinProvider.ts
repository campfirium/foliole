import { randomUUID } from 'node:crypto';

import {
  isSyncGroupJoinRequestExpired,
  parseSyncGroupJoinGroupInfo,
  parseSyncGroupJoinRequestId,
  parseSyncGroupJoinRequestInput,
  SYNC_GROUP_JOIN_REQUEST_TTL_MS,
  type SyncGroupJoinAcceptance,
  type SyncGroupJoinGroupInfo,
  type SyncGroupJoinRequest,
  type SyncGroupJoinRequestInput
} from '../../lib/platform/syncGroupJoinContract.js';

import { encryptDesktopSyncGroupJoinInfo } from './desktopSyncGroupJoinCrypto.js';

interface StoredJoinRequest {
  acceptance: SyncGroupJoinAcceptance | null;
  request: SyncGroupJoinRequest;
}

export class DesktopSyncGroupJoinProvider {
  readonly #groupInfo: SyncGroupJoinGroupInfo;
  readonly #onAccept: ((device: SyncGroupJoinRequestInput['device']) => Promise<void> | void) | null;
  readonly #requests = new Map<string, StoredJoinRequest>();

  constructor(
    groupInfo: SyncGroupJoinGroupInfo,
    onAccept: ((device: SyncGroupJoinRequestInput['device']) => Promise<void> | void) | null = null
  ) {
    this.#groupInfo = parseSyncGroupJoinGroupInfo(groupInfo);
    this.#onAccept = onAccept;
  }

  receive(input: SyncGroupJoinRequestInput, nowMs = Date.now()) {
    this.#prune(nowMs);
    const parsed = parseSyncGroupJoinRequestInput(input);
    if (parsed.group_id !== this.#groupInfo.group_id) throw new Error('sync_group_identity_mismatch');
    const request: SyncGroupJoinRequest = {
      ...parsed,
      expires_at: new Date(nowMs + SYNC_GROUP_JOIN_REQUEST_TTL_MS).toISOString(),
      request_id: randomUUID(),
      requested_at: new Date(nowMs).toISOString(),
      status: 'pending'
    };
    this.#requests.set(request.request_id, { acceptance: null, request });
    return publicRequest(request);
  }

  pending(nowMs = Date.now()) {
    this.#prune(nowMs);
    return [...this.#requests.values()]
      .filter(({ request }) => request.status === 'pending')
      .map(({ request }) => publicRequest(request));
  }

  async accept(requestId: string, nowMs = Date.now()) {
    const stored = this.#requirePending(requestId, nowMs);
    const encryptedGroupInfo = await encryptDesktopSyncGroupJoinInfo({
      clientPublicKey: stored.request.ephemeral_public_key,
      groupInfo: JSON.stringify(this.#groupInfo)
    });
    stored.request.status = 'accepted';
    stored.acceptance = {
      encrypted_group_info: encryptedGroupInfo,
      expires_at: stored.request.expires_at,
      request_id: stored.request.request_id
    };
    await this.#onAccept?.(stored.request.device);
    return stored.acceptance;
  }

  collect(requestId: string, nowMs = Date.now()) {
    this.#prune(nowMs);
    const id = parseSyncGroupJoinRequestId(requestId);
    const stored = this.#requests.get(id);
    if (!stored?.acceptance) return null;
    this.#requests.delete(id);
    return stored.acceptance;
  }

  reject(requestId: string, nowMs = Date.now()) {
    this.#prune(nowMs);
    return this.#requests.delete(parseSyncGroupJoinRequestId(requestId));
  }

  clear() {
    this.#requests.clear();
  }

  #requirePending(requestId: string, nowMs: number) {
    this.#prune(nowMs);
    const stored = this.#requests.get(parseSyncGroupJoinRequestId(requestId));
    if (!stored) throw new Error('sync_group_join_request_not_found');
    if (stored.request.status !== 'pending') throw new Error('sync_group_join_request_already_accepted');
    return stored;
  }

  #prune(nowMs: number) {
    for (const [requestId, stored] of this.#requests) {
      if (isSyncGroupJoinRequestExpired(stored.request, nowMs)) this.#requests.delete(requestId);
    }
  }
}

function publicRequest(request: SyncGroupJoinRequest) {
  return {
    device_name: request.device.device_name,
    expires_at: request.expires_at,
    platform: request.device.platform,
    request_id: request.request_id,
    requested_at: request.requested_at,
    status: request.status
  } as const;
}
