import type { ReviewSessionMode } from '../../../../features/review/model/reviewSessionMode';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../../../../store/workspaceNodeMetadataMutation';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function mutateCompanionWorkspace(command: WorkspaceMetadataCommand, flow?: { session: ReviewSessionState; mode: ReviewSessionMode }) {
  return runCompanionHistoryMutation(async db => {
    const host = await iosCompanionHostName(db);
    const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
    if (!snapshot) throw new Error('workspace_unavailable');
    const nodes = snapshot.nodesById;
    const now = new Date().toISOString();
    const mutation = buildWorkspaceMetadataMutation(command, nodes, now);
    const after = { ...nodes, ...Object.fromEntries(mutation.nodes.map(node => [node.id, node])) };
    const readings = command.type === 'rename' ? [] : maintainWorkspaceSnapshotSequentialReading({ before: nodes, after,
      changedNodeIds: [command.nodeId], nodeOrder: [...new Set([...snapshot.nodeOrder, command.nodeId])], now });
    for (const change of readings) if (after[change.nodeId]) after[change.nodeId] = { ...after[change.nodeId]!, reading: change.afterReading };
    const sessions = flow ? { beforeSession: flow.session, afterSession: flow.session } : undefined;
    const records = await Promise.all(mutation.nodes.map(node => createCompanionMetadataVersion(db, node, host)));
    await commitCompanionNodeHistoryWithDb(db, records, mutation.title,
      command.type === 'restore' ? 'local_restore' : 'local_mutation', mutation.subtreeNodeIds, readings, sessions);
    return command.nodeId;
  }, { kind: 'nodes', nodeIds: [command.nodeId], structure: true });
}
