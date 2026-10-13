import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { registerDatabaseConnectionCleanup } from '../database/connection.js';

let current: ReturnType<typeof createSyncPeerRoundOwnership> | undefined;

export function desktopSyncPeerRoundOwner() {
  if (!current) {
    registerDatabaseConnectionCleanup(closeDesktopSyncPeerRounds);
    current = createSyncPeerRoundOwnership(60_000);
  }
  return current;
}

export function closeDesktopSyncPeerRounds() {
  current?.close();
  current = undefined;
}
