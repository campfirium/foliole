import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { readCompanionSyncIdentitySource } from './syncGroupIdentitySourceRead';

export function readCompanionLocalIdentitySource<T>(snapshotPath: string,
  readKind: string, extra: Record<string, unknown> = {}) {
  return getIosCompanionDatabaseOwner().read((port) =>
    readCompanionSyncIdentitySource(port, { snapshot_path: snapshotPath,
      read_kind: readKind, ...extra })) as Promise<T>;
}
