import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncNodeVersions';
import { saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';

export async function seedCompanionReviewHistory(profile: NodeReviewProfile, now: string, nodeIds = ['a', 'b', 'c'], kind: 'item' | 'topic' = 'item') {
  const records = await Promise.all(nodeIds.map(id => toWorkspaceNativeNodeVersion({
    id, title: id, content: id, kind, parentNodeId: null, reveal: kind === 'item' ? `Answer ${id}` : null, anchorLink: null,
    isTitleManual: true, hideTitleHeading: false, reading: null, review: profile,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: now }, 'remote', `base-${id}`)));
  await applyCompanionSyncNodeVersions(records);
  for (const nodeId of nodeIds) {
    for (const reviewedAt of ['2026-09-20T00:00:00.000Z', '2026-09-28T00:00:00.000Z']) {
      await saveCompanionSyncNodeReviewRecord({ nodeId, review: profile, reviewLog: {
        grade: 3, schedulerVersion: 'test', reviewedAt,
        cardBefore: { due: reviewedAt, stability: 0, difficulty: 0 },
        cardAfter: { due: reviewedAt, stability: 0, difficulty: 0 }
      } });
    }
  }
}
