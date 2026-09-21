import { describe, expect, it } from 'vitest';

import {
  advanceFriS220Stage, assertFriS220Converged, assertFriS220ResidueFree,
  createFriS220Attempt
} from './fri-s220-journey-contract.mjs';

const groupId = 'group-563c698c-b964-4c05-b273-c3d9c2c02995';
const attempt = createFriS220Attempt(groupId);
const baseline = { nodesById: {
  a: { content: 'Multi-device sync A fact', id: 'a', title: 'Multi-device sync A fact' },
  d: { id: 'd', review: { reps: 0 }, title: 'Multi-device sync D fact' }
} };

describe('Fri S220 deterministic journey contract', () => {
  it('derives stable markers only from the isolated group identity', () => {
    expect(attempt).toEqual({ attemptId: 'c3d9c2c02995',
      captureTitle: 'S220 Fri capture c3d9c2c02995',
      editMarker: 'S220 Fri edit c3d9c2c02995.', reviewTitle: 'Multi-device sync D fact',
      sourceTitle: 'Multi-device sync A fact' });
    expect(() => createFriS220Attempt('main')).toThrow('identity is invalid');
  });

  it('refuses an occupied attempt before the manual network window', () => {
    expect(assertFriS220ResidueFree(baseline, attempt)).toEqual({ reviewId: 'd', sourceId: 'a' });
    expect(() => assertFriS220ResidueFree({ nodesById: { ...baseline.nodesById,
      residue: { id: 'residue', title: attempt.captureTitle } } }, attempt))
      .toThrow('already has isolated fixture residue');
  });

  it('requires one capture, one edit marker, and one completed review', () => {
    const converged = { nodesById: { ...baseline.nodesById,
      a: { ...baseline.nodesById.a, content: `body\n${attempt.editMarker}`,
        currentVersionId: 'version-a' },
      d: { ...baseline.nodesById.d, review: { reps: 1 } },
      capture: { id: 'capture', title: attempt.captureTitle } } };
    expect(assertFriS220Converged(converged, attempt,
      `body\n${attempt.editMarker}`)).toMatchObject({
      captureId: 'capture', reviewId: 'd', sourceVersionId: 'version-a'
    });
    expect(() => assertFriS220Converged(converged, attempt,
      `body\n${attempt.editMarker}\n${attempt.editMarker}`)).toThrow('exactly once');
  });

  it('permits one offline and one online transition without retries', () => {
    expect(advanceFriS220Stage('prepared', 'offline_ready')).toBe('offline_ready');
    expect(advanceFriS220Stage('offline_complete', 'network_restored')).toBe('network_restored');
    expect(() => advanceFriS220Stage('offline_ready', 'network_restored'))
      .toThrow('not single-pass');
    expect(() => advanceFriS220Stage('offline_complete', 'offline_ready'))
      .toThrow('not single-pass');
  });
});
