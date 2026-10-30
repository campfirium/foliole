// @vitest-environment node
import { expect, it } from 'vitest';

import { restoreFixture } from '../../../../../../electron/database/requestSyncRestoreRecovery.testSupport';
import { firstAt, seedReviewPeer, score, reviewState, reviewFacts, sendReviews } from '../../../../../../electron/database/reviewProjection.testSupport';
import { resetItemReviewsWithDb } from '../../../../../../lib/core/database/itemReviewReset';

it('syncs a phone reset to an independent desktop, keeps history, and cannot resurrect old scores on return sync', async () => {
  const fixture = await restoreFixture();
  const desktop = fixture.peer('source'); const phone = fixture.peer('target');
  try {
    await seedReviewPeer(desktop); await seedReviewPeer(phone);
    score(desktop, 'desktop-grade', firstAt);
    await sendReviews(desktop, phone, false);
    const original = reviewFacts(desktop);
    await phone.db.transaction(db => resetItemReviewsWithDb(db, {
      hostName: 'Test phone', now: '2026-10-30T08:00:00.000Z', createId: () => 'phone-reset'
    }));
    expect(reviewState(phone)).toEqual([]);
    await sendReviews(phone, desktop); await sendReviews(desktop, phone, false);
    desktop.reopen(); phone.reopen();
    expect(reviewState(phone)).toEqual([]); expect(reviewState(desktop)).toEqual([]);
    expect(reviewFacts(phone)).toEqual(reviewFacts(desktop));
    expect(reviewFacts(desktop)).toEqual(expect.arrayContaining(original));
    score(phone, 'next-round', '2026-10-30T09:00:00.000Z');
    await sendReviews(phone, desktop);
    expect(reviewState(phone)).toEqual(reviewState(desktop));
    expect(reviewState(desktop)[0]).toMatchObject({ reps: 1 });
  } finally { await fixture.close(); }
});
