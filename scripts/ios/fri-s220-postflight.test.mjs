import { expect, it } from 'vitest';

import { createFriS220Attempt } from './fri-s220-journey-contract.mjs';
import { inspectFriS220Postflight } from './fri-s220-postflight.mjs';

const groupId = 'group-563c698c-b964-4c05-b273-c3d9c2c02995';
const attempt = createFriS220Attempt(groupId);
const preflight = { attempt, baseline: { reviewId: 'd',
  reviewReading: { lastHandledAt: 'old', repetitionCount: 0 }, sourceId: 'a' },
groupId, sourceVersionId: 'version-before' };

function convergedState(overrides = {}) {
  return { attemptPendingDeliveryCount: 0, conflicts: 0, groupIds: [groupId], nodesById: {
    a: { content: `A\n${attempt.editMarker}`, currentVersionId: 'version-after',
      id: 'a', title: attempt.sourceTitle },
    d: { id: 'd', reading: { lastHandledAt: 'new', repetitionCount: 1 },
      title: attempt.reviewTitle },
    capture: { id: 'capture', title: attempt.captureTitle }
  }, ...overrides };
}

it('accepts one exact Fri edit, capture, reading transition, and no pending delivery', () => {
  expect(inspectFriS220Postflight({ preflight,
    readState: () => convergedState() })).toMatchObject({
    convergence: { captureId: 'capture', reading: { repetitionCount: 1 } },
    resultStatus: 'converged'
  });
});

it('rejects unchanged reading state and attempt delivery backlog', () => {
  const unchanged = convergedState();
  unchanged.nodesById.d.reading = preflight.baseline.reviewReading;
  expect(() => inspectFriS220Postflight({ preflight, readState: () => unchanged }))
    .toThrow('did not converge exactly once');
  expect(() => inspectFriS220Postflight({ preflight,
    readState: () => convergedState({ attemptPendingDeliveryCount: 1 }) }))
    .toThrow('did not converge exactly once');
});
