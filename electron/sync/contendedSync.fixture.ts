import type { SyncPeerRoundLease } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { loadActiveDesktopSyncRun, runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import { desktopSyncPeerRoundOwner } from './desktopSyncPeerRoundOwner.js';
import { stopLanWorkspaceSyncServer } from './lanWorkspaceSyncServer.js';

async function stopFixtureSync() {
  await stopLanWorkspaceSyncServer();
  let active = loadActiveDesktopSyncRun();
  while (active) {
    await active.catch(() => undefined);
    active = loadActiveDesktopSyncRun();
  }
}

export async function reopenAfterSyncStops() {
  await stopFixtureSync();
  closeDatabaseConnection();
  initializeDatabase();
}

let heldManualRound: { lease: SyncPeerRoundLease; peerId: string; remaining: number } | undefined;

export function holdSyncRound(args: Record<string, unknown>) {
  const peerId = String(args.identity);
  const lease = desktopSyncPeerRoundOwner().acquireOutbound(peerId, 'fixture-existing-round');
  if (!args.releaseAfterManualRounds) return;
  if (!lease) throw new Error('fixture_peer_already_busy');
  heldManualRound = { lease, peerId, remaining: Number(args.releaseAfterManualRounds) };
}

export async function runWithHeldSyncRound<T>(args: Record<string, unknown>, run: () => Promise<T>) {
  const held = heldManualRound;
  if (held?.peerId !== String(args.identity)) return run();
  try { return await run(); }
  finally {
    if (--held.remaining === 0) {
      held.lease.release();
      heldManualRound = undefined;
    }
  }
}

export async function startContendedSync(args: Record<string, unknown>) {
  await stopFixtureSync();
  const owner = desktopSyncPeerRoundOwner();
  const peerId = String(args.identity);
  const held = owner.acquireOutbound(peerId, 'fixture-held-round');
  if (!held) throw new Error('fixture_peer_already_busy');
  let observed!: () => void;
  const attempted = new Promise<void>(resolve => { observed = resolve; });
  const acquire = owner.acquireOutbound.bind(owner);
  owner.acquireOutbound = (peer, id) => {
    const result = acquire(peer, id);
    if (peer === peerId && !result) observed();
    return result;
  };
  const group = loadDesktopSyncGroup()!;
  const run = runDesktopSyncCoordinator('manual', { endpoint_url: String(args.origin),
    group_id: group.group_id, local_device_id: group.local_device_identity_key,
    peer_device_id: peerId, peer_device_name: 'Peer', peer_platform: 'darwin' });
  void run.catch(() => undefined);
  try { await Promise.race([attempted, run.then(() => { throw new Error('fixture_sync_did_not_contend'); })]); }
  finally { owner.acquireOutbound = acquire; }
}
