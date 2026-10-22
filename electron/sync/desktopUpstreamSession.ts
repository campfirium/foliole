import { syncSessionReplySchema, type SyncSessionReply } from '../../lib/platform/syncSessionContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { requestDesktopPeerSyncSession } from './desktopPeerSessionHttp.js';
import { desktopPeerSessionRegistry as sessions, type DesktopPeerSession } from './desktopPeerSessionRegistry.js';
import { loadActiveDesktopSyncRun, runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopSyncUpstreamPeers } from './desktopSyncGroupTransport.js';
import { DESKTOP_UPSTREAM_RETRY_MS, markDesktopSyncUpstreamUnreachable, rememberDesktopPeerTier } from './desktopSyncUpstream.js';

let refreshing: Promise<void> | null = null;
let generation = 0;

/**
 * A desktop is a client of its single upstream exactly like a phone: it holds a change wait there
 * and runs every round itself. A root holds no session and only serves its downstream devices.
 */
export function refreshDesktopUpstreamSession(): Promise<void> {
  refreshing ??= reconcile().finally(() => { refreshing = null; });
  return refreshing;
}

export function closeDesktopUpstreamSession() {
  generation += 1;
  for (const session of [...sessions.values()]) void close(session);
}

async function reconcile() {
  const expected = generation;
  for (;;) {
    const [upstream] = await runWithDatabaseConnectionOwner(() => loadDesktopSyncUpstreamPeers());
    const current = [...sessions.values()][0];
    if (current && current.peer.peer_device_id === upstream?.peer_device_id) return;
    if (current) await close(current);
    if (!upstream || expected !== generation) return;
    try {
      const reply = syncSessionReplySchema.parse(await requestDesktopPeerSyncSession(upstream, { operation: 'open' }));
      if (expected !== generation) {
        await requestDesktopPeerSyncSession(upstream, { operation: 'close', session: reply.session }).catch(() => undefined);
        return;
      }
      const session = { peer: upstream, reply, controller: new AbortController() };
      sessions.set(upstream.peer_device_id, session);
      learnPriority(upstream, reply);
      void watch(session);
      return;
    } catch (error) { markLost(upstream, error); }
  }
}

async function watch(session: DesktopPeerSession) {
  try {
    await pull();
    while (sessions.get(session.peer.peer_device_id) === session) {
      const reply = syncSessionReplySchema.parse(await requestDesktopPeerSyncSession(session.peer, {
        operation: 'wait', session: session.reply.session, marker: session.reply.marker
      }, session.controller.signal));
      if (sessions.get(session.peer.peer_device_id) !== session) return;
      session.reply = reply;
      learnPriority(session.peer, reply);
      if (sessions.get(session.peer.peer_device_id) !== session) return;
      if (reply.changed) await pull();
    }
  } catch (error) {
    if (sessions.get(session.peer.peer_device_id) !== session) return;
    // A lost wait may only be an upstream restart; reopening decides whether it is really gone.
    console.info('[sync] upstream desktop session ended', error);
    await close(session);
    void refreshDesktopUpstreamSession();
  }
}

/** Replies carry the upstream's tier and the best device it knows; a better one triggers a switch. */
function learnPriority(peer: DesktopSyncGroupPeer, reply: SyncSessionReply) {
  rememberDesktopPeerTier(peer.peer_device_id, reply.tier);
  if (reply.best && reply.best.device_id !== peer.local_device_id) rememberDesktopPeerTier(reply.best.device_id, reply.best.tier);
}

async function pull() {
  await loadActiveDesktopSyncRun()?.catch(() => undefined);
  await runDesktopSyncCoordinator('automatic').catch(() => undefined);
}

function markLost(peer: DesktopSyncGroupPeer, error: unknown) {
  console.info('[sync] upstream desktop unavailable; choosing the next one', error);
  markDesktopSyncUpstreamUnreachable(peer.peer_device_id);
  setTimeout(() => { void refreshDesktopUpstreamSession(); }, DESKTOP_UPSTREAM_RETRY_MS).unref?.();
}

async function close(session: DesktopPeerSession) {
  if (sessions.get(session.peer.peer_device_id) !== session) return;
  sessions.delete(session.peer.peer_device_id);
  session.controller.abort(new Error('sync_session_cancelled'));
  await requestDesktopPeerSyncSession(session.peer, { operation: 'close', session: session.reply.session })
    .catch(() => undefined);
}
