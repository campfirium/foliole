// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createEmptyResourceStages } from '../../companionDesktopSyncResourceStages';
import type { CompanionDesktopSyncOptions } from '../../companionDesktopSyncTypes';

const runtime = vi.hoisted(() => ({
  baselines: [] as Array<{ localViewId: string; peerViewId: string;
    localProofRoot: string; peerProofRoot: string }>,
  cleanups: [] as string[], probes: 0, terminalProbe: 3, sentFrom: '', fast: false,
  probeBaselines: [] as unknown[], receivedFrom: [] as string[], resourceError: false,
  framedError: null as Error | null, framedSent: 0
}));
vi.mock('../../../../../lib/core/sync/syncIdentityPeerBaseline.js', () => ({
  loadSyncIdentityPeerBaseline: async () => runtime.fast ? { localEpoch: 'local-epoch',
    peerEpoch: 'peer-epoch', localWatermark: 'old-local', peerWatermark: 'old-peer' } : null,
  recordSyncIdentityPeerBaseline: async (_port: unknown,
    baseline: { localViewId: string; peerViewId: string;
      localProofRoot: string; peerProofRoot: string }) => { runtime.baselines.push(baseline); }
}));
vi.mock('../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => Promise<unknown>) => task()
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (port: unknown) => Promise<unknown>) => task({}),
    runWriter: (task: (port: unknown) => Promise<unknown>) => task({})
  })
}));
vi.mock('../network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerHostName: async () => 'Peer',
  resolveCompanionSyncPeerId: async () => 'peer'
}));
vi.mock('./syncGroupStore', () => ({
  loadCompanionSyncGroup: async () => ({ group_id: 'group', local_device_identity_key: 'local' })
}));
vi.mock('./syncGroupIdentityProbe', () => ({
  probeCompanionSyncIdentities: async (_endpoint: string, baseline?: unknown) => {
    runtime.probes += 1;
    runtime.probeBaselines.push(baseline);
    const index = runtime.probes;
    return { count: index === runtime.terminalProbe ? 0 : 1,
      usedTimeCandidates: false, localViewId: `local-${index}`,
      sourceViewId: `remote-${index}`, snapshotPath: `/snapshot-${index}`,
      localEpoch: 'local-epoch', sourceEpoch: 'peer-epoch',
      localWatermark: 'local-time', sourceWatermark: 'peer-time',
      localProofRoot: 'a'.repeat(64), peerProofRoot: 'b'.repeat(64),
      cleanup: async () => { runtime.cleanups.push(String(index)); } };
  }
}));
vi.mock('./syncGroupIdentityExchange', () => ({
  receiveCompanionSyncIdentityCandidates: async (args: { snapshotPath: string }) => {
    runtime.receivedFrom.push(args.snapshotPath);
    return { appliedPages: 1, appliedObjects: 2, pageCount: 1 };
  },
  sendCompanionSyncIdentityCandidates: async (args: { snapshotPath: string }) => {
    runtime.sentFrom = args.snapshotPath;
    return { appliedPages: 1, appliedObjects: 2, pageCount: 1 };
  }
}));
vi.mock('./framed/companionFramedSyncInventoryRound', () => ({
  sendCompanionFramedSyncInventoryDifferences: vi.fn(async () => {
    if (runtime.framedError) throw runtime.framedError;
    return { deferredObjects: [],
      sent: Array.from({ length: runtime.framedSent }, (_, index) => ({ objectId: `node-${index}` })) };
  })
}));
vi.mock('./syncGroupIdentityResources', async original => ({
  ...await original<typeof import('./syncGroupIdentityResources')>(),
  drainCompanionSyncIdentityResources: async (args: {
    onProgress?: CompanionDesktopSyncOptions['onProgress']
  }) => {
    if (runtime.resourceError) throw new Error('sync_group_resources_incomplete');
    args.onProgress?.({ phase: 'content', completed: 1, total: 1 });
    return { syncedCount: 0, stages: createEmptyResourceStages() };
  }
}));

import { runCompanionSyncIdentityRound } from './syncGroupIdentityRound.js';

it('refreshes received structure and forwards progress before downloading resources', async () => {
  runtime.probes = 0;
  runtime.terminalProbe = 3;
  runtime.resourceError = false;
  const progress = vi.fn();
  const refreshed = vi.fn();
  await runCompanionSyncIdentityRound('http://peer', 'Local', {
    onProgress: progress, onStructureSynced: refreshed
  });
  expect(refreshed).toHaveBeenCalledWith(2);
  expect(progress).toHaveBeenCalledWith({ phase: 'content', completed: 1, total: 1 });
  expect(refreshed.mock.invocationCallOrder[0]).toBeLessThan(progress.mock.invocationCallOrder[0]!);
});

