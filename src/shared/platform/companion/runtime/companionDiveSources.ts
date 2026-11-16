import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs } from '../../../../../lib/core/database/diveSourceEligibility';
import { appendDiveSources, readDiveNode } from '../../../../../lib/core/nodes/dive';
import { collectNodeVersionPayloads } from '../../../../../lib/core/sync/nodeVersionPayloadCollector';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { topicTextSnapshotHash } from '../../../../../lib/core/sync/topicTextSnapshotHash';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { createCompanionMetadataVersion } from './companionNodeHistory';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function addCompanionDiveSource(diveId: string, sourceId: string) {
  return runCompanionHistoryMutation(async db => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, diveId);
    const dive = node && !node.deletedAt ? readDiveNode(node) : null;
    if (!node || !dive) throw new Error('Dive is unavailable');
    const [source] = await db.query(DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs(sourceId));
    if (!source) throw new Error('A Dive source is unavailable');
    const updated = appendDiveSources(dive, [sourceId]);
    if (updated === dive) return;
    const version = await createCompanionMetadataVersion(db, { ...node, updatedAt: new Date().toISOString() },
      await iosCompanionHostName(db));
    version.snapshot.manual_child_order = JSON.stringify(updated.directSourceIds);
    version.content_hash = topicTextSnapshotHash(version.snapshot);
    const result = await applySyncNodesWithDbPort(db, [version], {
      enqueueSearchInvalidations: false, operation: 'local_mutation'
    });
    if (!result.appliedIds.includes(diveId) || result.conflictNodes.length) throw new Error('Dive was not saved');
    await collectNodeVersionPayloads(db, diveId, Number.MAX_SAFE_INTEGER);
  }, { kind: 'nodes', nodeIds: [diveId], structure: true });
}
