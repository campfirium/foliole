import { expect, it } from 'vitest';

import { iosAcceptanceSimulatorName } from './ios-acceptance-simulator-identity.mjs';

it('gives each scenario attempt its own simulator name', () => {
  for (const scenario of [
    'content-resource-read', 'foreground-sync-lifecycle', 'state-writeback-runtime', 'sync-pack-runtime'
  ]) {
    expect(iosAcceptanceSimulatorName(scenario, 123, 2)).toBe(`Foliole ${scenario} 123 2`);
  }
  expect(iosAcceptanceSimulatorName('sync-group-signed-transport', 123, 2))
    .toBe('Foliole sync-group-signed-transport 123 2');
});
