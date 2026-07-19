import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import {
  NativeCompanionCapabilityUnavailableError,
  requireAvailableCompanionRuntime
} from '../../../companionRuntimeCapabilities';
import type { CompanionSqliteConnectionManager } from '../../../companionSyncNodeVersions';
import { applyCompanionSyncPackPathWithSharedCore } from '../../../companionSyncPackNodes';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { createIosCompanionSyncPackCursorStore } from '../cursor/iosCompanionSyncPackCursorStore';

export async function applyIosCompanionSyncPackPath(
  args: { deviceId: string; packPath: string },
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const runtime = requireAvailableCompanionRuntime('sync-pack-apply');
  if (runtime.kind !== 'ios-native') {
    throw new NativeCompanionCapabilityUnavailableError('sync-pack-apply', runtime.platform);
  }
  const cursorStore = createIosCompanionSyncPackCursorStore(manager);
  return runCompanionSyncWriterTask(() =>
    applyCompanionSyncPackPathWithSharedCore(args, cursorStore, manager)
  );
}
