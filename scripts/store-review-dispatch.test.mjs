// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  STORE_REVIEW_CHECK_INTERVAL_MS,
  dispatchPendingStoreReview,
  pendingStoreReviewTags
} from './store-review-dispatch.mjs';

const now = Date.parse('2026-11-24T08:00:00Z');
const release = (tag, body, extra = {}) => ({
  tag_name: tag, draft: false, published_at: '2026-11-24T06:40:00Z', body, ...extra
});
const pendingBody = '| 0.8.3 | [TestFlight](https://testflight.apple.com/join/x) (In Review) |';

function fakeGh({ releases, runs = [] }) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[1].includes('/releases?')) return releases;
    if (args[1].includes('/runs?')) return { workflow_runs: runs };
    return null;
  };
  return { calls, gh };
}

describe('store review dispatch', () => {
  it('watches only the newest published Release while it still shows a store review', () => {
    expect(pendingStoreReviewTags([
      release('v0.8.4', pendingBody, { draft: true, published_at: null }),
      release('v0.8.3', pendingBody),
      release('v0.8.0', pendingBody)
    ], now)).toEqual(['v0.8.3']);
    expect(pendingStoreReviewTags([release('v0.8.3', 'all links ready'), release('v0.8.0', pendingBody)], now))
      .toEqual([]);
    expect(pendingStoreReviewTags([release('v0.8.3', pendingBody, { published_at: '2026-11-01T00:00:00Z' })], now))
      .toEqual([]);
  });

  it('dispatches the manifest workflow on dev while a review is pending', () => {
    const { calls, gh } = fakeGh({ releases: [release('v0.8.3', pendingBody)] });
    const state = {};
    const record = dispatchPendingStoreReview(state, { repository: 'campfirium/foliole', now, gh });
    expect(record).toMatchObject({ pending: ['v0.8.3'], dispatchedAt: '2026-11-24T08:00:00.000Z' });
    expect(calls.at(-1)).toEqual(['api', '--method', 'POST',
      'repos/campfirium/foliole/actions/workflows/deploy-release-manifest.yml/dispatches',
      '-f', 'ref=dev', '-f', 'inputs[monitor]=true']);
    expect(state.storeReviewDispatch).toBe(record);
  });

  it('stays quiet when nothing is in review and rechecks only after the interval', () => {
    const { calls, gh } = fakeGh({ releases: [release('v0.8.3', 'all links ready')] });
    const state = {};
    dispatchPendingStoreReview(state, { repository: 'campfirium/foliole', now, gh });
    dispatchPendingStoreReview(state, { repository: 'campfirium/foliole', now: now + 60_000, gh });
    expect(calls).toHaveLength(1);
    dispatchPendingStoreReview(state, { repository: 'campfirium/foliole', now: now + STORE_REVIEW_CHECK_INTERVAL_MS, gh });
    expect(calls).toHaveLength(2);
    expect(state.storeReviewDispatch.dispatchedAt).toBeUndefined();
  });

  it('does not queue another run while one is still active', () => {
    const { calls, gh } = fakeGh({
      releases: [release('v0.8.3', pendingBody)],
      runs: [{ status: 'in_progress' }]
    });
    const record = dispatchPendingStoreReview({}, { repository: 'campfirium/foliole', now, gh });
    expect(record.skipped).toBe('run-active');
    expect(calls.some((args) => args.includes('POST'))).toBe(false);
  });

  it('records a GitHub failure as a monitor error without throwing', () => {
    const errors = [];
    const gh = () => { throw new Error('HTTP 502'); };
    const record = dispatchPendingStoreReview({}, { repository: 'campfirium/foliole', now, gh, errors });
    expect(record.error).toBe('HTTP 502');
    expect(errors).toEqual([expect.objectContaining({ source: 'foliole/store-review-dispatch', message: 'HTTP 502' })]);
  });
});
