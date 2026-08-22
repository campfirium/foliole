import { assertSyncPackCursorAdvance } from '../../../../../../lib/core/sync/syncPackCursorGuard';
import {
  NativeCompanionCapabilityUnavailableError,
  requireAvailableCompanionRuntime
} from '../../../companionRuntimeCapabilities';
import type { CompanionSqliteConnectionManager } from '../../../companionSyncNodeVersions';
import { applyCompanionSyncPackNodesWithDbPort } from '../../../companionSyncPackNodes';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';
import { createIosCompanionSyncPackCursorStore } from '../cursor/iosCompanionSyncPackCursorStore';

export async function applyIosCompanionSyncPackPath(
  args: { deviceId: string; hostName: string; packPath: string; sourceHostName?: string; sourcePeerId: string },
  manager?: CompanionSqliteConnectionManager
) {
  const runtime = requireAvailableCompanionRuntime('sync-pack-apply');
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    throw new NativeCompanionCapabilityUnavailableError('sync-pack-apply', runtime.platform);
  }
  const cursorStore = createIosCompanionSyncPackCursorStore(manager, args.sourcePeerId);
  if (manager) {
    const { applyCompanionSyncPackPathWithSharedCore } = await import('../../../companionSyncPackNodes');
    return runCompanionSyncWriterTask(() => applyCompanionSyncPackPathWithSharedCore(args, cursorStore, manager));
  }
  return runCompanionSyncWriterTask(async () => {
    const currentCursor = await cursorStore.loadCursor() ?? 0;
    const result = await getIosCompanionDatabaseOwner().runWriter((db) => applyCompanionSyncPackNodesWithDbPort({
      currentCursor, deviceId: args.deviceId, hostName: args.hostName,
      packPath: args.packPath, sourcePeerId: args.sourcePeerId,
      ...(args.sourceHostName === undefined ? {} : { sourceHostName: args.sourceHostName })
    }, db));
    assertSyncPackCursorAdvance({
      appliedFactCount: result.applied_group_fact_count,
      appliedObjectCount: result.applied_object_count,
      currentCursor,
      handledConflictCount: result.handled_conflict_count ?? 0,
      toStateSeq: result.to_state_seq
    });
    if (result.to_state_seq > currentCursor) await cursorStore.saveCursor(result.to_state_seq);
    return result;
  });
}
