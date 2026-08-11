// @vitest-environment node

import { expect, it } from 'vitest';

import { runABConvergenceJourney } from './multi-device-sync-ab-convergence.mjs';

function session(events, name) {
  return {
    close: async () => { events.push(`${name}-closed`); },
    enable: async () => { events.push(`${name}-enabled`); return {
      server_status: { state: 'running' }, sync_enabled: true
    }; }
  };
}

it('proves both directions and restarts before accepting A and B convergence', async () => {
  const events = [];
  const sessions = [session(events, 'first'), session(events, 'restarted')];
  const result = await runABConvergenceJourney({
    closeTransport: async () => { events.push('transport-closed'); },
    createAndroidFact: async () => { events.push('b-fact-created'); return { factText: 'B fact' }; },
    createDesktopFact: async () => { events.push('a-fact-created'); return { factId: 'A fact' }; },
    inspectRestarted: async () => { events.push('restart-inspected'); return { restarted: true }; },
    openSession: async () => sessions.shift(),
    openTransport: async () => { events.push('transport-opened'); },
    restartAndroid: async () => { events.push('b-restarted'); },
    startAndroid: async () => { events.push('b-started'); },
    stopAndroid: async () => { events.push('b-stopped'); },
    waitForAndroidFact: async () => { events.push('a-fact-on-b'); },
    waitForDesktopFact: async () => { events.push('b-fact-on-a'); }
  });
  expect(result.proof).toEqual({ restarted: true });
  expect(events).toEqual([
    'first-enabled', 'a-fact-created', 'b-stopped', 'transport-opened', 'b-started',
    'a-fact-on-b', 'transport-closed', 'b-fact-created', 'b-fact-on-a', 'first-closed',
    'b-restarted', 'restart-inspected', 'restarted-closed'
  ]);
});

it('closes transport and desktop session when A to B convergence fails', async () => {
  const events = [];
  await expect(runABConvergenceJourney({
    closeTransport: async () => { events.push('transport-closed'); },
    createDesktopFact: async () => ({ factId: 'A fact' }),
    openSession: async () => session(events, 'first'),
    openTransport: async () => { events.push('transport-opened'); },
    startAndroid: async () => {}, stopAndroid: async () => {},
    waitForAndroidFact: async () => { throw new Error('missing'); }
  })).rejects.toThrow('missing');
  expect(events).toEqual(['first-enabled', 'transport-opened', 'transport-closed', 'first-closed']);
});
