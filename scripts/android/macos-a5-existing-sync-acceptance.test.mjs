// @vitest-environment node

import { expect, it } from 'vitest';

import {
  afterDesktopSyncTransaction, runExistingSyncRestartJourney
} from './macos-a5-existing-sync-acceptance.mjs';

it('waits only for the exact transient desktop sync transaction owner', async () => {
  let attempts = 0;
  const value = await afterDesktopSyncTransaction(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('SqliteConnectionOwnerError: owned');
    return 'ready';
  }, async () => {});
  expect(value).toBe('ready');
  expect(attempts).toBe(2);
  await expect(afterDesktopSyncTransaction(async () => {
    throw new Error('unexpected');
  }, async () => {})).rejects.toThrow('unexpected');
});

it('proves post-restart automatic sync in both directions without a pairing action', async () => {
  const events = [];
  const session = {
    close: async () => events.push('mac-closed'),
    enable: async () => { events.push('mac-restarted'); return { sync_group: {} }; }
  };
  const result = await runExistingSyncRestartJourney({
    assertBaseline: () => events.push('baseline-preserved'),
    createAndroidFact: async () => { events.push('android-fact'); return {
      factId: 'android-fact', factText: 'Android fact'
    }; },
    createDesktopFact: async () => { events.push('mac-fact'); return { factId: 'mac-fact' }; },
    inspectFinal: async () => { events.push('final-proof'); return { automatic: true }; },
    openDesktopSession: async () => session,
    waitForAndroidFact: async () => events.push('mac-fact-on-android'),
    waitForDesktopFact: async () => events.push('android-fact-on-mac')
  });
  expect(result.proof).toEqual({ automatic: true });
  expect(events).toEqual([
    'mac-restarted', 'baseline-preserved', 'mac-fact', 'android-fact',
    'mac-fact-on-android', 'android-fact-on-mac', 'final-proof', 'mac-closed'
  ]);
});
