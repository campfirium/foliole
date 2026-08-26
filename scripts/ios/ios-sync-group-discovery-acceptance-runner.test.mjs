import { expect, it } from 'vitest';

import { verifySyncGroupDiscoveryAcceptance } from './ios-sync-group-discovery-acceptance-runner.mjs';

const passed = {
  events: [
    { change: 'started', status: 'searching' },
    { change: 'stopped', status: 'stopped' }
  ],
  phase: 'events-observed',
  status: 'passed'
};

it('requires start and stop events on both signed Simulator launches', () => {
  expect(verifySyncGroupDiscoveryAcceptance(passed, passed)).toEqual({ first: passed, second: passed });
  expect(() => verifySyncGroupDiscoveryAcceptance(passed, {
    ...passed, events: [{ change: 'started', status: 'searching' }]
  })).toThrow('bridge-event acceptance evidence is incomplete');
});
