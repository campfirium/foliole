// @vitest-environment node
import { expect, it } from 'vitest';

import { recomputeReview } from '../../lib/core/review/recomputeReview.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';

import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, secondAt, seedReviewPeer, score, reviewState, reviewFacts, sendReviews } from './reviewProjection.testSupport.js';

it.each([
  { own: 0.99, parent: 0.8, expected: 0.99 },
  { own: null, parent: 0.8, expected: 0.8 },
  { own: null, parent: null, expected: 0.95 }
])('replays history using the nearest retention after reopening: %j', async ({ own, parent, expected }) => {
  const f = await restoreFixture(); const peer = f.peer('source');
  try {
    await seedReviewPeer(peer);
    score(peer, 'first', firstAt);
    const before = reviewState(peer);
    peer.sqlite.prepare(`INSERT INTO nodes(id, kind, title, desired_retention, created_at, updated_at)
      VALUES ('parent', 'folder', 'Parent', ?, 'now', 'now')`).run(parent);
    peer.sqlite.prepare("UPDATE nodes SET parent_id='parent', desired_retention=? WHERE id='topic'").run(own);
    peer.sqlite.exec(`INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('review_scheduler_settings', 'user_space', 'macos', 'desktop', '*', '{"desiredRetention":0.95}', 'hash', 'now')`);
    peer.reopen();
    expect(reviewState(peer)).toEqual(before);
    const card = score(peer, 'second', secondAt);
    const events = reviewFacts(peer).map(row => identityReviewRowSchema.parse(row));
    expect(card).toEqual(recomputeReview(events, { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: expected }));
    const previous = reviewState(peer);
    peer.sqlite.exec("UPDATE nodes SET desired_retention=NULL WHERE id='topic'");
    expect(reviewState(peer)).toEqual(previous);
    expect(score(peer, 'third', '2026-10-12T08:00:00.000Z')).toEqual(recomputeReview(
      reviewFacts(peer).map(row => identityReviewRowSchema.parse(row)),
      { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: parent ?? 0.95 }
    ));
  } finally { await f.close(); }
});

it('converges durable review fields on incoming facts with inherited retention', async () => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    for (const peer of [a, b]) {
      await seedReviewPeer(peer);
      peer.sqlite.exec(`INSERT INTO nodes(id, kind, title, desired_retention, created_at, updated_at)
        VALUES ('parent', 'folder', 'Parent', 0.99, 'now', 'now');
        UPDATE nodes SET parent_id='parent' WHERE id='topic'`);
    }
    score(a, 'first', firstAt); score(b, 'second', secondAt);
    await sendReviews(a, b); await sendReviews(b, a);
    a.reopen(); b.reopen();
    expect(reviewState(a)).toEqual(reviewState(b));
    const expected = recomputeReview(reviewFacts(a).map(row => identityReviewRowSchema.parse(row)), {
      ...DEFAULT_REVIEW_SCHEDULER_SETTINGS, desiredRetention: 0.99
    });
    expect(a.sqlite.prepare('SELECT due FROM node_review').get()).toEqual({ due: expected?.due });
  } finally { await f.close(); }
});
