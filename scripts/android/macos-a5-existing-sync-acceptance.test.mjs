// @vitest-environment node

import { expect, it } from 'vitest';

import {
  afterDesktopSyncTransaction, collectStoppedAndroidSnapshot, runExistingSyncRestartJourney
} from './macos-a5-existing-sync-acceptance.mjs';

it('stops Android writers immediately for a coherent snapshot and resumes the foreground provider', async () => {
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
  });
  expect(snapshot.database.integrity).toBe('ok');
  expect(events).toEqual(['stopped', 'snapshot', 'resumed']);
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
  let openings = 0;
  const openDesktopSession = async () => {
    openings += 1;
    const name = openings === 1 ? 'mac-started' : 'mac-restarted';
    return { close: async () => events.push(`${name}-closed`),
      enable: async () => { events.push(name); return { sync_group: {} }; } };
  };
  const result = await runExistingSyncRestartJourney({
    assertBaseline: () => events.push('baseline-preserved'),
    createAndroidFact: async () => { events.push('android-fact'); return { factId: 'android-fact' }; },
    createDesktopFact: async () => { events.push('mac-fact'); return { factId: 'mac-fact' }; },
    inspectFinal: async () => { events.push('final-proof'); return { automatic: true }; },
    openDesktopSession,
    restartAndroid: async () => events.push('android-restarted'),
    waitForAndroidFact: async () => { events.push('mac-fact-on-android'); return {}; },
    waitForDesktopFact: async () => { events.push('android-fact-on-mac'); return {}; }
  });
  expect(result.proof).toEqual({ automatic: true });
  expect(events).toEqual([
    'mac-started', 'baseline-preserved', 'mac-fact', 'android-fact',
    'mac-fact-on-android', 'android-fact-on-mac', 'mac-started-closed',
    'android-restarted', 'mac-restarted', 'final-proof', 'mac-restarted-closed'
  ]);
});
