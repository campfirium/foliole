import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs } from '../../../../../lib/core/database/diveSourceEligibility';
import { appendDiveSources, readDiveNode } from '../../../../../lib/core/nodes/dive';

import { saveCompanionDiveDirectoryVersion } from './companionDiveDirectoryVersion';
import { runCompanionHistoryMutation } from './companionFlowHistory';
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
    await saveCompanionDiveDirectoryVersion(db, { ...node, updatedAt: new Date().toISOString() },
      await iosCompanionHostName(db), { manual_child_order: JSON.stringify(updated.directSourceIds) });
  }, { kind: 'nodes', nodeIds: [diveId], structure: true });
}
