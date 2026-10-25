// @vitest-environment node
import { rmSync } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { restoreFixture } from '../../../../../../electron/database/requestSyncRestoreRecovery.testSupport';
import { firstAt, secondAt, seedReviewPeer, score, reset, history, reviewState, reviewFacts, sendReviews } from '../../../../../../electron/database/reviewProjection.testSupport';
import { bootstrapCompanionDatabase } from '../../../../../../lib/core/database/companionDatabaseLifecycle';
import { readStoredReviewCardWithDb } from '../../../../../../lib/core/database/storedReviewCard';
import { saveIosReviewWithDb } from '../../runtime/iosCompanionActiveDatabaseWrites';

it.each(['android', 'ios'])('recalculates incoming and local scores and ignores old snapshots in the %s companion schema', async platform => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    b.sqlite.close(); rmSync(b.file); b.sqlite = new Database(b.file);
    await bootstrapCompanionDatabase(b.db, { allowCreate: true, expectedHostName: platform, now: firstAt });
    b.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'target', 'active', 'now');
      UPDATE node_version_local_proof_state SET library_epoch = 'target-epoch';`);
    for (const member of ['source', 'target']) b.sqlite.prepare(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES ('group', ?, ?, ?, ?, ?, 'active', 'now', 'now')`).run(member, member, `/${member}`, member, platform);
    await seedReviewPeer(a); await seedReviewPeer(b);
    score(a, 'desktop', firstAt);
    const mobile = { node_id: 'topic', review_json: '{}', review_log_json: JSON.stringify({
      opId: 'mobile', grade: 4, reviewedAt: secondAt, schedulerVersion: 'test' }) };
    const saved = await b.db.transaction(db => saveIosReviewWithDb(db, mobile));
    expect('card' in saved && saved.card?.reps).toBe(1);
    await sendReviews(a, b, false); await sendReviews(b, a);
    expect(reviewFacts(a)).toEqual(reviewFacts(b)); expect(reviewState(a)).toEqual(reviewState(b));
    expect((await readStoredReviewCardWithDb(b.db, 'topic'))?.reps).toBe(2);
    history(a, 'undo', 'desktop', '2026-10-04T08:00:00.000Z');
    await sendReviews(a, b, false); expect(reviewState(a)).toEqual(reviewState(b));
    const before = reviewState(b);
    b.sqlite.prepare(`INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('review_scheduler_settings', 'user_space', ?, 'phone', '*', '{"desiredRetention":0.99}', 'hash', 'now')`).run(platform);
    await b.db.transaction(db => saveIosReviewWithDb(db, mobile));
    b.reopen(); await sendReviews(a, b, false);
    expect(reviewState(b)).toEqual(before);
    reset(a, '2026-10-05T08:00:00.000Z'); await sendReviews(a, b, false);
    expect(reviewState(b)).toEqual([]);
    score(a, 'resumed', '2026-10-06T08:00:00.000Z');
    b.sqlite.exec("CREATE TRIGGER reject_projection BEFORE INSERT ON node_review BEGIN SELECT RAISE(ABORT, 'full'); END");
    const facts = reviewFacts(b);
    await expect(sendReviews(a, b, false)).rejects.toThrow('full'); expect(reviewFacts(b)).toEqual(facts);
    b.sqlite.exec('DROP TRIGGER reject_projection');
  } finally { await f.close(); }
});
