import type { SyncSessionReply } from '../../lib/platform/syncSessionContract.js';

import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export type DesktopPeerSession = { peer: DesktopSyncGroupPeer; reply: SyncSessionReply; controller: AbortController };

/** Sessions this foreground desktop holds on peer desktops, keyed by peer device ID. */
export const desktopPeerSessionRegistry = new Map<string, DesktopPeerSession>();

export function desktopPeerSessionId(peerId: string) {
  return desktopPeerSessionRegistry.get(peerId)?.reply.session;
}
