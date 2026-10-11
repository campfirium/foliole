// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';

import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { loadFramedSyncFileBody, releaseFramedSyncFileBodies, stageFramedSyncFileBody } from '../../lib/core/sync/framedSyncFileBodies.js';
import { loadFramedSyncFileInboundBody, stageFramedSyncFileInboundBody } from '../../lib/core/sync/framedSyncFileInboundBodies.js';
import { createFramedSyncFileOutboundStaging } from '../../lib/core/sync/framedSyncFileOutbound.js';
import { loadFramedSyncFileTask } from '../../lib/core/sync/framedSyncFilePublication.js';
import { completeFramedSyncFileRecovery, reconcileFramedSyncFilePublication,
  selectFramedSyncFileRecoveryPublication } from '../../lib/core/sync/framedSyncFileRecovery.js';
import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';

import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const hash = new Uint8Array(32).fill(1);
const source: FramedSyncInventoryEntry = { globalId: 'node', objectType: 'node', currentVersionId: 'b',
  frontierFactIds: ['a', 'b'], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  stateFactIds: [], sharedStateHash: hash };

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-file-recovery-'));
  roots.push(root);
  const files = createDesktopFramedSyncFiles(root);
  const staging = createFramedSyncFileOutboundStaging(files);
  const context = { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION as typeof FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', senderDeviceId: 'sender',
    senderLibraryEpoch: 'a', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'b' };
  const manifest = { blobs: [], facts: ['a', 'b'].map((factId) => ({ factId, blobs: [], body: [],
    kind: 2, objectType: 'node', globalId: 'node', sharedStateHash: hash })) };
  const contentId = await canonicalContentId(manifest);
  const publication = { context, contentId, manifestHash: contentId, manifest,
    transferId: await canonicalTransferId(context, contentId),
    inventoryDifference: compareFramedSyncInventories({ local: [source], remote: [] })[0]! };
  await staging.publishOutbound(publication);
  return { files, staging, root, publication };
}

it('uses unchanged inventory comparison to retire satisfied tasks without inventing a receipt', async () => {
  const { files, staging, publication } = await fixture();
  await expect(staging.releaseOutboundHolds(publication.transferId)).rejects.toThrow('receipt_required');
  expect(await reconcileFramedSyncFilePublication(files, publication.transferId, [source])).toBe('satisfied');
  await staging.releaseOutboundHolds(publication.transferId);
  expect(await loadFramedSyncFileTask(files, publication.transferId)).toEqual(expect.objectContaining({ state: 'retired' }));
  expect((await loadFramedSyncFileTask(files, publication.transferId))?.receipt).toBeUndefined();
  expect(await staging.loadOutboundPublication(publication.transferId)).toBeNull();
});

it('keeps the original until the missing frozen subset is confirmed, including across reopen', async () => {
  const { files, root, publication, staging } = await fixture();
  const remote = [{ ...source, frontierFactIds: ['a'], sharedStateHash: new Uint8Array(32).fill(2) }];
  expect(await reconcileFramedSyncFilePublication(files, publication.transferId, remote)).toBe('missing');
  const recovered = await selectFramedSyncFileRecoveryPublication(files, publication.transferId, remote);
  expect(recovered.manifest.facts.map((fact) => fact.factId)).toEqual(['b']);
  await expect(completeFramedSyncFileRecovery(files, publication.transferId, recovered.transferId))
    .rejects.toThrow('delivery_unconfirmed');
  const reopened = createDesktopFramedSyncFiles(root);
  const resumed = createFramedSyncFileOutboundStaging(reopened);
  await resumed.commitOutboundReceipt({ transferId: recovered.transferId, contentId: recovered.contentId,
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'b', appliedStateHash: hash });
  await completeFramedSyncFileRecovery(reopened, publication.transferId, recovered.transferId);
  await resumed.releaseOutboundHolds(publication.transferId);
  expect(await staging.loadOutboundPublication(publication.transferId)).toBeNull();
});

