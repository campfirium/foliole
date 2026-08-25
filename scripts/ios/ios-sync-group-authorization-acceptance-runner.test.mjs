import { expect, it } from 'vitest';

import {
  acceptanceBuildEnv,
  ordinaryBuildEnv
} from './ios-sync-group-authorization-acceptance-runner.mjs';

it('isolates the signed authorization acceptance build from ordinary companion assets', () => {
  const ambient = { KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: 'http://ambient' };
  expect(acceptanceBuildEnv(ambient)).toMatchObject({
    KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'sync-group-authorization'
  });
  expect(ordinaryBuildEnv(ambient)).toEqual({ KEEP: 'yes' });
});
