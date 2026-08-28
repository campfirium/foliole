import { describe, expect, it } from 'vitest';

import {
  desktopRunProof, projectedEvents, selectProjectedRun
} from './t152-two-device-run-proof.mjs';

const event = (runId, triggerReason, device = 'device-a') => ({
  device_identity_key: device, occurred_at: '2026-08-29T00:00:00.000Z',
  run_id: runId, status: 'completed', trigger_reason: triggerReason
});

describe('T152 two-device run proof', () => {
  it('normalizes only a completed desktop product result', () => {
    expect(desktopRunProof('device-a', { finished_at: '2026-08-29T00:00:00.000Z',
      reason: 'manual', run_id: 'run-a', status: 'completed' })).toEqual({
      deviceIdentityKey: 'device-a', occurredAt: '2026-08-29T00:00:00.000Z',
      runId: 'run-a', status: 'completed', triggerReason: 'manual'
    });
    expect(() => desktopRunProof('device-a', { reason: 'manual', run_id: 'run-a',
      status: 'failed' })).toThrow('not completed');
  });

  it('selects a new projected run by composite Device and run identity', () => {
    const previous = { deviceIdentityKey: 'device-a', runId: 'same' };
    expect(selectProjectedRun([event('same', 'automatic'),
      event('next', 'automatic')], 'automatic', { exclude: [previous] }).runId).toBe('next');
    expect(selectProjectedRun([event('same', 'automatic', 'device-b')],
      'automatic', { exclude: [previous] }).deviceIdentityKey).toBe('device-b');
  });

  it('fails closed on the wrong acceptance container', () => {
    expect(projectedEvents({ application_id: 'com.foliole.android.acceptance', events: [] },
      'com.foliole.android.acceptance')).toEqual([]);
    expect(() => projectedEvents({ application_id: 'com.foliole.android', events: [] },
      'com.foliole.android.acceptance')).toThrow('container identity');
  });
});
