// @vitest-environment node

import { expect, it } from 'vitest';

import { verifyBootstrapSnapshots } from './ios-bootstrap-acceptance.mjs';

it('requires the current Simulator system name when provided', () => {
  expect(verifyBootstrapSnapshots(
    { deviceId: 'Foliole iOS Acceptance', tableCount: 3 },
    { deviceId: 'Foliole iOS Acceptance', tableCount: 3 },
    'Foliole iOS Acceptance'
  ).deviceId).toBe('Foliole iOS Acceptance');
  expect(() => verifyBootstrapSnapshots(
    { deviceId: 'ios-device-legacy', tableCount: 3 },
    { deviceId: 'ios-device-legacy', tableCount: 3 },
    'Foliole iOS Acceptance'
  )).toThrow('does not match the current system name');
});
