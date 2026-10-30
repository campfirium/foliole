import type { SyncSessionReply } from '../../lib/platform/syncSessionContract.js';

import { requestDesktopPeerSyncSession } from './desktopPeerSessionHttp.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export type DesktopPeerSession = { peer: DesktopSyncGroupPeer; reply: SyncSessionReply; controller: AbortController };

/** Sessions this foreground desktop holds on peer desktops, keyed by peer device ID. */
export const desktopPeerSessionRegistry = new Map<string, DesktopPeerSession>();

export function desktopPeerSessionId(peerId: string) {
  return desktopPeerSessionRegistry.get(peerId)?.reply.session;
}

export function captureDesktopPeerRoundCompletion(peerId: string) {
  const session = desktopPeerSessionRegistry.get(peerId);
  const marker = session?.reply.marker;
  return async () => {
    if (!session || !marker || desktopPeerSessionRegistry.get(peerId) !== session
        || session.controller.signal.aborted) return;
    await requestDesktopPeerSyncSession(session.peer, {
      operation: 'complete', session: session.reply.session, marker
    }, session.controller.signal);
  };
}
