import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs } from '../../../../../lib/core/database/diveSourceEligibility';
import { appendDiveSources, readDiveNode, removeDirectDiveSources, type Dive } from '../../../../../lib/core/nodes/dive';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { saveCompanionVirtualDirectoryVersion } from './companionVirtualDirectoryVersion';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function addCompanionDiveSource(diveId: string, sourceId: string) {
  return changeCompanionDiveSources(diveId, async (db, dive) => {
    const [source] = await db.query(DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs(sourceId));
    if (!source) throw new Error('A Dive source is unavailable');
    return appendDiveSources(dive, [sourceId]);
  });
}

export function removeCompanionDiveSources(diveId: string, sourceIds: readonly string[]) {
  return changeCompanionDiveSources(diveId, (_db, dive) => removeDirectDiveSources(dive, sourceIds));
}

function changeCompanionDiveSources(diveId: string, change: (db: DbPort, dive: Dive) => Dive | Promise<Dive>) {
  return runCompanionHistoryMutation(async db => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, diveId);
    const dive = node && !node.deletedAt ? readDiveNode(node) : null;
    if (!node || !dive) throw new Error('Dive is unavailable');
    const updated = await change(db, dive);
    if (updated === dive) return;
    await saveCompanionVirtualDirectoryVersion(db, { ...node, updatedAt: new Date().toISOString() },
      await iosCompanionHostName(db), { manual_child_order: JSON.stringify(updated.directSourceIds) });
  }, { kind: 'nodes', nodeIds: [diveId], structure: true });
}
