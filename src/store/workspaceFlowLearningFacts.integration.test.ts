// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { scopedDailyLearningSnapshot } from '../../lib/core/flow/dailyFlowGrade';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { assertDurable, node, now, open, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

it('uses display snapshots only for the receipt while Soon validates facts and selects its successor', async () => {
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const session = await open(peer, now, settings(peer), 'reading-only');
  const displayReadsAfterCommit: boolean[] = [];
  const opId = 'facts-soon';
  const result = await commitDailyFlow(peer.port, { opId, now, token: session.daily!, sourceSession: session,
    readingAction: 'soon', readings: [{ nodeId: session.currentNodeId!, before: null, after: null }] }, settings(peer), {
    ...persistence,
    snapshot: async (db, ids) => {
      displayReadsAfterCommit.push(Boolean(peer.db.prepare('SELECT 1 FROM daily_flow_operations WHERE op_id=?').get(opId)));
      return persistence.snapshot(db, ids);
    }
  });
  expect(displayReadsAfterCommit.every(Boolean)).toBe(true);
  expect(result.session.currentNodeId).not.toBe(session.currentNodeId);
  expect(result.session.readTopicCount).toBe(1);
  expect(peer.db.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
  await assertDurable(peer, result.session);
  expect((await readDailyFlow(peer.port))!.session).toEqual(result.session);
  expect((await open(peer, now, settings(peer), 'reading-only')).currentNodeId).toBe(result.session.currentNodeId);
});

it('reads parent visibility and learning profiles without opening display tables or transferring their payload', async () => {
  node(peer, 'folder', 'folder');
  node(peer, 'article', 'topic', 'folder');
  peer.db.prepare("UPDATE nodes SET content=?, body_blob_hash='missing-body' WHERE id='article'")
    .run('---\ncollections: [irrelevant]\n---\nprivate display body');
  peer.db.exec('ALTER TABLE content_blobs RENAME TO unavailable_display_blobs');
  const facts = await scopedDailyLearningSnapshot(peer.port, persistence, ['article']);
  expect(Object.keys(facts.nodesById).sort()).toEqual(['article', 'folder']);
  expect(facts.nodesById.article).toMatchObject({ parentNodeId: 'folder', kind: 'topic', hasContent: true,
    reading: null, review: null });
  for (const field of ['title', 'content', 'reveal', 'collections', 'attachments', 'readwiseRemoteLifecycle', 'openingText']) {
    expect(facts.nodesById.article).not.toHaveProperty(field);
  }
  peer.db.prepare("UPDATE nodes SET shelved_at=? WHERE id='folder'").run(now);
  expect((await scopedDailyLearningSnapshot(peer.port, persistence, ['article'])).nodesById.folder!.shelvedAt).toBe(now);
  peer.db.prepare("UPDATE nodes SET deleted_at=? WHERE id='folder'").run(now);
  const deleted = await scopedDailyLearningSnapshot(peer.port, persistence, ['article']);
  expect(deleted.trashedNodeIds).toContain('folder');
});
