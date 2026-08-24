// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertActionLocalPublicRuntimeReadiness, PUBLIC_RUNTIME_READINESS_OWNER
} from './android-public-runtime-readiness-contract.mjs';

const action = { actionId: 'action-13', runtimeId: 'runtime-13', surface: 'public' };
const ready = { actionId: 'action-13', listener: 'listening', provider: 'available',
  runtimeId: 'runtime-13', source: 'public-runtime' };

it('opens only for provider/listener facts from the current public action runtime', () => {
  expect(assertActionLocalPublicRuntimeReadiness({ action, observation: ready }))
    .toEqual({ actionId: 'action-13', gate: 'open', owner: PUBLIC_RUNTIME_READINESS_OWNER,
      runtimeId: 'runtime-13' });
  for (const observation of [
    { ...ready, actionId: 'old-action' }, { ...ready, runtimeId: 'old-runtime' },
    { ...ready, source: 'private-bridge' }, { ...ready, listener: 'starting' }
  ]) {
    expect(() => assertActionLocalPublicRuntimeReadiness({ action, observation }))
      .toThrow(/current public runtime|not consumable/u);
  }
});

it('assigns readiness failure to its host proof owner, never data success', () => {
  try {
    assertActionLocalPublicRuntimeReadiness({ action, observation: { ...ready, provider: 'failed' } });
  } catch (error) {
    expect(error).toMatchObject({ failureAxis: 'mechanical-readiness',
      failureOwner: PUBLIC_RUNTIME_READINESS_OWNER });
    return;
  }
  throw new Error('expected readiness to fail');
});
