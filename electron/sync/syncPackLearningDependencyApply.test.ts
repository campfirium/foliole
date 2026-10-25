// @vitest-environment node
import { expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { reviewFacts, score } from '../database/reviewProjection.testSupport.js';
import { reading, seedReading, sendReadingNode } from '../database/syncPackLearningStateEndToEnd.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { sendCurrentObject } from './currentRequestLearning.testSupport.js';

it('receives learning state together with its previously absent node through current requests', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const expected = seedReading(source, 'node-reading-1');
    for (let replay = 0; replay < 2; replay++) {
      await sendReadingNode(source, target, 'node-reading-1'); target.reopen();
      expect(target.sqlite.prepare("SELECT title FROM nodes WHERE id = 'node-reading-1'").get()).toEqual({ title: 'Reading Topic' });
      expect(reading(target, 'node-reading-1')).toEqual(expected);
    }
  } finally { await fixture.close(); }
});

it('preserves complete reading and review state when a current request trashes its node', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = textBranch('base', 'Original body', undefined, '2026-05-04T01:00:00.000Z');
    await applySyncNodesWithDbPort(source.db, [base]); await sendCurrentObject(source, target);
    target.sqlite.exec(`INSERT INTO node_reading
      (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state)
      VALUES ('topic', 60000, 1, '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z', 0, 1, 'active')`);
    score(target, 'review-before-trash', '2026-05-04T01:00:00.000Z');
    const progress = target.sqlite.prepare("SELECT * FROM node_reading WHERE node_id = 'topic'").get();
    const review = target.sqlite.prepare("SELECT * FROM node_review WHERE node_id = 'topic'").get();
    const facts = reviewFacts(target);
    expect(facts).toHaveLength(1);
    const deleted = textBranch('deleted', 'Original body', base, '2026-05-04T02:00:00.000Z');
    deleted.snapshot.deleted_at = '2026-05-04T02:00:00.000Z';
    deleted.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(deleted.snapshot), content: deleted.body_text! });
    await applySyncNodesWithDbPort(source.db, [deleted]);
    for (let replay = 0; replay < 2; replay++) {
      await sendCurrentObject(source, target); target.reopen();
      expect(target.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'topic'").get())
        .toEqual({ deleted_at: '2026-05-04T02:00:00.000Z' });
      expect(target.sqlite.prepare("SELECT * FROM node_reading WHERE node_id = 'topic'").get()).toEqual(progress);
      expect(target.sqlite.prepare("SELECT * FROM node_review WHERE node_id = 'topic'").get()).toEqual(review);
      expect(reviewFacts(target)).toEqual(facts);
      expect(target.sqlite.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all())
        .toEqual([{ version_id: 'base', body_text: null }, { version_id: 'deleted', body_text: 'Original body' }]);
    }
  } finally { await fixture.close(); }
});
