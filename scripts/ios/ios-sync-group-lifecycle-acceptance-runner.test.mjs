import { expect, it } from 'vitest';

import {
  acceptanceBuildEnv,
  ordinaryBuildEnv
} from './ios-sync-group-lifecycle-acceptance-runner.mjs';

it('isolates the signed lifecycle acceptance endpoint from ordinary companion assets', () => {
  const ambient = { KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: 'http://ambient' };
  expect(acceptanceBuildEnv(ambient, 'http://127.0.0.1:38642')).toMatchObject({
    KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: 'http://127.0.0.1:38642',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'sync-group-lifecycle'
  });
  expect(ordinaryBuildEnv(ambient)).toEqual({ KEEP: 'yes' });
});
