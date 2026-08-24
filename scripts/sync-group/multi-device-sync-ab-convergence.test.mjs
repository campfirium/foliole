// @vitest-environment node

import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  expectedJourneyFactPresent, readABConvergenceMaterial, runABConvergenceJourney
} from './multi-device-sync-ab-convergence.mjs';

/* global process */

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
    inspectAndroidReceived: async () => { events.push('b-received-inspected'); },
    inspectRestarted: async () => { events.push('restart-inspected'); return { restarted: true }; },
    openSession: async () => sessions.shift(),
    openTransport: async () => { events.push('transport-opened'); },
    restartAndroid: async () => { events.push('b-restarted'); },
    startAndroid: async () => { events.push('b-started'); },
    stopAndroid: async () => { events.push('b-stopped'); },
    syncAndroidFact: async () => { events.push('b-sync-now'); events.push('b-fact-on-a'); },
    waitForAndroidFact: async () => { events.push('a-fact-on-b'); }
  });
  expect(result.proof).toEqual({ restarted: true });
  expect(events).toEqual([
    'first-enabled', 'a-fact-created', 'b-stopped', 'transport-opened', 'b-started',
    'a-fact-on-b', 'transport-closed', 'b-fact-created', 'b-sync-now', 'b-fact-on-a',
    'b-received-inspected', 'first-closed',
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

it('reads the exact A and B pre-join fact identities for the final union proof', async () => {
  const repoRoot = path.join(process.cwd(), '.tmp', `a-b-material-${Date.now()}`);
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/proofs');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'run-1-a-b.json'), JSON.stringify({
    androidFactId: 'fact-b-before-c', desktopFactId: 'fact-a-before-c', resultStatus: 'success'
  }));
  try {
    expect(readABConvergenceMaterial(repoRoot, 'run-1')).toEqual({
      androidFactId: 'fact-b-before-c', desktopFactId: 'fact-a-before-c'
    });
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

it('observes a journey fact only when its exact device origin matches', () => {
  const facts = { 'fact-a': 'A', 'fact-c': 'C' };
  expect(expectedJourneyFactPresent(facts, 'fact-a', 'A')).toBe(true);
  expect(expectedJourneyFactPresent(facts, 'fact-c', 'C')).toBe(true);
  expect(expectedJourneyFactPresent(facts, 'fact-c', 'A')).toBe(false);
});
