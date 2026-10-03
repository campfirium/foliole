import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { queryDesktopResourceAvailability } from './desktopResourceProviders.js';

let release: (() => void) | null = null;
let waiting = false;

// Hold only the outbound request boundary; authentication, HTTP and SQLite stay real.
export async function runResourceConcurrencyFixture(action: string, args: Record<string, unknown>) {
  if (action === 'resourceWaiting') return waiting;
  if (action === 'resourceRelease') { release?.(); return null; }
  if (action === 'resourceRead') return runWithDatabaseConnectionOwner(() =>
    openDatabaseConnection().driver.queryOne('SELECT COUNT(*) AS count FROM nodes'));
  const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup()!);
  const peer = { endpoint_url: String(args.origin), endpointUrl: String(args.origin),
    group_id: group.group_id, local_device_id: group.local_device_identity_key,
    peer_device_id: String(args.identity), deviceId: String(args.identity),
    peer_device_name: 'Peer', peer_platform: 'darwin' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (args.hold && String(input).endsWith('/sync-group/member-state')) {
      await new Promise<void>((resolve) => { release = resolve; waiting = true; });
      waiting = false;
    }
    return originalFetch(input, init);
  };
  try { return await queryDesktopResourceAvailability(peer, []); }
  finally { globalThis.fetch = originalFetch; release = null; waiting = false; }
}
