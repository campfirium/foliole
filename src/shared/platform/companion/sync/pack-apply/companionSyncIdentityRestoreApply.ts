import { applySyncIdentityRestoreWithDbPort } from '../../../../../../lib/core/sync/syncIdentityRestoreApply.js';
import { loadSyncIdentityRestorePage } from '../../../../../../lib/core/sync/syncIdentityRestorePageStorage.js';
import { NativeCompanionCapabilityUnavailableError,
  requireAvailableCompanionRuntime } from '../../../companionRuntimeCapabilities';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { withCompanionForegroundTimeMaintenance } from '../../runtime/companionForegroundTime';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';
import { stageCompanionSyncIdentityRestore } from '../syncGroupIdentityRestoreStage';
import { withCompanionSyncIdentitySnapshot } from '../syncGroupIdentitySourceRead';

type StagedRestore = Awaited<ReturnType<typeof stageCompanionSyncIdentityRestore>>;

/** Restore through one native SQLite writer transaction after every page is staged. */
export async function applyCompanionSyncIdentityRestore(args: {
  hostName: string;
  peerHostName?: string;
  snapshotPath: string;
  staged: StagedRestore;
}) {
  const runtime = requireAvailableCompanionRuntime('sync-pack-apply');
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    throw new NativeCompanionCapabilityUnavailableError('sync-pack-apply', runtime.platform);
  }
  if (args.staged.pages.length > 0 && !args.staged.replayPackPath) {
    throw new Error('sync_identity_restore_replay_missing');
  }
  return withCompanionForegroundTimeMaintenance(() => runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, args.snapshotPath, async (db) => {
      if (args.staged.replayPackPath) {
        await db.run(`ATTACH DATABASE '${args.staged.replayPackPath.replaceAll("'", "''")}' AS inc`);
      }
      try {
        return await applySyncIdentityRestoreWithDbPort(db, {
          set: args.staged.set,
          pages: args.staged.pages.map((page) => page.manifest),
          hostName: args.hostName,
          ...(args.peerHostName ? { sourceHostName: args.peerHostName } : {}),
          enqueueSearchInvalidations: false,
          loadPage: loadSyncIdentityRestorePage
        });
      } finally {
        if (args.staged.replayPackPath) await db.run('DETACH DATABASE inc');
      }
    }))));
}
