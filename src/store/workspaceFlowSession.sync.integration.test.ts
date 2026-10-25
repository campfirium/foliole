// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { score } from '../../electron/database/reviewProjection.testSupport';
import { assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary as sync } from '../../electron/database/syncRequestLibrary.testSupport';
import { isCompanionGradeDue } from '../companion/companionFlowMutation';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { reconcileFlowSession, resumeFlowSession } from './workspaceFlowSession';

let desktop: ReturnType<typeof createPeer>;
let mobile: ReturnType<typeof createPeer>;

beforeEach(async () => {
  await startLibraries();
  desktop = createPeer('desktop');
  mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  for (const peer of [desktop, mobile]) {
    peer.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(peer.name);
  }
  edit(desktop, 'Question', 'Card', null, 'item');
  const reviewPeer = { sqlite: desktop.db, id: desktop.name };
  score(reviewPeer, 'flow-first', '2026-09-01T00:00:00.000Z');
  score(reviewPeer, 'flow-second', '2026-09-08T00:00:00.000Z');
  await sync(desktop, mobile);
});
afterEach(closeLibraries);

it('keeps the same Flow material after a peer edit and skips its remotely handled grade after production sync', async () => {
  const initial = await loadIosCompanionWorkspaceSnapshot(mobile.port);
  if (!initial) throw new Error('missing_initial_workspace');
  const now = '2026-10-03T00:00:00.000Z';
  expect(initial.nodesById.topic?.review?.reps).toBe(2);
  expect(isCompanionGradeDue(initial, 'topic', now)).toBe(true);
  const session = resumeFlowSession(initial, 'review-first', null, now);
  expect(session.currentNodeId).toBe('topic');
  session.isAnswerRevealed = true;
  edit(desktop, 'Corrected question', 'Card', null, 'item');
  const graded = score({ sqlite: desktop.db, id: desktop.name }, 'flow-third', now);
  expect(graded?.reps).toBe(3);
  const review = desktop.db.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  const log = desktop.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  expect(log).toHaveLength(3);
  await sync(desktop, mobile);
  await sync(mobile, desktop);
  for (const peer of [desktop, mobile]) {
    assertPersisted(peer, 'Corrected question');
    const read = new Database(peer.file, { readonly: true, fileMustExist: true });
    try {
      expect(read.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(review);
      expect(read.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(log);
    } finally { read.close(); }
  }
  const refreshed = await loadIosCompanionWorkspaceSnapshot(mobile.port);
  if (!refreshed) throw new Error('missing_refreshed_workspace');
  expect(reconcileFlowSession(refreshed, session, 'review-first'))
    .toMatchObject({ currentNodeId: 'topic', isAnswerRevealed: true });
  expect(isCompanionGradeDue(refreshed, 'topic', now)).toBe(false);
  expect(resumeFlowSession(refreshed, 'review-first', 'topic', now).currentNodeId).toBeNull();
});
