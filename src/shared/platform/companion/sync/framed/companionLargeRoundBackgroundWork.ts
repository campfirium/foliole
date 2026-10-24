import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import type { RequestSyncInventories } from '../../../../../../lib/core/sync/requestSyncDatabaseRound.js';
import { holdCompanionSyncBackgroundWork, isCompanionSyncBackgroundWorkHeld,
  type CompanionSyncBackgroundWork } from '../../runtime/companionSyncBackgroundWork.js';

/** Rounds smaller than this finish in seconds; frequent small syncs never show a notification. */
export const LARGE_ROUND_DIFFERENCES = 100;

/** Keeps a round running off screen once its inventory shows a large difference. */
export function createLargeRoundBackgroundWork() {
  let work: CompanionSyncBackgroundWork | null = null;
  let decided = false;
  let total = 0;
  let transferred = 0;
  return {
    inventory(inventories: RequestSyncInventories) {
      // A longer owner such as group adoption already holds the work and reports its own progress.
      if (decided || isCompanionSyncBackgroundWorkHeld()) return inventories;
      decided = true;
      total = compareFramedSyncDatabaseInventories(inventories).length;
      if (total < LARGE_ROUND_DIFFERENCES) return inventories;
      work = holdCompanionSyncBackgroundWork();
      work.report(0, total);
      return inventories;
    },
    transferred(count: number) {
      if (!work) return;
      transferred = Math.min(total, transferred + count);
      work.report(transferred, total);
    },
    release() {
      work?.release();
    }
  };
}