it('reprobes after receiving so it never uploads an obsolete local source view', async () => {
  runtime.probes = 0;
  runtime.cleanups = [];
  runtime.baselines = [];
  runtime.sentFrom = '';
  runtime.fast = false;
  runtime.probeBaselines = [];
  runtime.receivedFrom = [];
  runtime.resourceError = false;
  runtime.framedSent = 0;
  await expect(runCompanionSyncIdentityRound('http://peer', 'Local'))
    .resolves.toMatchObject({ verifiedCandidateCount: 0,
      received: { appliedObjects: 2 } });
  expect(runtime.sentFrom).toBe('/snapshot-2');
  expect(runtime.probes).toBe(3);
  expect(runtime.baselines).toMatchObject([{ localViewId: 'local-3', peerViewId: 'remote-3',
    localProofRoot: 'a'.repeat(64), peerProofRoot: 'b'.repeat(64) }]);
  expect(runtime.cleanups).toEqual(['3', '2', '1']);
});

it('reprobes after framed node transfers before the legacy remainder is selected', async () => {
  runtime.probes = 0;
  runtime.cleanups = [];
  runtime.receivedFrom = [];
  runtime.resourceError = false;
  runtime.framedSent = 1;
  runtime.terminalProbe = 4;
  try {
    await expect(runCompanionSyncIdentityRound('http://peer', 'Local'))
      .resolves.toMatchObject({ framed: { sent: [{ objectId: 'node-0' }] },
        verifiedCandidateCount: 0 });
    expect(runtime.sentFrom).toBe('/snapshot-3');
    expect(runtime.cleanups).toEqual(['2', '4', '3', '1']);
  } finally {
    runtime.framedSent = 0;
    runtime.terminalProbe = 3;
  }
});

it('does not fall back to the legacy sender when framed transfer fails', async () => {
  runtime.probes = 0;
  runtime.cleanups = [];
  runtime.sentFrom = '';
  runtime.resourceError = false;
  runtime.framedError = new Error('framed_sync_http_503');
  try {
    await expect(runCompanionSyncIdentityRound('http://peer', 'Local'))
      .rejects.toThrow('framed_sync_http_503');
    expect(runtime.sentFrom).toBe('');
    expect(runtime.cleanups).toEqual(['2', '1']);
  } finally {
    runtime.framedError = null;
  }
});

it('checks global identities even when an older peer baseline exists', async () => {
  runtime.probes = 0;
  runtime.cleanups = [];
  runtime.baselines = [];
  runtime.sentFrom = '';
  runtime.fast = true;
  runtime.probeBaselines = [];
  runtime.receivedFrom = [];
  runtime.resourceError = false;
  await expect(runCompanionSyncIdentityRound('http://peer', 'Local'))
    .resolves.toMatchObject({ usedTimeCandidates: false, verifiedCandidateCount: 0,
      received: { appliedPages: 1 } });
  expect(runtime.receivedFrom).toEqual(['/snapshot-1']);
  expect(runtime.sentFrom).toBe('/snapshot-2');
  expect(runtime.probeBaselines).toEqual([undefined, undefined, undefined]);
  expect(runtime.cleanups).toEqual(['3', '2', '1']);
});

it('leaves the peer baseline untouched when resource bytes remain missing', async () => {
  runtime.probes = 0;
  runtime.cleanups = [];
  runtime.baselines = [];
  runtime.fast = false;
  runtime.resourceError = true;
  await expect(runCompanionSyncIdentityRound('http://peer', 'Local'))
    .rejects.toThrow('sync_group_resources_incomplete');
  expect(runtime.baselines).toEqual([]);
  expect(runtime.cleanups).toEqual(['3', '2', '1']);
  runtime.resourceError = false;
});

it('does not record a complete baseline when resource transfer is omitted', async () => {
  runtime.probes = 0;
  runtime.cleanups = [];
  runtime.baselines = [];
  runtime.fast = false;
  runtime.resourceError = true;
  await expect(runCompanionSyncIdentityRound('http://peer', 'Local',
    { includeResources: false })).resolves.toMatchObject({ verifiedCandidateCount: 0 });
  expect(runtime.baselines).toEqual([]);
  runtime.resourceError = false;
});

it('includes the follow-up pages and candidates produced by adopted positions', async () => {
  runtime.probes = 0;
  runtime.terminalProbe = 5;
  runtime.receivedFrom = [];
  runtime.resourceError = false;
  try {
    await expect(runCompanionSyncIdentityRound('http://peer', 'Local'))
      .resolves.toMatchObject({ candidateCount: 4, verifiedCandidateCount: 0,
        received: { appliedPages: 2, appliedObjects: 4, pageCount: 2 },
        sent: { appliedPages: 2, appliedObjects: 4, pageCount: 2 } });
    expect(runtime.receivedFrom).toEqual(['/snapshot-1', '/snapshot-3']);
    expect(runtime.sentFrom).toBe('/snapshot-4');
    expect(runtime.probes).toBe(5);
  } finally { runtime.terminalProbe = 3; }
});
