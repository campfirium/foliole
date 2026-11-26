import { loadSyncUnsyncedView } from '../../../../../lib/core/sync/syncUnsyncedView';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

export async function loadCompanionSyncUnsyncedItems() {
  return getIosCompanionDatabaseOwner().readSnapshot(loadSyncUnsyncedView);
}
