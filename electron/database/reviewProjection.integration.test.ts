// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { recomputeReview } from '../../lib/core/review/recomputeReview.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncReviewLogApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, secondAt, seedReviewPeer, score, reset, history, reviewState, reviewFacts, sendReviews } from './reviewProjection.testSupport.js';
import { legacyReviewFact } from './reviewStateSyncRetirement.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

it.each(['relay', 'offline', 'late-history'])('converges all durable card fields through production requests: %s', async mode => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seedReviewPeer(a); await seedReviewPeer(b);
    score(a, 'earlier', firstAt);
    if (mode === 'relay') await sendReviews(a, b);
    score(b, 'later', secondAt, 1);
    if (mode === 'late-history') score(b, 'third', '2026-10-09T08:00:00.000Z', 4);
    await sendReviews(a, b); await sendReviews(b, a);
    a.reopen(); b.reopen();
    expect(reviewFacts(a)).toEqual(reviewFacts(b));
    expect(reviewState(a)).toEqual(reviewState(b));
    expect(a.sqlite.prepare('SELECT reps FROM node_review').get()).toEqual({ reps: mode === 'late-history' ? 3 : 2 });
    const before = reviewState(a);
    await sendReviews(a, b); await sendReviews(b, a);
    expect(reviewState(a)).toEqual(before);
  } finally { await f.close(); }
});

it.each(['2026-10-02T08:00:00.000Z', '2026-10-04T08:00:00.000Z'])('orders reset and offline scoring by fact time: %s', async at => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seedReviewPeer(a); await seedReviewPeer(b);
    score(a, 'first', firstAt); await sendReviews(a, b);
    reset(a, at); score(b, 'offline', secondAt);
    await sendReviews(a, b); await sendReviews(b, a); a.reopen(); b.reopen();
    expect(reviewFacts(a)).toEqual(reviewFacts(b));
    expect(reviewState(a)).toEqual(reviewState(b));
    if (at < secondAt) expect(a.sqlite.prepare('SELECT reps FROM node_review').get()).toEqual({ reps: 1 });
    else expect(reviewState(a)).toEqual([]);
  } finally { await f.close(); }
});

it('ignores a later empty snapshot with duplicate facts and does not recalculate after a retention change', async () => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seedReviewPeer(a); await seedReviewPeer(b);
    score(a, 'first', firstAt); await sendReviews(a, b);
    history(a, 'undo', 'first', '2026-10-04T12:00:00.000Z');
    const control = identityReviewRowSchema.parse(a.sqlite.prepare("SELECT * FROM review_log WHERE kind='void'").get());
    await applyReviewLogRecordsWithDbPort(b.db, [control]);
    const card = score(b, 'offline', secondAt);
    expect(card?.reps).toBe(1);
    const before = reviewState(b); const facts = reviewFacts(b);


    b.sqlite.prepare(`INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('review_scheduler_settings', 'user_space', 'macos', 'desktop', '*', '{"desiredRetention":0.99}', 'hash', 'now')`).run();
    await sendReviews(a, b, true, [legacyReviewFact('topic', true)]); b.reopen();
    await sendReviews(a, b, true, [legacyReviewFact('topic', false)]);
    expect(reviewFacts(b)).toEqual(facts); expect(reviewState(b)).toEqual(before);
    await sendReviews(b, a); a.reopen();
    expect(reviewState(a)).toEqual(before);
  } finally { await f.close(); }
});

it('skips a void target arriving later and redoes with a new fact rather than restoring a snapshot', async () => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seedReviewPeer(a); await seedReviewPeer(b);
    score(a, 'first', firstAt); history(a, 'undo', 'first', secondAt);
    const control = identityReviewRowSchema.parse(a.sqlite.prepare("SELECT * FROM review_log WHERE kind='void'").get());
    await applyReviewLogRecordsWithDbPort(b.db, [control]);
    await sendReviews(a, b); expect(reviewState(b)).toEqual([]);
    history(a, 'redo', 'first', '2026-10-05T08:00:00.000Z');
    await sendReviews(a, b); await sendReviews(b, a);
    expect(reviewState(a)).toEqual(reviewState(b));
    expect(a.sqlite.prepare('SELECT reps, last_review_at FROM node_review').get())
      .toEqual({ reps: 1, last_review_at: '2026-10-05T08:00:00.000Z' });
    const events = reviewFacts(a).map(row => identityReviewRowSchema.parse(row));
    expect(recomputeReview(events, DEFAULT_REVIEW_SCHEDULER_SETTINGS)?.reps).toBe(1);
  } finally { await f.close(); }
});

