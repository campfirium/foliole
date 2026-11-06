import { normalizeFsrs7Card } from '../../lib/core/review/fsrs7Card';
import { toNodeReviewProfile, toSchedulerCard } from '../features/review/model/reviewTypes';
import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { projectBrowserReview } from '../shared/platform/runtime/browserReviewProjection';

import type { WorkspacePersistedState } from './workspaceStoreTypes';

/** Legacy browser imports follow the same single-model, available-history policy as SQLite upgrades. */
export function upgradeBrowserFsrs7(state: WorkspacePersistedState): WorkspacePersistedState {
  const legacy = Object.values(state.nodesById).filter(node => node.review && node.review.stabilityFast === undefined);
  const flow = state.browserDailyFlow ?? emptyBrowserDailyFlow();
  const oldBases = Object.values(flow.reviewBases).some(card => card && card.stability_fast === undefined);
  if (!legacy.length && !oldBases) return state;
  const migrated = { ...flow, reviewBases: Object.fromEntries(Object.entries(flow.reviewBases)
    .map(([id, card]) => [id, card ? normalizeFsrs7Card(card) : null])) };
  const nodesById = { ...state.nodesById };
  for (const node of legacy) {
    const card = projectBrowserReview(state, migrated, node.id)
      ?? normalizeFsrs7Card(toSchedulerCard(node.review, node.createdAt));
    nodesById[node.id] = { ...node, review: toNodeReviewProfile({ ...card, due: node.review!.due }) };
  }
  return { ...state, nodesById, browserDailyFlow: { ...migrated,
    state: migrated.state ? { ...migrated.state, invalidated: 1 } : null } };
}
