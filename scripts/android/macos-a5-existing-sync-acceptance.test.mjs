// @vitest-environment node

import { expect, it } from 'vitest';

import {
  afterDesktopSyncTransaction, collectStoppedAndroidSnapshot, runExistingSyncRestartJourney
} from './macos-a5-existing-sync-acceptance.mjs';

it('stops Android writers for a coherent snapshot and resumes the foreground provider', async () => {
  const events = [];
  const context = {
    env: {}, paths: { adb: '/adb' }, serial: 'fixed-a5',
    execute: async (_command, args) => {
      events.push(args.includes('force-stop') ? 'stopped' : 'resumed');
      return { code: 0 };
    }
  };
  const snapshot = await collectStoppedAndroidSnapshot(context, async () => {
    events.push('snapshot');
    return { database: { integrity: 'ok' } };
  }, async (milliseconds) => events.push(`settled-${milliseconds}`));
  expect(snapshot.database.integrity).toBe('ok');
  expect(events).toEqual(['settled-90000', 'stopped', 'snapshot', 'resumed']);
});

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
