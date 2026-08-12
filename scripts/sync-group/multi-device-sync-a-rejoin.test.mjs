// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertThreeDeviceProof,
  restartARejoinAndroidProvider,
  waitForThreeDeviceProof
} from './multi-device-sync-a-rejoin.mjs';

const ids = { A: 'fact-a', B: 'fact-b', C: 'fact-c' };
const identities = { desktop: ['a', 'c'], mobile: ['b'] };
const facts = { activeDeviceIdentities: identities, activeMemberCount: 3, attachmentCount: 1,
  contentBlobCount: 4, facts: { 'fact-a': true, 'fact-b': true, 'fact-c': true },
  integrity: 'ok', localGroupId: 'group-1', localMemberState: 'active',
  localTimelineId: 'timeline-1', missingAttachmentCount: 0, missingContentBlobCount: 0,
  nodeCount: 6, userNodeCount: 4 };
const android = { database: { counts: { attachments: 1, content_blobs: 4, nodes: 5 },
  inspection: { activeMemberIdentities: ['a', 'b', 'c'], activeSyncGroupMemberCount: 3,
    journeyFacts: { 'fact-a': 'A', 'fact-b': 'B', 'fact-c': 'C' },
    missingAttachmentCount: 0, missingContentBlobCount: 0, syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1', userNodeCount: 4 }, integrity: 'ok' } };

it('requires one restarted identity, timeline, member set, fact set, and resource inventory', () => {
  expect(assertThreeDeviceProof({ android, ids, macos: facts, windows: facts }))
    .toEqual({ attachmentCount: 1, contentBlobCount: 4, groupId: 'group-1',
      nodeCount: 4, timelineId: 'timeline-1' });
});

it('rejects a same-count member set that does not converge by device identity', () => {
  const divergent = { ...facts, activeDeviceIdentities: { desktop: ['a', 'x'], mobile: ['b'] } };
  expect(() => assertThreeDeviceProof({ android, ids, macos: facts, windows: divergent }))
    .toThrow('one complete three-member timeline');
});

it('waits for restarted resource bodies instead of failing on the transient metadata state', async () => {
  let inspections = 0;
  const proof = await waitForThreeDeviceProof({ ids, intervalMs: 0, inspect: async () => {
    inspections += 1;
    const currentAndroid = inspections === 1 ? {
      ...android, database: { ...android.database,
        inspection: { ...android.database.inspection, missingContentBlobCount: 4 } }
    } : android;
    return { android: currentAndroid, macos: facts, windows: facts };
  } });
  expect(inspections).toBe(2);
  expect(proof).toMatchObject({ contentBlobCount: 4, nodeCount: 4 });
});

it('ends the stale provider lifecycle before every staged Android restart', async () => {
  const order = [];
  await restartARejoinAndroidProvider({
    env: {}, execute: async () => ({ code: 0 }), paths: { adb: 'adb' },
    startProvider: async ({ onProviderStopped, onReady }) => {
      await onProviderStopped();
      order.push('started');
      await onReady();
      order.push('ready');
    },
    stopProvider: async () => { order.push('stopped'); }
  });
  expect(order).toEqual(['stopped', 'started', 'ready']);
});
