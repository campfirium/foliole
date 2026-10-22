import type http from 'node:http';

import { parseRequestSyncPeerRound, touchRequestSyncStream } from '../../lib/core/sync/requestSyncPeerRound.js';
import type { SyncPeerRoundLease } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopLocalNodeProof } from '../database/nodeVersionPeerProof.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import {
  FRAMED_SYNC_BODY_SHA256_HEADER,
  FRAMED_SYNC_PATH,
  handleCompanionLanFramedSyncPost
} from './companionLanFramedSyncPost.js';
import { requestDatabaseTiming, type RequestDatabaseTiming } from './companionLanRequestTiming.js';
import { writeJson } from './companionLanResponses.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { requestDesktopRelaySync } from './desktopMemberSyncCadence.js';
import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import { respondDesktopRequestSyncHttp } from './desktopRequestSyncHttpRoute.js';
import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { desktopSyncPeerRoundOwner } from './desktopSyncPeerRoundOwner.js';

export async function handleProductionCompanionFramedSyncPost(args: {
  deviceId: string;
  request: http.IncomingMessage;
  response: http.ServerResponse;
}) {
  const url = new URL(args.request.url ?? '/', 'http://127.0.0.1');
  if (args.request.method !== 'POST' || url.pathname !== FRAMED_SYNC_PATH) return false;

  if (!url.searchParams.has('request')) {
    writeJson(args.request, args.response, 410, { error: 'request_sync_required' });
    return true;
  }
  const timing = requestDatabaseTiming(args.response);
  const runtime = await loadInboundRuntime(args.request, timing);
  const controller = new AbortController();
  const round = parseRequestSyncPeerRound(
    url.searchParams.get('peer_round_id'), url.searchParams.get('peer_round_mode'));
  const { lease, ownershipError } = acquireInboundRound(runtime, round);
  if (round.mode === 'start' || round.mode === 'single') bindSessionRound(lease, runtime.sessionSignal);
  const disconnected = () => {
    if (!args.response.writableFinished) controller.abort(new Error('request_sync_peer_disconnected'));
  };
  const completed = () => {
    if (round && lease && (round.mode === 'finish' || round.mode === 'single')) {
      desktopSyncPeerRoundOwner().finishInbound(runtime.auth.ok ? runtime.auth.device_id : '', round.id);
    }
  };
  args.response.once('finish', completed);
  args.request.once('aborted', disconnected);
  args.response.once('close', disconnected);
  if (args.request.aborted || args.response.destroyed) disconnected();
  try { await handleCompanionLanFramedSyncPost({
    authenticate: () => runtime.auth,
    payloadBudget: runtime.payloadBudget,
    localIdentity: { deviceId: args.deviceId, libraryEpoch: runtime.libraryEpoch },
    onProgress: () => lease?.touch(),
    onStream: async ({ context, stream }) => {
        if (!round) throw new Error('sync_round_identity_missing');
        if (ownershipError) throw ownershipError;
        if (!lease) throw new Error('sync_round_identity_missing');
        const host = createDesktopRequestSyncDatabaseHost(runtime.databasePath, runtime.sessionId, () => relayInboundCommit(runtime.auth), timing);
        const reply = await respondDesktopRequestSyncHttp(host, {
          context, stream: { ...stream, frames: touchRequestSyncStream(stream.frames, lease) },
          url, groupKey: runtime.groupKey, signal: AbortSignal.any([controller.signal, lease.signal]),
          onProgress: () => lease?.touch()
        });
        return { ...reply, frames: touchRequestSyncStream(reply.frames, lease) };

    },
    request: args.request,
    response: args.response
  }); } finally {
    args.response.off('finish', completed);
    args.request.off('aborted', disconnected);
    args.response.off('close', disconnected);
    if (round && lease && (round.mode === 'finish' || round.mode === 'single' ||
        controller.signal.aborted || (round.mode === 'start' && args.response.statusCode !== 200))) {
      desktopSyncPeerRoundOwner().finishInbound(runtime.auth.ok ? runtime.auth.device_id : '', round.id);
    }
  }
  return true;
}

function relayInboundCommit(auth: { ok: true; device_id: string } | { ok: false }) {
  if (!auth.ok) return;
  void requestDesktopRelaySync(auth.device_id)?.catch(error => console.warn('[sync] received change propagation failed', error));
}

function bindSessionRound(lease: SyncPeerRoundLease | undefined, signal: AbortSignal | undefined) {
  if (!lease || !signal) return;
  const ended = () => lease.release(new Error('sync_session_expired'));
  signal.addEventListener('abort', ended, { once: true });
  lease.signal.addEventListener('abort', () => signal.removeEventListener('abort', ended), { once: true });
  if (signal.aborted) ended();
}

function acquireInboundRound(runtime: Awaited<ReturnType<typeof loadInboundRuntime>>,
  round: ReturnType<typeof parseRequestSyncPeerRound> | undefined): {
    lease: SyncPeerRoundLease | undefined; ownershipError: unknown
  } {
  try {
    if (!round || !runtime.auth.ok) return { lease: undefined, ownershipError: undefined };
    const peer = runtime.auth.device_id;
    const lease = desktopSyncPeerRoundOwner().acceptInbound(peer, round.id, round.mode === 'start' || round.mode === 'single');
    return { lease: { ...lease, touch() {
      lease.touch();
      if (runtime.sessionId) desktopSyncChangeSessions().signal(peer, runtime.sessionId);
    } }, ownershipError: undefined };
  } catch (ownershipError) { return { lease: undefined, ownershipError }; }
}

function readHeader(request: http.IncomingMessage, name: string) {
  const value = request.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function loadInboundRuntime(request: http.IncomingMessage, timing?: RequestDatabaseTiming) {
  const startedAt = performance.now();
  try { return await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection();
    const group = loadDesktopSyncGroupInfo();
    if (!group) throw new Error('sync_group_not_available');
    const bodySha256 = readHeader(request, FRAMED_SYNC_BODY_SHA256_HEADER);
    const auth = authenticateCompanionRequest({
      ...(bodySha256 === undefined ? {} : { bodySha256 }), request, requireMemberState: true
    });
    const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
    const sessionId = params.has('sync_session_id') ? params.get('sync_session_id') ?? '' : undefined;
    const sessionSignal = auth.ok && sessionId !== undefined
      ? desktopSyncChangeSessions().signal(auth.device_id, sessionId) : undefined;
    return {
      databasePath: connection.dbPath,
      payloadBudget: connection.framedSyncPayloadBudget,
      auth, sessionId, sessionSignal,
      groupKey: new Uint8Array(Buffer.from(group.workgroup_key, 'base64url')),
      libraryEpoch: loadDesktopLocalNodeProof().library_epoch
    };
  }); } finally { timing?.('runtime_resolution', performance.now() - startedAt); }
}
