import { createNewItemReviewProfiles } from './newItemReviewSlots';
import type { WorkspaceState } from './workspaceStore';

export function createImageClozeReviewProfile(state: WorkspaceState, timestamp: string) {
  return createNewItemReviewProfiles({
    batchSize: 1,
    nodesById: state.nodesById,
    now: timestamp
  })[0] ?? null;
}
