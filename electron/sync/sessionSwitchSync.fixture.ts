import { syncSessionReplySchema } from '../../lib/platform/syncSessionContract.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { requestDesktopPeerSyncSession } from './desktopPeerSessionHttp.js';
import { desktopPeerSessionRegistry } from './desktopPeerSessionRegistry.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';
import { closeDesktopUpstreamSession } from './desktopUpstreamSession.js';
import { lanPeerHttp } from './lanPeerHttp.js';
import { stopLanWorkspaceSyncServer } from './lanWorkspaceSyncServer.js';

/** Close the real upstream session at a deterministic HTTP continuation boundary. */
export async function runSessionSwitchFixture(action: string, args: Record<string, unknown>) {
  await stopLanWorkspaceSyncServer();
  if (action === 'sessionStop') return null;
  const group = loadDesktopSyncGroup()!;
  const peer = { endpoint_url: String(args.origin), group_id: group.group_id,
    local_device_id: group.local_device_identity_key, peer_device_id: String(args.identity),
    peer_device_name: 'Peer', peer_platform: 'darwin' };
  await exchangeDesktopSyncGroupMemberState(peer);
  const reply = syncSessionReplySchema.parse(await requestDesktopPeerSyncSession(peer, { operation: 'open' }));
  const session = { peer, reply, controller: new AbortController() };
  desktopPeerSessionRegistry.set(peer.peer_device_id, session);
  const fetch = lanPeerHttp.fetch;
  let switched = false;
  lanPeerHttp.fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!switched && new URL(String(input)).pathname === '/sync-group/member-state') {
      switched = true;
      closeDesktopUpstreamSession();
      await requestDesktopPeerSyncSession(peer, { operation: 'close', session: reply.session }).catch(() => undefined);
    }
    return response;
  };
  try {
    const result = await continueDesktopSyncGroupSync(peer);
    return { switched, cancelled: session.controller.signal.aborted, result };
  } finally {
    lanPeerHttp.fetch = fetch;
    closeDesktopUpstreamSession();
  }
}
