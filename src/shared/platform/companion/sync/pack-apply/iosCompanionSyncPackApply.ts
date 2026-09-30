import { assertSyncPackCursorAdvance } from '../../../../../../lib/core/sync/syncPackCursorGuard';
import {
  assertSyncPackFactClaimsStillHeld,
  type SyncPackFactClaims,
  type SyncPackFactIndex
} from '../../../../../../lib/core/sync/syncPackFactPresence';
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
  args: { deviceId: string; expectedRestoreId?: string; hostName: string;
    packPath: string; sourceHostName?: string; sourcePeerId: string;
    factClaims?: { index: SyncPackFactIndex; claims: SyncPackFactClaims } },
  manager?: CompanionSqliteConnectionManager
) {
  const runtime = requireAvailableCompanionRuntime('sync-pack-apply');
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    throw new NativeCompanionCapabilityUnavailableError('sync-pack-apply', runtime.platform);
  }
  const cursorStore = createIosCompanionSyncPackCursorStore(manager, args.sourcePeerId);
  if (manager) {
    const { applyCompanionSyncPackPathWithSharedCore } = await import('../../../companionSyncPackNodes');
    return runCompanionSyncWriterTask(() => applyCompanionSyncPackPathWithSharedCore({
      ...args, ...(args.factClaims ? { expectedFactIndex: args.factClaims.index } : {})
    }, cursorStore, manager));
  }
  return runCompanionSyncWriterTask(async () => {
    if (args.expectedRestoreId && !cursorStore.loadRestoreCursor) {
      throw new Error('sync_group_restore_cursor_unavailable');
    }
    const currentCursor = args.expectedRestoreId
      ? await cursorStore.loadRestoreCursor!(args.expectedRestoreId) : await cursorStore.loadCursor() ?? 0;
    const result = await getIosCompanionDatabaseOwner().runWriter(async (db) => {
      if (args.factClaims) {
        await assertSyncPackFactClaimsStillHeld(db, args.factClaims.index, args.factClaims.claims);
      }
      return applyCompanionSyncPackNodesWithDbPort({
        currentCursor, deviceId: args.deviceId, hostName: args.hostName,
        recordVersionReceipt: true,
        packPath: args.packPath, sourcePeerId: args.sourcePeerId,
        ...(args.factClaims ? { expectedFactIndex: args.factClaims.index } : {}),
        ...(args.expectedRestoreId ? { expectedRestoreId: args.expectedRestoreId } : {}),
        ...(args.sourceHostName === undefined ? {} : { sourceHostName: args.sourceHostName })
      }, db);
    });
    if (result.dependencyProgress || result.restore_pending) return result;
    if (!args.expectedRestoreId || result.applied) assertSyncPackCursorAdvance({
      appliedFactCount: result.applied_group_fact_count,
      appliedObjectCount: result.applied_object_count,
      currentCursor,
      handledConflictCount: result.handled_conflict_count ?? 0,
      toStateSeq: result.to_state_seq,
      verifiedEmptyPage: result.verified_empty_page === true
    });
    if (result.to_state_seq > currentCursor) await cursorStore.saveCursor(result.to_state_seq);
    return result;
  });
}
