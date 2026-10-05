// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { syncIdentityPartitionDigest } from '../../../../../lib/core/sync/syncIdentityDigest.js';

const runtime = vi.hoisted(() => ({
  closed: 0, corruptSummary: false, factPages: 0,
  rows: [] as Array<{ object_id: string; kind: string;
    source_fingerprint: string | null; receiver_fingerprint: string | null }>
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionLegacyIdentitySource: {
    createIdentitySourceView: async () => ({ snapshot_path: '/tmp/cache/foliole-provider-source-test.db',
      source_view_id: '11111111-1111-1111-1111-111111111111' }),
    closeIdentitySourceView: async () => { runtime.closed += 1; }
  }
}));
vi.mock('./syncGroupIdentityCandidateStore', () => ({
  initializeCompanionIdentityCandidates: async () => undefined,
  stageCompanionIdentityCandidates: async (_path: string, rows: typeof runtime.rows) => {
    runtime.rows.push(...rows);
  },
  countCompanionIdentityCandidates: async () => new Set(runtime.rows.map((row) => row.object_id)).size
}));
vi.mock('./syncGroupIdentitySemanticProof', () => ({
  excludeCompanionSyncIdentitySatisfiedFacts: async () => 0
}));

import { probeCompanionSyncIdentities } from './syncGroupIdentityProbe.js';
import { stageCompanionIdentityFactCandidates } from './syncGroupIdentityProbeFacts.js';

const state = 'a'.repeat(64);
const localRoot = '1'.repeat(64);
const peerRoot = '2'.repeat(64);
const remoteEntries = [
  { object_type: 'node', object_id: 'remote', fingerprint: 'b'.repeat(64) },
  { object_type: 'node', object_id: 'same', fingerprint: state }
];
const localEntries = [
  { object_type: 'node', object_id: 'local', fingerprint: 'c'.repeat(64) },
  { object_type: 'node', object_id: 'same', fingerprint: state }
];
const remoteFacts = [{ object_type: 'node', object_id: 'same',
  fingerprint: 'd'.repeat(64), state_fingerprint: state }];
const localFacts = [{ object_type: 'node', object_id: 'same',
  fingerprint: 'e'.repeat(64), state_fingerprint: state }];

function inventory(entries: Array<{ object_type: string; object_id: string; fingerprint: string }>) {
  return { digest: syncIdentityPartitionDigest(entries), row_count: entries.length };
}

vi.mock('./syncGroupIdentityRemoteRead', () => ({
  readCompanionRemoteIdentityGlobalSummary: async () => ({ inventory: {
    ...inventory(remoteEntries),
    ...(runtime.corruptSummary ? { digest: '0'.repeat(64) } : {})
  },
    source_epoch: 'f'.repeat(32), source_view_id: '22222222-2222-2222-2222-222222222222',
    watermark: 'now' }),
  readCompanionRemoteIdentityGlobalPage: async () => ({
    entries: remoteEntries,
    nextAfter: null }),
  readCompanionRemoteFactSummary: async () => ({ inventory: inventory(remoteFacts),
    proof_root: peerRoot }),
  readCompanionRemoteFactPage: async () => {
    runtime.factPages += 1;
    return { entries: remoteFacts, nextAfter: null };
  }
}));
vi.mock('./syncGroupIdentityLocalRead', () => ({
  readCompanionLocalIdentitySource: async (_path: string, kind: string) => {
    if (kind === 'global_summary') return { inventory: inventory(localEntries),
      source_epoch: '1'.repeat(32), watermark: 'now' };
    if (kind === 'fact_global_summary') return { inventory: inventory(localFacts),
      proof_root: localRoot };
    const entries = kind === 'global_page' ? localEntries : localFacts;
    if (kind === 'global_page') return { entries, nextAfter: null };
    return { entries, nextAfter: null };
  }
}));

it('discovers old missing IDs and missing facts behind equal state fingerprints', async () => {
  runtime.rows = [];
  runtime.closed = 0;
  runtime.corruptSummary = false;
  const probe = await probeCompanionSyncIdentities('http://peer');
  expect(probe.count).toBe(3);
  expect(runtime.rows.map((row) => [row.object_id, row.kind])).toEqual(expect.arrayContaining([
    ['remote', 'source_only'], ['local', 'receiver_only'], ['same', 'divergent']
  ]));
  expect(runtime.rows.find((row) => row.object_id === 'same')).toMatchObject({
    source_fingerprint: state, receiver_fingerprint: state
  });
  await probe.cleanup();
  expect(runtime.closed).toBe(1);
});

it('discards a fixed local source view when the peer global digest is false', async () => {
  runtime.rows = [];
  runtime.closed = 0;
  runtime.corruptSummary = true;
  await expect(probeCompanionSyncIdentities('http://peer'))
    .rejects.toThrow('sync_identity_global_inventory_mismatch');
  expect(runtime.closed).toBe(1);
  runtime.corruptSummary = false;
});

it('skips fact pages only for the same completed bilateral proof', async () => {
  runtime.rows = [];
  runtime.factPages = 0;
  const args = { endpointUrl: 'http://peer', remoteViewId: 'view', snapshotPath: 'snapshot' };
  const baseline = { localProofRoot: localRoot, peerProofRoot: peerRoot,
    proofRevision: 'retention-v2' };
  expect(await stageCompanionIdentityFactCandidates({ ...args, factBaseline: baseline }))
    .toEqual({ localProofRoot: localRoot, peerProofRoot: peerRoot });
  expect(runtime.factPages).toBe(0);
  expect(runtime.rows).toEqual([]);
  await stageCompanionIdentityFactCandidates({ ...args,
    factBaseline: { ...baseline, peerProofRoot: localRoot } });
  expect(runtime.factPages).toBeGreaterThan(0);
  expect(runtime.rows.map((row) => row.object_id)).toContain('same');
});
