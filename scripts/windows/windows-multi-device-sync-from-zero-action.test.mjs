// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { runWindowsSyncFromZeroJourney } from './windows-multi-device-sync-from-zero-action.mjs';
import { discoverUniqueGroup } from './windows-sync-group-recovery-action.mjs';

const dataset = { datasetAttachmentCount: 65, datasetCachedAttachmentCount: 65,
  datasetCachedContentBlobCount: 40, datasetContentBlobCount: 40, datasetNodeCount: 40,
  datasetNodeIds: Array.from({ length: 40 }, (_, index) => `node-${index}`),
  datasetContentHashes: Array.from({ length: 40 }, (_, index) => `hash-${index}`) };

function session(events, name) {
  return { app: { close: async () => { events.push(`${name}-closed`); } }, page: { name } };
}

it('selects the fixed Android provider without occupying unrelated desktop groups', async () => {
  const candidates = [
    { group_id: 'user-group', provider_device_kind: 'darwin' },
    { group_id: 'acceptance-group', provider_device_kind: 'android-capacitor' }
  ];
  const page = { evaluate: vi.fn(async () => ({ join_candidates: candidates })) };
  await expect(discoverUniqueGroup(page, 10,
    (candidate) => candidate.provider_device_kind === 'android-capacitor'
  )).resolves.toMatchObject({ group_id: 'acceptance-group' });
});

it('interrupts after a committed dataset object and retains its facts after restart', async () => {
  const events = [];
  const sessionOptions = [];
  const progress = [];
  const sessions = [session(events, 'first'), session(events, 'restarted')];
  const partial = { ...dataset, datasetCachedAttachmentCount: 12,
    datasetCachedContentBlobCount: 1, datasetNodeCount: 1,
    datasetNodeIds: ['node-0'], datasetContentHashes: ['hash-0'],
    activeMemberCount: 3, localGroupId: 'group-1', localMemberState: 'active' };
  const result = await runWindowsSyncFromZeroJourney({
    closeSession: async (current, options) => {
      events.push(`${current.page.name}-${options?.force ? 'interrupted' : 'closed'}`);
    },
    discover: async () => ({ endpoint_url: 'http://provider', group_id: 'group-1',
      provider_device_kind: 'android-capacitor' }),
    enable: async () => { events.push('enabled'); },
    inspect: async () => partial,
    openSession: async (options) => { sessionOptions.push(options); return sessions.shift(); },
    reportProgress: (value) => { progress.push(value.milestone); },
    requestJoin: async () => { events.push('join-requested'); },
    reset: async () => ({ datasetAttachmentCount: 0, datasetNodeCount: 0 }),
    waitForComplete: async (report) => {
      report('c-content-batches-received'); report('c-attachment-batches-received');
      return { ...dataset, activeMemberCount: 3, integrity: 'ok', localMemberState: 'active',
        missingAttachmentCount: 0, missingContentBlobCount: 0 };
    },
    waitForObjectCommitted: async () => { events.push('object-committed'); }
  });
  expect(result).toMatchObject({ finalFacts: { datasetNodeCount: 40 },
    initialFacts: { datasetNodeCount: 0 }, interruptedFacts: { datasetNodeIds: ['node-0'] },
    restartedFacts: { datasetNodeIds: ['node-0'], datasetContentHashes: ['hash-0'] } });
  expect(events).toEqual(['enabled', 'join-requested', 'object-committed',
    'first-interrupted', 'restarted-closed']);
  expect(sessionOptions).toEqual([{ holdAfterObjectCommit: true }, undefined]);
  expect(progress).toEqual([
    'c-dataset-empty', 'c-group-discovered', 'c-join-requested', 'c-membership-active',
    'c-first-object-committed', 'c-object-batches-received', 'c-controlled-interruption',
    'c-restarted-with-committed-objects', 'c-content-batches-received', 'c-attachment-batches-received'
  ]);
});

it('rejects a restart that changes a committed object hash', async () => {
  const sessions = [session([], 'first'), session([], 'restarted')];
  const partial = { ...dataset, datasetCachedAttachmentCount: 1,
    datasetCachedContentBlobCount: 1, datasetNodeCount: 1,
    datasetNodeIds: ['node-0'], datasetContentHashes: ['hash-0'],
    activeMemberCount: 3, localGroupId: 'group-1', localMemberState: 'active' };
  const inspect = vi.fn()
    .mockResolvedValueOnce(partial)
    .mockResolvedValueOnce({ ...partial, datasetContentHashes: ['changed'] });
  await expect(runWindowsSyncFromZeroJourney({
    closeSession: async () => {},
    discover: async () => ({ endpoint_url: 'http://provider', group_id: 'group-1' }),
    enable: vi.fn(), inspect,
    openSession: async () => sessions.shift(), reportProgress: vi.fn(), requestJoin: vi.fn(),
    reset: async () => ({ datasetAttachmentCount: 0, datasetNodeCount: 0 }), waitForObjectCommitted: vi.fn(),
  })).rejects.toThrow('committed dataset facts changed');
});

it('rejects a committed object without persisted three-member membership', async () => {
  const partial = { ...dataset, datasetCachedAttachmentCount: 1,
    datasetCachedContentBlobCount: 1, datasetNodeCount: 1,
    datasetNodeIds: ['node-0'], datasetContentHashes: ['hash-0'],
    activeMemberCount: 2, localGroupId: 'group-1', localMemberState: 'active' };
  await expect(runWindowsSyncFromZeroJourney({
    closeSession: vi.fn(),
    discover: async () => ({ endpoint_url: 'http://provider', group_id: 'group-1' }),
    enable: vi.fn(), inspect: async () => partial,
    openSession: async () => session([], 'first'), reportProgress: vi.fn(), requestJoin: vi.fn(),
    reset: async () => ({ datasetAttachmentCount: 0, datasetNodeCount: 0 }), waitForObjectCommitted: vi.fn()
  })).rejects.toThrow('did not persist active membership');
});
