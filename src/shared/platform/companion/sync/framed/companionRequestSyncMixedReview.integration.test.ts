// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport';
import * as companionRuntime from '../../../companionWorkspaceRuntimeRepository';
import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh';
import { invalidateCompanionReadingScope } from '../../reading/companionReadingScope';
import { loadIosCompanionWorkspaceSnapshot } from '../workspace-state/iosCompanionWorkspaceSnapshotStore';

it('preserves mobile grading and desktop text in the same HTTP sync round', async () => {
  invalidateCompanionReadingScope();
  const host = await createCompanionRequestFixture();
  const { persistFlowMutation } = await import('../../../../../companion/companionFlowMutation');
  const capability = vi.spyOn(companionRuntime, 'isNativeCompanionReviewWriteRuntime').mockReturnValue(true);
  try {
    await host.fixture.right.seed({ nodeId: 'writing-topic', title: 'Writing', content: 'Before' });
    await host.sync();
    const now = new Date().toISOString();
    const card: WorkspaceNodeSnapshot = { id: 'review-card', kind: 'item', parentNodeId: 'writing-topic',
      title: 'Question', content: 'Question', reveal: 'Answer', anchorLink: null,
      isTitleManual: false, hideTitleHeading: false, reading: null, review: null, createdAt: now, updatedAt: now };
    await applySyncNodesWithDbPort(host.db, [await toWorkspaceNativeNodeVersion(card, 'mobile', 'card-base')],
      { enqueueSearchInvalidations: false });
    await host.sync();
    const before = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    if (!before) throw new Error('fixture_snapshot_missing');
    await persistFlowMutation({ action: 'grade', snapshot: before, nodeId: card.id, now, grade: 3 });
    await host.fixture.right.seed({ nodeId: 'writing-topic', title: 'Writing', content: 'Desktop concurrent edit' });
    await host.sync();
    const after = await refreshCompanionWorkspaceSnapshot();
    expect(after).toEqual(await loadIosCompanionWorkspaceSnapshot(host.db));
    expect(after?.nodesById[card.id]?.review?.reps).toBe(1);
    const remote = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      for (const database of [host.sqlite, remote]) {
        expect(database.prepare("SELECT content FROM nodes WHERE id = 'writing-topic'").pluck().get())
          .toBe('Desktop concurrent edit');
        expect(database.prepare("SELECT reps FROM node_review WHERE node_id = 'review-card'").pluck().get()).toBe(1);
        expect(database.prepare("SELECT grade FROM review_log WHERE node_id = 'review-card'").pluck().all()).toEqual([3]);
      }
    } finally { remote.close(); }
  } finally {
    capability.mockRestore();
    invalidateCompanionReadingScope();
    await host.close();
  }
}, 30000);
