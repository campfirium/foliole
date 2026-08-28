// @vitest-environment node

import { expect, it } from 'vitest';

import { buildFriRunTimeline } from './fri-two-device-run-proof.mjs';

const applicationId = 'com.foliole.ios.t152acceptance.atest';
const event = (runId, triggerReason, minute) => ({
  device_identity_key: 'fri-device', occurred_at: `2026-08-29T00:0${minute}:00.000Z`,
  result: 'completed', run_id: runId, trigger_reason: triggerReason
});

it('binds the fresh Fri initial and restart timeline to composite run identities', () => {
  const proof = buildFriRunTimeline({ application_id: applicationId, events: [
    event('initial-1', 'initial', 0), event('automatic-1', 'automatic', 1),
    event('manual-1', 'manual', 2), event('automatic-2', 'automatic', 3),
    event('manual-2', 'manual', 4)
  ] }, applicationId);

  expect(proof.identity).toBe('fri-device');
  expect(proof.runs).toMatchObject({
    automaticAfterRestart: { runId: 'automatic-2' },
    automaticBeforeRestart: { runId: 'automatic-1' },
    initial: { runId: 'initial-1' },
    manualAfterRestart: { runId: 'manual-2' },
    manualBeforeRestart: { runId: 'manual-1' }
  });
});
