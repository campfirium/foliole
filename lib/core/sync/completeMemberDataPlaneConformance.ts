import { createHash } from 'node:crypto';

import {
  COMPLETE_MEMBER_RESOURCE_KINDS,
  COMPLETE_MEMBER_SHARED_POLICY_KEYS
} from './completeMemberDataPlaneContract.js';

export interface CompleteMemberFact {
  deletedAt: string | null;
  id: string;
  payload: string | null;
  policyKey: string;
  sequence: number;
}

export interface CompleteMemberResource {
  bytes: Uint8Array;
  hash: string;
  id: string;
  kind: string;
}

export interface CompleteMemberBatch {
  facts: CompleteMemberFact[];
  resources: CompleteMemberResource[];
  toCursor: number;
}

export interface CompleteMemberConformanceAdapter {
  accept(peerId: string, batch: CompleteMemberBatch): Promise<number>;
  acknowledge(peerId: string, batch: CompleteMemberBatch): Promise<void>;
  exportTo(peerId: string): Promise<CompleteMemberBatch>;
  host: 'android' | 'electron' | 'ios';
  inspect(): Promise<{ cursorByPeer: Record<string, number>; facts: CompleteMemberFact[]; privateKeys: string[] }>;
  seed(facts: CompleteMemberFact[], resources: CompleteMemberResource[], privateKeys: string[]): Promise<void>;
}

export function createCompleteMemberConformanceFixture() {
  const facts = COMPLETE_MEMBER_SHARED_POLICY_KEYS.map((policyKey, index) => ({
    deletedAt: null,
    id: `${policyKey}:fixture`,
    payload: JSON.stringify({ policyKey, value: `fixture-${index + 1}` }),
    policyKey,
    sequence: index + 1
  }));
  const resources = COMPLETE_MEMBER_RESOURCE_KINDS.map((kind) => {
    const bytes = new TextEncoder().encode(`${kind}-fixture-bytes`);
    return { bytes, hash: sha256(bytes), id: `${kind}:fixture`, kind };
  });
  return { facts, privateKeys: ['device.theme', 'host.scroll', 'search.node'], resources };
}

export async function runCompleteMemberDataPlaneConformance(
  source: CompleteMemberConformanceAdapter,
  peer: CompleteMemberConformanceAdapter,
  destination: CompleteMemberConformanceAdapter
) {
  const fixture = createCompleteMemberConformanceFixture();
  await source.seed(fixture.facts, fixture.resources, fixture.privateKeys);
  const outbound = await source.exportTo(peer.host);
  assertCoverage(outbound);
  const firstApply = await peer.accept(source.host, outbound);
  const repeatedApply = await peer.accept(source.host, outbound);
  if (firstApply !== fixture.facts.length || repeatedApply !== 0) throw new Error('complete_member_apply_not_idempotent');
  await source.acknowledge(peer.host, outbound);
  if ((await source.exportTo(peer.host)).facts.length !== 0) throw new Error('complete_member_receipt_not_effective');
  if ((await source.exportTo(destination.host)).facts.length !== fixture.facts.length) {
    throw new Error('complete_member_receipt_not_peer_scoped');
  }
  const relay = await peer.exportTo(destination.host);
  await destination.accept(peer.host, relay);
  const finalCursor = await exerciseDeleteRestore(source, peer, destination, fixture.facts[0]!);
  await exerciseIntegrityFailure(destination, relay);
  const destinationState = await destination.inspect();
  assertCoverage({ ...relay, facts: destinationState.facts });
  if (destinationState.privateKeys.length !== 0) throw new Error('complete_member_private_state_transferred');
  if (destinationState.cursorByPeer[peer.host] !== finalCursor) throw new Error('complete_member_cursor_not_persisted');
  return { destination: destination.host, peer: peer.host, source: source.host };
}

async function exerciseDeleteRestore(
  source: CompleteMemberConformanceAdapter,
  peer: CompleteMemberConformanceAdapter,
  destination: CompleteMemberConformanceAdapter,
  original: CompleteMemberFact
) {
  const nextSequence = COMPLETE_MEMBER_SHARED_POLICY_KEYS.length + 1;
  const tombstone = { ...original, deletedAt: '2026-09-03T00:01:00.000Z', payload: null, sequence: nextSequence };
  await source.seed([tombstone], [], []);
  await relayLatest(source, peer, destination);
  const restored = { ...original, payload: JSON.stringify({ restored: true }), sequence: nextSequence + 1 };
  await source.seed([restored], [], []);
  const finalCursor = await relayLatest(source, peer, destination);
  const stored = (await destination.inspect()).facts.find(({ id }) => id === original.id);
  if (stored?.deletedAt !== null || stored.payload !== restored.payload) throw new Error('complete_member_restore_failed');
  return finalCursor;
}

async function relayLatest(
  source: CompleteMemberConformanceAdapter,
  peer: CompleteMemberConformanceAdapter,
  destination: CompleteMemberConformanceAdapter
) {
  const outbound = await source.exportTo(peer.host);
  await peer.accept(source.host, outbound);
  await source.acknowledge(peer.host, outbound);
  const relay = await peer.exportTo(destination.host);
  await destination.accept(peer.host, relay);
  return relay.toCursor;
}

async function exerciseIntegrityFailure(
  destination: CompleteMemberConformanceAdapter,
  validBatch: CompleteMemberBatch
) {
  const resource = validBatch.resources[0]!;
  const invalid = {
    ...validBatch,
    resources: [{ ...resource, bytes: new TextEncoder().encode('corrupted') }]
  };
  try {
    await destination.accept('integrity-probe', invalid);
    throw new Error('complete_member_resource_integrity_not_enforced');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'complete_member_resource_integrity_failed') throw error;
  }
  if ((await destination.inspect()).cursorByPeer['integrity-probe'] !== undefined) {
    throw new Error('complete_member_failed_apply_advanced_cursor');
  }
}

function assertCoverage(batch: CompleteMemberBatch) {
  const actual = [...new Set(batch.facts.map(({ policyKey }) => policyKey))].sort();
  const expected = [...COMPLETE_MEMBER_SHARED_POLICY_KEYS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('complete_member_fact_coverage_incomplete');
  for (const resource of batch.resources) {
    if (sha256(resource.bytes) !== resource.hash) throw new Error('complete_member_resource_integrity_failed');
  }
  const resourceKinds = [...new Set(batch.resources.map(({ kind }) => kind))].sort();
  if (JSON.stringify(resourceKinds) !== JSON.stringify([...COMPLETE_MEMBER_RESOURCE_KINDS].sort())) {
    throw new Error('complete_member_resource_coverage_incomplete');
  }
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
