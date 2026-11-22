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
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion, createCompanionMetadataVersions } from './companionNodeHistory';
import { withStoredTrashReadings } from './companionTrashSequentialReading';
import { deriveCompanionWriteNodeOrder } from './companionWriteNodeOrder';
import { companionWriteNodeOrder, loadCompanionWriteNodes } from './companionWriteNodes';
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
    const createdRoots = command.type === 'create-index'
      ? await ensureSyncSpecialRootNodes(db, [{ nodeId: VIRTUAL_ROOT_NODE_ID, referencedAt: now }]) : [];
    const host = await iosCompanionHostName(db);
    // A single-node write reads only the nodes it consumes; a metadata edit never reads their attachments.
    const narrowNodes = await loadNarrowWriteNodes(db, command, host);
    const snapshot = narrowNodes ? null : await loadIosCompanionWorkspaceSnapshot(db);
    if (!narrowNodes && !snapshot) throw new Error('workspace_unavailable');
    const loaded = narrowNodes ?? snapshot!.nodesById;
    const mutation = buildWorkspaceMetadataMutation(command, loaded, now);
    // A restored topic retakes its Sequential Reading slot from its stored reading profile.
    const nodes = command.type === 'restore' ? await withStoredTrashReadings(db, loaded, mutation.nodes.map(node => node.id), host) : loaded;
    const after = { ...nodes, ...Object.fromEntries(mutation.nodes.map(node =>
      [node.id, nodes === loaded ? node : { ...node, reading: nodes[node.id]?.reading ?? node.reading }])) };
    // The narrow read holds every Sequential Reading source in reach and what maintaining it consumes.
    const readings = command.type === 'rename' ? [] : maintainWorkspaceSnapshotSequentialReading({ before: nodes, after,
      changedNodeIds: [command.nodeId], nodeOrder: snapshot ? await deriveCompanionWriteNodeOrder(db, snapshot, after)
        : [...new Set([...companionWriteNodeOrder(nodes), command.nodeId])], now });
    for (const change of readings) if (after[change.nodeId]) after[change.nodeId] = { ...after[change.nodeId]!, reading: change.afterReading };
    const sessions = flow ? { beforeSession: flow.session, afterSession: flow.session } : undefined;
    const records = await createCompanionMetadataVersions(db, mutation.nodes, host);
    await commitCompanionNodeHistoryWithDb(db, records, mutation.title,
      command.type === 'restore' ? 'local_restore' : 'local_mutation', mutation.subtreeNodeIds, readings, sessions, host);
    changed = { nodeIds: [...new Set([command.nodeId, ...mutation.nodes.map(node => node.id), ...createdRoots])],
      readingNodeIds: readings.map(change => change.nodeId) };
    return command.nodeId;
  }, () => ({ kind: 'nodes', nodeIds: changed.nodeIds, structure: true,
    // The write names every node and Sequential Reading change it made, even after a whole-library read,
    // so the refresh merges them as well and only falls back when the merge cannot be proven.
    ...(command.type === 'delete' ? { trash: true } : { metadata: true }),
    ...(changed.readingNodeIds.length ? { readingNodeIds: changed.readingNodeIds } : {}) }));
}

function loadNarrowWriteNodes(db: DbPort, command: Exclude<WorkspaceMetadataCommand, { type: 'set-priority' }>, host: string) {
  switch (command.type) {
    // A rename touches only the node and skips Sequential Reading maintenance.
    case 'rename': return loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: false, pathIds: [command.nodeId] });
    case 'create': return loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: true, pathIds: [command.nodeId, command.parentNodeId] });
    // A Dive sits at the root and a Virtual folder under the Virtual root; neither has children of its own,
    // so the creation only needs to know that the id is free.
    case 'create-dive': case 'create-index':
      return loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: true, pathIds: [command.nodeId] });
    // A move or a shelve changes only the node itself; its subtree is probed, never read.
    case 'move': return loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: true, keptIds: [command.nodeId], pathIds: [command.parentNodeId] });
    case 'shelve': case 'unshelve': return loadCompanionWriteNodes(db, [], { host, attachments: false, sequentialReading: true, keptIds: [command.nodeId] });
    case 'delete': case 'restore':
      return loadCompanionWriteNodes(db, [command.nodeId], { host, attachments: false, sequentialReading: true });
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
      await commitCompanionNodeHistoryWithDb(db, [record], mutation.title, 'local_mutation', null, [], undefined, host);
    }
    return command.nodeId;
  }, { kind: 'nodes', nodeIds: [command.nodeId], metadata: true });
}
