// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { runWindowsSyncFromZeroJourney } from './windows-multi-device-sync-from-zero-action.mjs';

const dataset = { datasetAttachmentCount: 65, datasetCachedAttachmentCount: 65,
  datasetCachedContentBlobCount: 40, datasetContentBlobCount: 40, datasetNodeCount: 40 };

function session(events, name) {
  return { app: { close: async () => { events.push(`${name}-closed`); } }, page: { name } };
}

it('interrupts only after a committed cursor and resumes without cursor regression', async () => {
  const events = [];
  const progress = [];
  const sessions = [session(events, 'first'), session(events, 'restarted')];
  const partial = { ...dataset, datasetCachedAttachmentCount: 12,
    datasetCachedContentBlobCount: 32, receiveCursor: 80 };
  const result = await runWindowsSyncFromZeroJourney({
    discover: async () => ({ endpoint_url: 'http://provider', group_id: 'group-1',
      provider_device_kind: 'android-capacitor' }),
    enable: async () => { events.push('enabled'); },
    inspect: async () => partial,
    openSession: async () => sessions.shift(),
    reportProgress: (value) => { progress.push(value.milestone); },
    requestJoin: async () => { events.push('join-requested'); },
    reset: async () => ({ datasetAttachmentCount: 0, datasetNodeCount: 0,
      receiveCursor: 0, syncPeerCursorCount: 0 }),
    waitForComplete: async (report) => {
      report('c-content-batches-received'); report('c-attachment-batches-received');
      return { ...dataset, activeMemberCount: 3, integrity: 'ok', localMemberState: 'active',
        missingAttachmentCount: 0, missingContentBlobCount: 0, receiveCursor: 90 };
    },
    waitForCursorCommitted: async () => { events.push('cursor-committed'); },
    waitForJoined: async () => { events.push('joined'); }
  });
  expect(result).toMatchObject({ finalFacts: { receiveCursor: 90 },
    initialFacts: { receiveCursor: 0 }, interruptedFacts: { receiveCursor: 80 },
    restartedFacts: { receiveCursor: 80 } });
  expect(events).toEqual([
    'enabled', 'join-requested', 'joined', 'cursor-committed', 'first-closed', 'restarted-closed'
  ]);
  expect(progress).toEqual([
    'c-cursor-zero', 'c-group-discovered', 'c-join-requested', 'c-membership-active',
    'c-first-cursor-committed', 'c-object-batches-received', 'c-controlled-interruption',
    'c-restarted-from-cursor', 'c-content-batches-received', 'c-attachment-batches-received'
  ]);
});

it('rejects a restart that falls behind the committed cursor', async () => {
  const sessions = [session([], 'first'), session([], 'restarted')];
  const partial = { ...dataset, datasetCachedAttachmentCount: 1,
    datasetCachedContentBlobCount: 1, receiveCursor: 80 };
  const inspect = vi.fn()
    .mockResolvedValueOnce(partial)
    .mockResolvedValueOnce({ ...partial, receiveCursor: 0 });
  await expect(runWindowsSyncFromZeroJourney({
    discover: async () => ({ endpoint_url: 'http://provider', group_id: 'group-1' }),
    enable: vi.fn(), inspect,
    openSession: async () => sessions.shift(), reportProgress: vi.fn(), requestJoin: vi.fn(),
    reset: async () => ({ datasetAttachmentCount: 0, datasetNodeCount: 0,
      receiveCursor: 0, syncPeerCursorCount: 0 }), waitForCursorCommitted: vi.fn(),
    waitForJoined: vi.fn()
  })).rejects.toThrow('restarted behind');
});
