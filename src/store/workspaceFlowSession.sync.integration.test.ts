// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries, sync } from '../../electron/database/syncEmptyLibraryTestSupport';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState';
import { isCompanionGradeDue } from '../companion/companionFlowMutation';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { reconcileFlowSession, resumeFlowSession } from './workspaceFlowSession';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('keeps the same Flow material after a peer edit and skips its remotely handled grade after production sync', async () => {
  const desktop = createPeer('desktop');
  const mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  for (const peer of [desktop, mobile]) {
    peer.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(peer.name);
  }
  edit(desktop, 'Question', 'Card', null, 'item');
  const review = { due: '2026-09-29T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 1, scheduledDays: 1, reps: 2, lapses: 0 };
  saveNodeReviewStateWithSync(desktop.driver, { nodeId: 'topic', hostName: desktop.name,
    review, updatedAt: '2026-09-30T00:00:00.000Z' });
  await sync(desktop, mobile);
  const initial = (await loadIosCompanionWorkspaceSnapshot(mobile.port))!;
  const now = '2026-10-03T00:00:00.000Z';
  const session = resumeFlowSession(initial, 'review-first', null, now);
  expect(session.currentNodeId).toBe('topic');
  session.isAnswerRevealed = true;
  edit(desktop, 'Corrected question', 'Card', null, 'item');
  saveNodeReviewStateWithSync(desktop.driver, { nodeId: 'topic', hostName: desktop.name,
    review: { ...review, due: '2099-01-01T00:00:00.000Z', reps: 3, lastReviewAt: now }, updatedAt: now });
  await sync(desktop, mobile);
  await sync(mobile, desktop);
  for (const peer of [desktop, mobile]) {
    assertPersisted(peer, 'Corrected question');
    expect(peer.db.prepare('SELECT due, reps FROM node_review WHERE node_id = ?').get('topic'))
      .toEqual({ due: '2099-01-01T00:00:00.000Z', reps: 3 });
    expect(peer.db.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(0);
  }
  const refreshed = (await loadIosCompanionWorkspaceSnapshot(mobile.port))!;
  expect(reconcileFlowSession(refreshed, session, 'review-first'))
    .toMatchObject({ currentNodeId: 'topic', isAnswerRevealed: true });
  expect(isCompanionGradeDue(refreshed, 'topic', now)).toBe(false);
  expect(resumeFlowSession(refreshed, 'review-first', 'topic', now).currentNodeId).toBeNull();
});
