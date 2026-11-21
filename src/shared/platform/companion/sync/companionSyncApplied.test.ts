import { afterEach, expect, it } from 'vitest';

import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import { publishCompanionSyncMembershipChanged, subscribeCompanionSyncApplied } from './companionSyncApplied';
import { getCompanionSyncMutationRevision } from './mutation/companionSyncMutationRevision';

afterEach(() => { companionWorkspaceSnapshots.reset(null); });

it('rereads the library when a group membership changes, not on the next edit', async () => {
  const baseline = { nodesById: {} } as never;
  companionWorkspaceSnapshots.reset(baseline);
  const scopes: WorkspaceRefreshScope[] = [];
  const read = async ({ current, scope }: { current: never; scope: WorkspaceRefreshScope }) => { scopes.push(scope); return current; };
  let applied: Promise<void> | undefined;
  const unsubscribe = subscribeCompanionSyncApplied(() => { applied = companionWorkspaceSnapshots.refresh(read); });
  const revision = getCompanionSyncMutationRevision();

  publishCompanionSyncMembershipChanged();
  await applied;
  expect(getCompanionSyncMutationRevision()).toBe(revision + 1);
  expect(scopes).toEqual([{ kind: 'full' }]);

  // The edit that follows refreshes only the nodes it wrote.
  companionWorkspaceSnapshots.register({ kind: 'nodes', nodeIds: ['new'], structure: true, metadata: true });
  await companionWorkspaceSnapshots.refresh(read);
  expect(scopes[1]).toEqual({ kind: 'nodes', nodeIds: ['new'], structure: true, metadata: true });
  unsubscribe();
});
