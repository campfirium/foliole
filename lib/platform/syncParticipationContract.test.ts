import { expect, it } from 'vitest';

import {
  createSyncParticipationSnapshot,
  isSyncParticipationActive
} from './syncParticipationContract.js';

it.each([
  [{ lifecycle_active: true, sync_enabled: true, sync_paused: false }, true],
  [{ lifecycle_active: false, sync_enabled: true, sync_paused: false }, false],
  [{ lifecycle_active: true, sync_enabled: false, sync_paused: false }, false],
  [{ lifecycle_active: true, sync_enabled: true, sync_paused: true }, false]
] as const)('requires enabled, resumed, active lifecycle participation for %j', (state, active) => {
  expect(isSyncParticipationActive(state)).toBe(active);
  expect(createSyncParticipationSnapshot(state)).toEqual({ ...state, participating: active });
});
