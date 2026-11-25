import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { normalizeNodeDesiredRetention } from '../../../../features/nodes/model/nodeReviewSettings';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { iosCompanionHostName } from './iosCompanionMutationState';

/** One branch's own review option; null clears it so the branch inherits again. */
export type CompanionNodeReviewOption =
  | { desiredRetention: number | null }
  | { enableShortTerm: boolean | null };

export function setCompanionNodeReviewOption(nodeId: string, option: CompanionNodeReviewOption) {
  return runCompanionHistoryMutation(async db => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, nodeId);
    if (!node || node.deletedAt || node.virtualFilter || node.id.startsWith('special-')) throw new Error('node_review_options_unavailable');
    const next = { ...node, updatedAt: new Date().toISOString() };
    if ('desiredRetention' in option) {
      const value = option.desiredRetention === null ? null : normalizeNodeDesiredRetention(option.desiredRetention);
      if ((node.desiredRetention ?? null) === value) return nodeId;
      next.desiredRetention = value;
    } else {
      if ((node.enableShortTerm ?? null) === option.enableShortTerm) return nodeId;
      next.enableShortTerm = option.enableShortTerm;
    }
    const host = await iosCompanionHostName(db);
    const record = await createCompanionMetadataVersion(db, next, host);
    await commitCompanionNodeHistoryWithDb(db, [record], 'Review options', 'local_mutation', null, [], undefined, host);
    return nodeId;
  }, { kind: 'nodes', nodeIds: [nodeId], metadata: true });
}
