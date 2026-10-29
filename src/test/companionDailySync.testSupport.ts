import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver';
import { createPeer, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary } from '../../electron/database/syncRequestLibrary.testSupport';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { runCompanionSyncMutationTask } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

import { now } from './dailyFlowExceptions.testSupport';

type Library = Awaited<ReturnType<typeof import('../shared/platform/companion/runtime/companionSearchSnapshot.testSupport').createSearchLibrary>>;
export async function connectCompanionPeer(library: Library) {
  await startLibraries();
  const desktop = createPeer('desktop');
  desktop.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  desktop.db.prepare('INSERT INTO companion_meta VALUES (?,?,?)').run('host_name', desktop.name, now);
  const file = path.join(library.root, 'library.db');
  const anchor = randomUUID();
  const identity = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group', library_path: file, path_flavor: 'posix' });
  const mobile: Peer = { id: identity.identity_key, name: 'Search', anchor, file, db: library.database,
    driver: createBetterSqlite3Driver(library.database), port: await getIosCompanionDatabaseOwner().read(async db => db) };
  joinPeers(mobile, desktop);
  return { desktop, mobile, async exchange() {
    await syncRequestLibrary(mobile, desktop);
    await runCompanionSyncMutationTask(() => getIosCompanionDatabaseOwner().runWriter(() =>
      syncRequestLibrary(desktop, mobile)), { kind: 'full' });
  } };
}
