import { compareSyncPriority, SYNC_PRIORITY_TIER, selectSyncUpstream, type SyncPriority } from '../../lib/core/sync/syncPriority.js';

import { isDesktopForeground, yieldDesktopForeground } from './desktopForegroundPresence.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export const DESKTOP_UPSTREAM_RETRY_MS = 60_000;
const unreachable = new Map<string, number>();
const knownTiers = new Map<string, number>();
const tierListeners = new Set<() => void>();

export function localDesktopSyncTier() {
  return isDesktopForeground() ? SYNC_PRIORITY_TIER.foregroundDesktop : SYNC_PRIORITY_TIER.desktop;
}

function peerPriority(deviceId: string): SyncPriority {
  return { tier: knownTiers.get(deviceId) ?? SYNC_PRIORITY_TIER.desktop, deviceId };
}

export function selectDesktopSyncUpstream(peers: readonly DesktopSyncGroupPeer[]) {
  const local = peers[0]?.local_device_id;
  if (!local) return null;
  const now = Date.now();
  return selectSyncUpstream({ tier: localDesktopSyncTier(), deviceId: local },
    peers.filter(peer => (unreachable.get(peer.peer_device_id) ?? 0) <= now), peer => peerPriority(peer.peer_device_id));
}

/** Highest-priority device this desktop knows of, itself included, for its session replies. */
export function bestKnownDesktopSyncPriority(localDeviceId: string): SyncPriority {
  let best: SyncPriority = { tier: localDesktopSyncTier(), deviceId: localDeviceId };
  for (const deviceId of knownTiers.keys()) {
    const candidate = peerPriority(deviceId);
    if (compareSyncPriority(candidate, best) > 0) best = candidate;
  }
  return best;
}

/** Records a peer desktop's tier learned from discovery or session traffic; listeners re-plan on change. */
export function rememberDesktopPeerTier(deviceId: string, tier: number | undefined) {
  if (tier === undefined || tier < SYNC_PRIORITY_TIER.desktop || knownTiers.get(deviceId) === tier) return;
  knownTiers.set(deviceId, tier);
  if (tier === SYNC_PRIORITY_TIER.foregroundDesktop) yieldDesktopForeground();
  for (const listener of tierListeners) listener();
}

export function subscribeDesktopPeerTiers(listener: () => void) {
  tierListeners.add(listener);
  return () => { tierListeners.delete(listener); };
}

/** A refused session open skips that upstream until discovery reports it again or a minute passes. */
export function markDesktopSyncUpstreamUnreachable(peerId: string) {
  unreachable.set(peerId, Date.now() + DESKTOP_UPSTREAM_RETRY_MS);
}

export function markDesktopSyncPeerReachable(peerId: string) {
  unreachable.delete(peerId);
}

export function resetDesktopSyncUpstreamReachability() {
  unreachable.clear();
  knownTiers.clear();
}
