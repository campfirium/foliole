import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs } from '../../../../../lib/core/database/diveSourceEligibility';
import { VIRTUAL_ROOT_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { ensureSyncSpecialRootNodes } from '../../../../../lib/core/sync/syncSpecialRootNodes';
import type { ReviewSessionMode } from '../../../../features/review/model/reviewSessionMode';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function mutateCompanionWorkspace(command: WorkspaceMetadataCommand, flow?: { session: ReviewSessionState; mode: ReviewSessionMode }) {
  if (command.type === 'set-priority') return setCompanionPriority(command);
  // The refresh names every node this write changed so a move to Trash can merge instead of rereading the library.
  let changed = { nodeIds: [command.nodeId], readingNodeIds: [] as string[], narrow: false };
  return runCompanionHistoryMutation(async db => {
    if (command.type === 'create-dive' && command.sourceId) {
      const [source] = await db.query(DIVE_SOURCE_ELIGIBILITY_SQL, diveSourceEligibilityArgs(command.sourceId));
      if (!source) throw new Error('A Dive source is unavailable');
    }
    const now = new Date().toISOString();
    if (command.type === 'create-index') await ensureSyncSpecialRootNodes(db, [{ nodeId: VIRTUAL_ROOT_NODE_ID, referencedAt: now }]);
    const host = await iosCompanionHostName(db);
    // A single-node write reads only the nodes it consumes; a Dive or Virtual creation needs the whole library.
    const narrowNodes = await loadNarrowWriteNodes(db, command);
    const snapshot = narrowNodes ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!narrowNodes && !snapshot) throw new Error('workspace_unavailable');
    const nodes = narrowNodes ?? snapshot!.nodesById;
    const mutation = buildWorkspaceMetadataMutation(command, nodes, now);
    const after = { ...nodes, ...Object.fromEntries(mutation.nodes.map(node => [node.id, node])) };
    // The narrow read already proved that no Sequential Reading source or locked item is in reach.
    const readings = command.type === 'rename' || !snapshot ? [] : maintainWorkspaceSnapshotSequentialReading({ before: nodes, after,
      changedNodeIds: [command.nodeId], nodeOrder: [...new Set([...snapshot.nodeOrder, command.nodeId])], now });
    for (const change of readings) if (after[change.nodeId]) after[change.nodeId] = { ...after[change.nodeId]!, reading: change.afterReading };
    const sessions = flow ? { beforeSession: flow.session, afterSession: flow.session } : undefined;
    const records = await Promise.all(mutation.nodes.map(node => createCompanionMetadataVersion(db, node, host)));
    await commitCompanionNodeHistoryWithDb(db, records, mutation.title,
      command.type === 'restore' ? 'local_restore' : 'local_mutation', mutation.subtreeNodeIds, readings, sessions);
    changed = { nodeIds: [...new Set([command.nodeId, ...mutation.nodes.map(node => node.id)])],
      readingNodeIds: readings.map(change => change.nodeId), narrow: narrowNodes !== null };
    return command.nodeId;
  }, () => ({ kind: 'nodes', nodeIds: changed.nodeIds, structure: true,
    // A narrow write changed only the nodes it names, so the refresh merges them as well.
    ...(command.type === 'delete' ? { trash: true } : changed.narrow ? { metadata: true } : {}),
    ...(changed.readingNodeIds.length ? { readingNodeIds: changed.readingNodeIds } : {}) }));
}

function loadNarrowWriteNodes(db: DbPort, command: Exclude<WorkspaceMetadataCommand, { type: 'set-priority' }>) {
  switch (command.type) {
    // A rename touches only the node and skips Sequential Reading maintenance.
    case 'rename': return loadCompanionWriteNodes(db, [], { sequentialReading: false, pathIds: [command.nodeId] });
    case 'create': return loadCompanionWriteNodes(db, [], { sequentialReading: true, pathIds: [command.nodeId, command.parentNodeId] });
    case 'move': return loadCompanionWriteNodes(db, [command.nodeId], { sequentialReading: true, pathIds: [command.parentNodeId] });
    case 'delete': case 'restore': case 'shelve': case 'unshelve':
      return loadCompanionWriteNodes(db, [command.nodeId], { sequentialReading: true });
    default: return null;
  }
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
  }, { kind: 'nodes', nodeIds: [command.nodeId], metadata: true });
}
