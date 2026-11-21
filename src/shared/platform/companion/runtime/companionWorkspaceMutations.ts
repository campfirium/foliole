import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs } from '../../../../../lib/core/database/diveSourceEligibility';
import { VIRTUAL_ROOT_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import { ensureSyncSpecialRootNodes } from '../../../../../lib/core/sync/syncSpecialRootNodes';
import type { ReviewSessionMode } from '../../../../features/review/model/reviewSessionMode';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { loadCompanionTrashWriteNodes } from './companionTrashWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function mutateCompanionWorkspace(command: WorkspaceMetadataCommand, flow?: { session: ReviewSessionState; mode: ReviewSessionMode }) {
  if (command.type === 'set-priority') return setCompanionPriority(command);
  // The refresh names every node this write changed so a move to Trash can merge instead of rereading the library.
  let changed = { nodeIds: [command.nodeId], readingNodeIds: [] as string[] };
  return runCompanionHistoryMutation(async db => {
    if (command.type === 'create-dive' && command.sourceId) {
      const [source] = await db.query(DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs(command.sourceId));
      if (!source) throw new Error('A Dive source is unavailable');
    }
    const now = new Date().toISOString();
    if (command.type === 'create-index') await ensureSyncSpecialRootNodes(db, [{ nodeId: VIRTUAL_ROOT_NODE_ID, referencedAt: now }]);
    const host = await iosCompanionHostName(db);
    // A move to Trash reads only the nodes it consumes; anything else needs the whole library.
    const trashNodes = command.type === 'delete'
      ? await loadCompanionTrashWriteNodes(db, [command.nodeId], { sequentialReading: true }) : null;
    const snapshot = trashNodes ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!trashNodes && !snapshot) throw new Error('workspace_unavailable');
    const nodes = trashNodes ?? snapshot!.nodesById;
    const mutation = buildWorkspaceMetadataMutation(command, nodes, now);
    const after = { ...nodes, ...Object.fromEntries(mutation.nodes.map(node => [node.id, node])) };
    // The narrow Trash read already proved that no Sequential Reading source or locked item is in reach.
    const readings = command.type === 'rename' || !snapshot ? [] : maintainWorkspaceSnapshotSequentialReading({ before: nodes, after,
      changedNodeIds: [command.nodeId], nodeOrder: [...new Set([...snapshot.nodeOrder, command.nodeId])], now });
    for (const change of readings) if (after[change.nodeId]) after[change.nodeId] = { ...after[change.nodeId]!, reading: change.afterReading };
    const sessions = flow ? { beforeSession: flow.session, afterSession: flow.session } : undefined;
    const records = await Promise.all(mutation.nodes.map(node => createCompanionMetadataVersion(db, node, host)));
    await commitCompanionNodeHistoryWithDb(db, records, mutation.title,
      command.type === 'restore' ? 'local_restore' : 'local_mutation', mutation.subtreeNodeIds, readings, sessions);
    changed = { nodeIds: [...new Set([command.nodeId, ...mutation.nodes.map(node => node.id)])],
      readingNodeIds: readings.map(change => change.nodeId) };
    return command.nodeId;
  }, () => ({ kind: 'nodes', nodeIds: changed.nodeIds, structure: true, ...(command.type === 'delete' ? { trash: true } : {}),
    ...(changed.readingNodeIds.length ? { readingNodeIds: changed.readingNodeIds } : {}) }));
}

function setCompanionPriority(command: Extract<WorkspaceMetadataCommand, { type: 'set-priority' }>) {
  return runCompanionHistoryMutation(async db => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, command.nodeId);
    const nodes = node ? { [node.id]: node } : {};
    const mutation = buildWorkspaceMetadataMutation(command, nodes, new Date().toISOString());
    const next = mutation.nodes[0];
    if (next) {
      const host = await iosCompanionHostName(db);
      const record = await createCompanionMetadataVersion(db, next, host);
      await commitCompanionNodeHistoryWithDb(db, [record], mutation.title);
    }
    return command.nodeId;
  }, { kind: 'nodes', nodeIds: [command.nodeId] });
}
