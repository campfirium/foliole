import { materializeCurrentVersionBodyBlobs } from '../../../../../lib/core/sync/currentVersionBodyBlob';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export function materializeCompanionCurrentBodies(hashes: readonly string[]) {
  if (hashes.length === 0) return Promise.resolve(0);
  return getIosCompanionDatabaseOwner().runWriter((db) => db.transaction((tx) =>
    materializeCurrentVersionBodyBlobs(tx, { hashes })));
}
