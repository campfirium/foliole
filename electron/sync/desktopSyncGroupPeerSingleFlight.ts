const inFlightByPeer = new Map<string, Promise<unknown>>();

export function runDesktopSyncGroupPeerSingleFlight<T>(
  peerAuthorizationId: string,
  execute: () => Promise<T>
): Promise<T> {
  const existing = inFlightByPeer.get(peerAuthorizationId);
  if (existing) return existing as Promise<T>;
  const work = execute().finally(() => {
    if (inFlightByPeer.get(peerAuthorizationId) === work) inFlightByPeer.delete(peerAuthorizationId);
  });
  inFlightByPeer.set(peerAuthorizationId, work);
  return work;
}
