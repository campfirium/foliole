import { canMergeWorkspaceContentProjection, mergeWorkspaceContentProjection } from '../../../../lib/core/database/workspaceContentProjection.js';
import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import type { WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';
import type { WorkspaceNodeAnchorKinds } from '../../../../lib/core/nodes/workspaceNodePriorityState.js';
import type { DbPort } from '../../../../lib/core/sync/dbPort.js';

import { mergeCompanionLearningSnapshot } from './companionLearningSnapshotRefresh.js';
import { mergeCompanionNodeViews } from './companionNodeViewProjection.js';
import { companionWorkspaceSnapshots, prepareCompanionWorkspaceIndex, registerCompanionWorkspaceRefresh } from './companionWorkspaceSnapshotStore.js';
import { attachOpenCompanionVirtualFolderResults } from './runtime/companionVirtualFolderResults.js';
import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionContentProjection } from './sync/workspace-state/companionContentProjection.js';
import { mergeCompanionLocalState } from './sync/workspace-state/companionLocalStateProjection.js';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore.js';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

async function readSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  const owner = getIosCompanionDatabaseOwner();
  const revision = owner.nodePriorityRevision;
  let orderedNodeIds: readonly string[] | undefined;
  let anchorKinds: WorkspaceNodeAnchorKinds | undefined;
  const snapshot = await owner.readSnapshot(async db => {
    const scoped = input.current && input.scope.kind === 'nodes' && !input.scope.structure
      ? await readScoped(db, input.current, input.scope) : null;
    const next = scoped ?? await loadIosCompanionWorkspaceSnapshot(db, (ids, kinds) => { orderedNodeIds = ids; anchorKinds = kinds; });
    return next && attachOpenCompanionVirtualFolderResults(db, next);
  });
  if (snapshot) await prepareCompanionWorkspaceIndex(owner, snapshot, revision, orderedNodeIds, anchorKinds);
  return snapshot;
}

/** Returns null when the committed scope cannot be proven against this baseline. */
async function readScoped(db: DbPort, current: WorkspaceSnapshot, scope: NodeScope) {
  const reviewed = scope.reviewNodeIds ?? [];
  const reading = scope.readingNodeIds ?? [];
  if (!scope.nodeIds.length) {
    const learning = await mergeCompanionLearningSnapshot(db, current, reviewed, reading);
    return learning && mergeCompanionLocalState(db, learning, scope);
  }
  const roots = new Set([...scope.nodeIds, ...reviewed, ...reading]);
  let next = current;
  if (roots.size) {
    const projection = await loadCompanionContentProjection(db, [...roots]);
    const nodes = Object.fromEntries(Object.entries(projection).map(([id, node]) => {
      const lifecycle = current.nodesById[id]?.readwiseRemoteLifecycle;
      return [id, lifecycle !== undefined ? { ...node, readwiseRemoteLifecycle: lifecycle } : node];
    }));
    const expected = Object.values(current.nodesById)
      .filter(node => roots.has(node.id) || (node.parentNodeId !== null && roots.has(node.parentNodeId)))
      .map(node => node.id);
    if (!canMergeWorkspaceContentProjection(current, nodes, expected, reviewed, reading)) return null;
    next = await mergeCompanionNodeViews(db, mergeWorkspaceContentProjection(current, nodes), Object.keys(nodes));
  }
  return mergeCompanionLocalState(db, next, scope);
}

export async function refreshCompanionWorkspaceSnapshot(scope?: WorkspaceRefreshScope) {
  if (scope) registerCompanionWorkspaceRefresh(scope);
  if (!companionWorkspaceSnapshots.getSnapshot()) companionWorkspaceSnapshots.register({ kind: 'full' });
  await companionWorkspaceSnapshots.refresh(readSnapshot);
  return companionWorkspaceSnapshots.getSnapshot();
}
