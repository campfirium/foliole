import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ removed: [] as string[] }));
vi.mock('./syncGroupIdentityCandidateStore', () => ({
  readCompanionIdentitySemanticCandidates: async () => [
    { object_type: 'node', object_id: 'benign', kind: 'divergent', partition: 1,
      source_fingerprint: 'a', receiver_fingerprint: 'a' },
    { object_type: 'node', object_id: 'held', kind: 'divergent', partition: 2,
      source_fingerprint: 'b', receiver_fingerprint: 'b' }
  ],
  removeCompanionIdentitySatisfiedCandidates: async (_path: string,
    rows: Array<{ object_id: string }>) => {
    runtime.removed.push(...rows.map((row) => row.object_id));
  }
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (port: unknown) => unknown) => task({}) })
}));
vi.mock('./syncGroupIdentitySourceRead', () => ({
  withCompanionSyncIdentitySnapshot: (_port: unknown, _path: string,
    task: (port: unknown) => unknown) => task({})
}));

function version(id: string, nodeId: string, parent: string | null = null) {
  return { version_id: id, object_id: nodeId, parent_version_id: parent,
    body_hash: `body-${id}`, content_hash: id, host_name: 'A',
    created_at: 'now', snapshot_metadata: '{}' };
}

function factPage(nodeId: string, section: string, remote: boolean) {
  const versions = [version('base', nodeId), version('head', nodeId, 'merged'),
    version('merged', nodeId, 'base'), version('other', nodeId)].map((fact) =>
    !remote && fact.version_id === 'merged' ? { ...fact, body_hash: null } : fact);
  const parents = [
    { version_id: 'head', parent_version_id: 'merged', ordinal: 0 },
    ...(remote || nodeId === 'benign' ? [
      { version_id: 'merged', parent_version_id: 'base', ordinal: 0 },
      { version_id: 'merged', parent_version_id: 'other', ordinal: 1 }
    ] : [])
  ];
  const entries = section === 'versions' ? versions : section === 'parents' ? parents :
    section === 'requirements' ? [
      { version_id: 'head', frozen: 0 },
      ...(!remote && nodeId === 'held' ? [{ version_id: 'other', frozen: 0 }] : [])
    ] : [];
  return { node_id: nodeId, section, head_id: 'head',
    fact_digest: 'a'.repeat(64), requirements_digest: 'b'.repeat(64),
    entries, nextAfter: null };
}

vi.mock('../../../../../lib/core/sync/syncIdentityNodeFactPage', () => ({
  readSyncIdentityNodeFactDescriptorPage: async (_port: unknown,
    args: { nodeId: string; section: string }) => factPage(args.nodeId, args.section, false)
}));
vi.mock('./syncGroupIdentityRemoteRead', () => ({
  readCompanionRemoteNodeFacts: async (_endpoint: string, _view: string,
    nodeId: string, section: string) => factPage(nodeId, section, true)
}));

import { excludeCompanionSyncIdentitySatisfiedFacts } from './syncGroupIdentitySemanticProof';

it('accepts retired intermediate bodies but keeps a held branch missing its original relation', async () => {
  runtime.removed = [];
  expect(await excludeCompanionSyncIdentitySatisfiedFacts({ endpointUrl: 'http://peer',
    remoteViewId: 'view', snapshotPath: '/snapshot.db' })).toBe(1);
  expect(runtime.removed).toEqual(['benign']);
});