it('accepts an updated valid receipt hash but never a different receiver', async () => {
  const { staging, publication } = await fixture();
  const receipt = { transferId: publication.transferId, contentId: publication.contentId,
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'b', appliedStateHash: hash };
  expect(await staging.commitOutboundReceipt(receipt)).toBe('committed');
  expect(await staging.commitOutboundReceipt(receipt)).toBe('identical');
  expect(await staging.commitOutboundReceipt({ ...receipt, appliedStateHash: new Uint8Array(32).fill(3) })).toBe('committed');
  await expect(staging.commitOutboundReceipt({ ...receipt, receiverDeviceId: 'another' })).rejects.toThrow('outbound_receipt_mismatch');
});

it('loads the frozen body after reopening and rejects changed source bytes under the old hash', async () => {
  const { files, root } = await fixture();
  const data = new TextEncoder().encode('Original body');
  const descriptor = { sha256: sha256(data), byteLength: BigInt(data.length), required: true, role: 1 };
  await stageFramedSyncFileBody(files, descriptor, data, { purpose: 'outbound', transferId: hash });
  expect(await loadFramedSyncFileBody(createDesktopFramedSyncFiles(root), descriptor)).toEqual(data);
  await expect(stageFramedSyncFileBody(files, descriptor, new TextEncoder().encode('Edited body'), { purpose: 'outbound', transferId: hash }))
    .rejects.toThrow('published_body_unavailable');
});

it('retains a shared frozen body until both task owners release it', async () => {
  const { files, root } = await fixture();
  const data = new TextEncoder().encode('Shared frozen body');
  const blob = { sha256: sha256(data), byteLength: BigInt(data.length), required: true, role: 1 };
  const first = { purpose: 'outbound' as const, transferId: hash };
  const second = { purpose: 'outbound' as const, transferId: new Uint8Array(32).fill(2) };
  await Promise.all([stageFramedSyncFileBody(files, blob, data, first), stageFramedSyncFileBody(files, blob, data, second)]);
  await releaseFramedSyncFileBodies(files, [blob], first);
  const reopened = createDesktopFramedSyncFiles(root);
  expect(await loadFramedSyncFileBody(reopened, blob)).toEqual(data);
  await releaseFramedSyncFileBodies(reopened, [blob], second);
  await expect(loadFramedSyncFileBody(reopened, blob)).rejects.toThrow('published_body_unavailable');
  await releaseFramedSyncFileBodies(reopened, [blob], second);
});

it('retains an inbound body when an unrelated outbound cleanup has already observed its last hold disappearing', async () => {
  const { files, root } = await fixture();
  const data = new TextEncoder().encode('The same body in two transfers');
  const blob = { sha256: sha256(data), byteLength: BigInt(data.length), role: 1, required: true };
  const outgoing = { purpose: 'outbound' as const, transferId: new Uint8Array(32).fill(8) };
  const incoming = { transferId: new Uint8Array(32).fill(9), attemptId: new Uint8Array(16).fill(7) };
  await stageFramedSyncFileBody(files, blob, data, outgoing);
  let reached!: () => void;
  let resume!: () => void;
  const empty = new Promise<void>(resolve => { reached = resolve; });
  const continued = new Promise<void>(resolve => { resume = resolve; });
  const cleanup = releaseFramedSyncFileBodies({ ...files, async list(key) {
    const names = await files.list(key);
    if (key === `body-holds/${bytesToHex(blob.sha256)}` && names.length === 0) {
      reached();
      await continued;
    }
    return names;
  } }, [blob], outgoing);
  await empty;
  try { await stageFramedSyncFileInboundBody(createDesktopFramedSyncFiles(root), incoming, blob, data); }
  finally { resume(); }
  await cleanup;
  expect(await loadFramedSyncFileInboundBody(createDesktopFramedSyncFiles(root), incoming, blob)).toEqual(data);
  await expect(loadFramedSyncFileBody(files, blob)).rejects.toThrow('published_body_unavailable');
});
