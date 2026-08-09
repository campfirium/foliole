const inFlightByPeer = new Map<string, Promise<unknown>>();

export function runDesktopSyncGroupPeerSingleFlight<T>(
  peerDeviceId: string,
  execute: () => Promise<T>
): Promise<T> {
  const existing = inFlightByPeer.get(peerDeviceId);
  if (existing) return existing as Promise<T>;
  const work = execute().finally(() => {
    if (inFlightByPeer.get(peerDeviceId) === work) inFlightByPeer.delete(peerDeviceId);
  });
  inFlightByPeer.set(peerDeviceId, work);
  return work;
}
