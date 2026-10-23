import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import type { RequestSyncInventories } from '../../../../../../lib/core/sync/requestSyncDatabaseRound.js';
import type { CompanionDesktopSyncProgress } from '../../../companionDesktopSyncTypes.js';

/**
 * Counts an overwrite receive against the provider's whole inventory, so a round resumed after an
 * interruption continues from the objects this device already holds instead of starting from zero.
 */
export function createOverwriteReceiveProgress(report: ((progress: CompanionDesktopSyncProgress) => void) | undefined,
  receivingOverwrite: () => boolean) {
  let total: number | null = null;
  let present = 0;
  let received = 0;
  const emit = () => {
    if (total !== null) report?.({ phase: 'structure', completed: Math.min(total, present + received), total });
  };
  return {
    inventory(inventories: RequestSyncInventories) {
      if (!report || total !== null || !receivingOverwrite()) return inventories;
      const missing = new Set(compareFramedSyncDatabaseInventories(inventories)
        .filter(difference => difference.direction === 'remote_to_local')
        .map(difference => difference.globalId));
      total = inventories.remote.length;
      present = Math.max(0, total - missing.size);
      emit();
      return inventories;
    },
    received(count: number) {
      if (count === received) return;
      received = count;
      emit();
    }
  };
}
