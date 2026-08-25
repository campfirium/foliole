// @vitest-environment node

import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  androidJourneyFactComplete, expectedJourneyFactPresent, readABConvergenceMaterial,
  runABConvergenceJourney
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
    createAndroidFact: async () => { events.push('b-fact-created'); return { factText: 'B fact' }; },
    createDesktopFact: async () => { events.push('a-fact-created'); return { factId: 'A fact' }; },
    inspectAndroidReceived: async () => { events.push('b-received-inspected'); },
    inspectRestarted: async () => { events.push('restart-inspected'); return { restarted: true }; },
    openSession: async () => sessions.shift(),
    restartAndroid: async () => { events.push('b-restarted'); },
    syncDesktopFact: async () => { events.push('a-sync-now'); events.push('a-fact-on-b'); },
    syncAndroidFact: async () => { events.push('b-sync-now'); events.push('b-fact-on-a'); },
  });
  expect(result.proof).toEqual({ restarted: true });
  expect(events).toEqual([
    'first-enabled', 'a-fact-created', 'a-sync-now', 'a-fact-on-b',
    'b-fact-created', 'b-sync-now', 'b-fact-on-a',
    'b-received-inspected', 'first-closed',
    'b-restarted', 'restart-inspected', 'restarted-closed'
  ]);
});

it('routes both convergence directions through the public Sync Now action', () => {
  const source = fs.readFileSync('scripts/sync-group/multi-device-sync-ab-convergence.mjs', 'utf8');
  expect(source.match(/action: 'sync-now'/gu)).toHaveLength(2);
  expect(source).not.toContain('openMacosAcceptanceTransport');
});

it('closes the desktop session when public A to B sync fails', async () => {
  const events = [];
  await expect(runABConvergenceJourney({
    createDesktopFact: async () => ({ factId: 'A fact' }),
    openSession: async () => session(events, 'first'),
    syncDesktopFact: async () => { throw new Error('missing'); }
  })).rejects.toThrow('missing');
  expect(events).toEqual(['first-enabled', 'first-closed']);
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

it('does not take the provider offline before the exact fact resources are complete', () => {
  const inspection = {
    desktopFactPresent: true, missingAttachmentCount: 0, missingContentBlobCount: 0
  };
  expect(androidJourneyFactComplete({ database: { inspection } })).toBe(true);
  expect(androidJourneyFactComplete({ database: { inspection: {
    ...inspection, missingContentBlobCount: 1
  } } })).toBe(false);
  expect(androidJourneyFactComplete({ database: { inspection: {
    ...inspection, missingAttachmentCount: 1
  } } })).toBe(false);
});
