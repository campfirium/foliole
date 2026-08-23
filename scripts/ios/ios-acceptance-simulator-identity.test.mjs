import { expect, it } from 'vitest';

import { iosAcceptanceSimulatorName } from './ios-acceptance-simulator-identity.mjs';

it('binds fixed-corpus scenarios to their reviewed target peer identity', () => {
  for (const scenario of [
    'content-resource-read', 'foreground-sync-lifecycle', 'state-writeback-runtime', 'sync-pack-runtime'
  ]) {
    expect(iosAcceptanceSimulatorName(scenario, 123, 2)).toBe('ios-acceptance-contract-peer');
  }
  expect(iosAcceptanceSimulatorName('pairing-signed-transport', 123, 2))
    .toBe('Foliole pairing-signed-transport 123 2');
});
