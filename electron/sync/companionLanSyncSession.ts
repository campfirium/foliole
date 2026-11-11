import type http from 'node:http';

import { SYNC_SESSION_PATH, syncSessionRequestSchema } from '../../lib/platform/syncSessionContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { recordSyncSessionWaitTiming } from './companionLanRequestTiming.js';
import { writeJson } from './companionLanResponses.js';
import { authenticateCompanionRequestContext, revalidateCompanionRequestAuthorization, type CompanionRequestAuthContext } from './companionRequestAuth.js';
import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { bestKnownDesktopSyncPriority, localDesktopSyncTier, rememberDesktopPeerTier } from './desktopSyncUpstream.js';
import { desktopWebDavCredentialDeliveryForPeer, handleDesktopWebDavCredentialReply, prepareQueuedDesktopWebDavRotation } from './desktopWebDavCredentialDelivery.js';
import {
  confirmDesktopWebDavRelayDelivery, desktopWebDavAuthenticatedPolicyForPeer, desktopWebDavRelayForPeer
} from './desktopWebDavRelaySettings.js';

export async function handleCompanionSyncSession(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== SYNC_SESSION_PATH) return false;
  const controller = new AbortController();
  const disconnected = () => controller.abort(new Error('sync_session_disconnected'));
  response.once('close', disconnected);
  try {
    const context = await runWithDatabaseConnectionOwner(() => authenticateCompanionRequestContext({
      request, requireMemberState: true
    }));
    if (!('auth' in context)) {
      await runWithDatabaseConnectionOwner(() => writeJson(request, response, context.status_code, { error: context.error }));
      return true;
    }
    const input = syncSessionRequestSchema.parse(JSON.parse(url.searchParams.get('input') ?? 'null'));
    if (request.method !== (input.operation === 'wait' ? 'GET' : 'POST')) {
      writeJson(request, response, 405, { error: 'method_not_allowed' });
      return true;
    }
    const sessions = desktopSyncChangeSessions();
    const peer = context.auth.device_id;
    rememberDesktopPeerTier(peer, input.tier);
    const waitStartedAt = Date.now();
    const waitStarted = performance.now();
    const reply = input.operation === 'open' ? sessions.open(peer)
      : input.operation === 'close' ? (sessions.close(peer, input.session), { closed: true })
        : input.operation === 'complete' || input.operation === 'webdavCredential' ? { completed: true }
        : await sessions.wait(peer, input.session, input.marker, controller.signal);
    if (input.operation === 'wait' && 'changed' in reply) recordSyncSessionWaitTiming(response, {
      waitStartedAt, waitEndedAt: Date.now(), waitDurationMs: performance.now() - waitStarted,
      changed: reply.changed
    });
    await runWithDatabaseConnectionOwner(async () => {
      if (response.destroyed) return;
      const auth = revalidateCompanionRequestAuthorization(context);
      if (!auth.ok) {
        if ('session' in reply) sessions.close(peer, reply.session);
        writeJson(request, response, auth.status_code, { error: auth.error });
      } else {
        if (input.operation === 'complete') {
          sessions.complete(peer, input.session, input.marker);
          if (input.webdav_relay_id) confirmDesktopWebDavRelayDelivery(context.groupId, peer, input.webdav_relay_id);
        }
        if (input.operation === 'webdavCredential') {
          sessions.signal(peer, input.session).throwIfAborted();
          handleDesktopWebDavCredentialReply(context.groupId, peer, input.credential);
        }
        if ('session' in reply) await writeSessionReply(request, response, context, reply, input.operation === 'open');
        else writeJson(request, response, 200, reply);
      }
    });
  } catch (error) {
    if (!response.destroyed && !response.writableEnded) await runWithDatabaseConnectionOwner(() => {
      writeJson(request, response, 409, { error: error instanceof Error ? error.message : 'sync_session_invalid' });
    });
  } finally { response.off('close', disconnected); }
  return true;
}

async function writeSessionReply(request: http.IncomingMessage, response: http.ServerResponse,
  context: CompanionRequestAuthContext, reply: { session: string }, opening: boolean) {
  const peer = context.auth.device_id;
  const delivery = await prepareQueuedDesktopWebDavRotation(context.groupId, peer, opening)
    .then(() => desktopWebDavCredentialDeliveryForPeer(context.groupId, peer), () => undefined);
  if (response.destroyed) return;
  const current = revalidateCompanionRequestAuthorization(context);
  if (!current.ok) {
    desktopSyncChangeSessions().close(peer, reply.session);
    writeJson(request, response, current.status_code, { error: current.error });
    return;
  }
  writeJson(request, response, 200, sessionReply(reply, context.groupId, peer, delivery));
}

function sessionReply(reply: object, groupId: string, peer: string,
  delivery: ReturnType<typeof desktopWebDavCredentialDeliveryForPeer>) {
  const policy = desktopWebDavAuthenticatedPolicyForPeer(groupId, peer);
  return { ...withLocalPriority(reply), webdav_relay: desktopWebDavRelayForPeer(groupId, peer),
    ...(delivery ? { webdav_credential_delivery: delivery } : {}),
    ...(policy ? { webdav_authenticated_policy: policy } : {}) };
}

/** Requires the DB owner; tells the waiting device this desktop's tier and the best device it knows. */
function withLocalPriority<T extends object>(reply: T) {
  const local = loadDesktopSyncGroup()?.local_device_identity_key;
  if (!local) return reply;
  const best = bestKnownDesktopSyncPriority(local);
  return { ...reply, tier: localDesktopSyncTier(), best: { device_id: best.deviceId, tier: best.tier } };
}
