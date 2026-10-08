import { expect, it } from 'vitest';

import { canonicalContentId, canonicalManifestBytes } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { framedSyncPublicationResources } from './framedSyncPublicationResources.js';
import { projectFramedSyncResourceFact, restoreFramedSyncResourceFact } from './framedSyncResourceFact.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';
import { factToWire } from './framedSyncWireProjection.js';

const hash = '1'.repeat(64);
const binding = { demandId: 'demand-1', bodyHash: '2'.repeat(64), globalId: 'article',
  sharedStateHash: new Uint8Array(32).fill(3), versionId: 'version' };

it.each([
  { contentHash: hash, role: 2 as const, storageKey: `${hash}.png` },
  { contentHash: hash, role: 3 as const, storageKey: `${hash}.pdf` },
  { contentHash: hash, role: 4 as const, storageKey: `${hash}.epub` }
])('transports an independent attachment batch without article body bytes ($role)', async (resource) => {
  const fact = projectFramedSyncResourceFact(binding, resource, 123n);
  const manifest = { facts: [fact], blobs: fact.blobs };
  expect(canonicalManifestBytes(manifest).byteLength).toBeLessThan(1024);
  expect(await canonicalContentId(manifest)).toHaveLength(32);
  const encoded = encodeValidatedProtocolMessage('fact', factToWire(fact));
  const decoded = canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact));
  expect(restoreFramedSyncResourceFact(decoded)).toEqual({ ...binding, blob: fact.blobs[0], resource });
  expect(framedSyncPublicationResources(manifest).get(hash)).toEqual(resource);
});

it('rejects a resource whose claimed storage key, role, or hash does not match its bytes descriptor', () => {
  const resource = { contentHash: hash, role: 2 as const, storageKey: `${hash}.png` };
  const fact = projectFramedSyncResourceFact(binding, resource, 123n);
  expect(() => restoreFramedSyncResourceFact({ ...fact, blobs: [{ ...fact.blobs[0]!, role: 3 }] }))
    .toThrow('framed_sync_resource_fact_invalid');
  expect(() => projectFramedSyncResourceFact(binding, { ...resource, contentHash: '4'.repeat(64) }, 123n))
    .toThrow('framed_sync_resource_fact_invalid');
  expect(() => projectFramedSyncResourceFact(binding, resource, -1n))
    .toThrow('framed_sync_resource_fact_invalid');
});

it('binds transfer identity to the demand, node, adopted body, version, and attachment', async () => {
  const resource = { contentHash: hash, role: 2 as const, storageKey: `${hash}.png` };
  const identity = async (value: typeof binding) => {
    const fact = projectFramedSyncResourceFact(value, resource, 123n);
    return canonicalContentId({ facts: [fact], blobs: fact.blobs });
  };
  const original = await identity(binding);
  for (const changed of [
    { ...binding, globalId: 'other-article' }, { ...binding, bodyHash: '5'.repeat(64) },
    { ...binding, versionId: 'other-version' }, { ...binding, demandId: 'demand-2' }
  ]) expect(await identity(changed)).not.toEqual(original);
});