it('rolls back local and received facts when projection storage fails, then retries safely', async () => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seedReviewPeer(a); await seedReviewPeer(b); score(a, 'first', firstAt);
    const reject = "CREATE TRIGGER reject_projection BEFORE INSERT ON node_review BEGIN SELECT RAISE(ABORT, 'full'); END";
    b.sqlite.exec(reject);
    expect(() => score(b, 'local-fail', secondAt)).toThrow('full'); expect(reviewFacts(b)).toEqual([]);
    await expect(sendReviews(a, b)).rejects.toThrow('full'); expect(reviewFacts(b)).toEqual([]);
    b.reopen(); b.sqlite.exec('DROP TRIGGER reject_projection');
    await sendReviews(a, b); await sendReviews(a, b);
    expect(reviewFacts(b)).toEqual(reviewFacts(a)); expect(reviewState(b)).toEqual(reviewState(a));
  } finally { await f.close(); }
});

it('does not overwrite progress on content saves, retention changes or duplicate local scores', async () => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer); score(peer, 'first', firstAt);
    const before = reviewState(peer); const facts = reviewFacts(peer);
    peer.sqlite.prepare(`INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('review_scheduler_settings', 'user_space', 'macos', 'desktop', '*', '{"desiredRetention":0.99}', 'hash', 'now')`).run();
    const driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    peer.sqlite.exec("INSERT INTO settings(key, value, updated_at) VALUES ('host_name', '\"source\"', 'now')");
    upsertNodeSnapshot(driver, { nodeId: 'topic', parentNodeId: null,
      kind: 'item', title: 'Edited', isTitleManual: true, content: 'Edited prompt', reveal: 'Answer',
      anchorLink: null, position: 0, createdAt: firstAt, updatedAt: secondAt, review: {
        due: firstAt, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
        elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 } });
    score(peer, 'first', firstAt);
    expect(reviewState(peer)).toEqual(before); expect(reviewFacts(peer)).toEqual(facts);
    const computed = score(peer, 'second', secondAt);
    expect(computed).toEqual(recomputeReview(reviewFacts(peer).map(row => identityReviewRowSchema.parse(row)), {
      ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: 0.99 }));
    expect(computed?.reps).toBe(2);
  } finally { await f.close(); }
});

it('uses the existing inherited short-term setting at the node parameter boundary', async () => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer);
    peer.sqlite.exec(`INSERT INTO nodes(id, kind, title, enable_short_term, created_at, updated_at)
      VALUES ('parent', 'folder', 'Parent', 1, 'now', 'now'); UPDATE nodes SET parent_id='parent' WHERE id='topic'`);
    expect(score(peer, 'first', firstAt)?.state).toBe(1);
  } finally { await f.close(); }
});

it('retains cached review progress across soft deletion and restoration without regrading at changed retention', async () => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer); score(peer, 'first', firstAt);
    const before = reviewState(peer); const facts = reviewFacts(peer);
    const current = (await loadCurrentSyncNodeRecord(peer.db, 'topic'))!;
    const deleted = textBranch('deleted', 'Question', current, secondAt);
    await applySyncNodesWithDbPort(peer.db, [{ ...deleted,
      snapshot: { ...deleted.snapshot, kind: 'item', deleted_at: secondAt } }], { enqueueSearchInvalidations: false });
    expect(reviewState(peer)).toEqual(before);
    peer.sqlite.prepare(`INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('review_scheduler_settings', 'user_space', 'macos', 'desktop', '*', '{"desiredRetention":0.99}', 'hash', 'now')`).run();
    const restored = textBranch('restored', 'Question', deleted, '2026-10-05T08:00:00.000Z');
    await applySyncNodesWithDbPort(peer.db, [{ ...restored,
      snapshot: { ...restored.snapshot, kind: 'item', deleted_at: null } }], { enqueueSearchInvalidations: false });
    peer.reopen(); expect(reviewState(peer)).toEqual(before); expect(reviewFacts(peer)).toEqual(facts);
  } finally { await f.close(); }
});

it('rolls back an ambiguous incoming timestamp instead of committing host-dependent progress', async () => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer); score(peer, 'first', firstAt);
    const facts = reviewFacts(peer); const state = reviewState(peer);
    const previous = identityReviewRowSchema.parse(facts[0]);
    await expect(applyReviewLogRecordsWithDbPort(peer.db, [{ ...previous,
      id: 'ambiguous', op_id: 'ambiguous', reviewed_at: '2026-10-25T08:00:00' }])).rejects.toThrow('invalid_review_timestamp');
    expect(reviewFacts(peer)).toEqual(facts); expect(reviewState(peer)).toEqual(state);
  } finally { await f.close(); }
});
