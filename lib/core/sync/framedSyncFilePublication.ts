import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { decodeFramedSyncManifest } from '../database/framedSyncStagingSerialization.js';

import { sameCanonicalManifest } from './framedSyncCanonicalEquality.js';
import { canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { holdFramedSyncFileBody } from './framedSyncFileBodies.js';
import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, framedSyncFileKey,
  type FramedSyncFilePort } from './framedSyncFilePort.js';
import { readFramedSyncFilePublicationFact, writeFramedSyncFilePublicationFacts } from './framedSyncFilePublicationFacts.js';
import { decodePublicationInventory, encodePublicationInventory } from './framedSyncPublicationInventory.js';
import { assertOutboundPublication, type OutboundPublishInput } from './framedSyncStagingContract.js';

const digest = z.array(z.number().int().min(0).max(255)).length(32).transform((value) => Uint8Array.from(value));
const receiptSchema = z.object({ transferId: digest, contentId: digest, receiverDeviceId: z.string(),
  receiverLibraryEpoch: z.string(), appliedStateHash: digest });
const publicationSchema = z.object({
  transferId: digest, contentId: digest, manifestHash: digest, manifest: z.string().optional(),
  factDigests: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).optional(),
  state: z.enum(['published', 'confirmed', 'retired']).default('published'),
  receipt: receiptSchema.optional(), completedAt: z.number().int().nonnegative().optional(),
  context: z.object({ protocolVersion: z.literal(FRAMED_SYNC_PROTOCOL_VERSION), groupId: z.string().min(1),
    senderDeviceId: z.string().min(1), senderLibraryEpoch: z.string().min(1),
    receiverDeviceId: z.string().min(1), receiverLibraryEpoch: z.string().min(1) })
});
export type FramedSyncFileTask = z.infer<typeof publicationSchema>;

export function framedSyncPublicationDirectory(transferId: Uint8Array) {
  if (transferId.byteLength !== 32) throw new Error('framed_sync_transfer_id_invalid');
  return framedSyncFileKey('outbound', bytesToHex(transferId));
}

export function framedSyncPublicationKey(transferId: Uint8Array) {
  return `${framedSyncPublicationDirectory(transferId)}/publication.json`;
}

export async function loadFramedSyncFileTask(files: FramedSyncFilePort, transferId: Uint8Array) {
  const bytes = await files.read(framedSyncPublicationKey(transferId));
  if (!bytes) return null;
  return decodeFramedSyncFileTask(bytes, transferId);
}

export async function decodeFramedSyncFileTask(bytes: Uint8Array, transferId: Uint8Array, sealed = true) {
  const stored = publicationSchema.parse(decodeFramedSyncFileJson(bytes));
  if (bytesToHex(stored.transferId) !== bytesToHex(transferId) ||
      bytesToHex(await canonicalTransferId(stored.context, stored.contentId)) !== bytesToHex(transferId) ||
      bytesToHex(stored.contentId) !== bytesToHex(stored.manifestHash)) {
    throw new Error('outbound_transfer_identity_mismatch');
  }
  if (stored.state !== 'retired' && (!stored.manifest || (sealed && !stored.factDigests))) throw new Error('outbound_publication_manifest_missing');
  return stored;
}

export async function loadFramedSyncFilePublication(files: FramedSyncFilePort, transferId: Uint8Array) {
  const stored = await loadFramedSyncFileTask(files, transferId);
  if (!stored?.manifest) return null;
  const inventoryDifference = decodePublicationInventory(stored.manifest);
  const metadata = decodeFramedSyncManifest(stored.manifest);
  const facts = [];
  for (let index = 0; index < metadata.facts.length; index += 1) {
    facts.push(await readFramedSyncFilePublicationFact(files, framedSyncPublicationDirectory(transferId), index, stored.factDigests ?? []));
  }
  const publication: OutboundPublishInput = { transferId: stored.transferId, contentId: stored.contentId,
    manifestHash: stored.manifestHash, context: stored.context, manifest: { blobs: metadata.blobs, facts },
    ...(inventoryDifference ? { inventoryDifference } : {}) };
  if (bytesToHex(publication.transferId) !== bytesToHex(transferId)) {
    throw new Error('outbound_transfer_identity_mismatch');
  }
  await assertOutboundPublication(publication);
  return publication;
}

export async function publishFramedSyncFileOutbound(files: FramedSyncFilePort, input: OutboundPublishInput) {
  await assertOutboundPublication(input);
  return files.exclusive(framedSyncPublicationDirectory(input.transferId), async () => {
    const existing = await loadFramedSyncFilePublication(files, input.transferId);
    if (existing) {
      if (!sameCanonicalManifest(existing.manifest, input.manifest)) throw new Error('outbound_publication_conflict');
      return 'identical' as const;
    }
    for (const blob of input.manifest.blobs) {
      if ((blob.role === 1 || blob.role === 5) && !await holdFramedSyncFileBody(files, blob,
        { purpose: 'outbound', transferId: input.transferId })) throw new Error('framed_sync_published_body_unavailable');
    }
    const factDigests = await writeFramedSyncFilePublicationFacts(files, framedSyncPublicationDirectory(input.transferId), input.manifest);
    const metadata = { blobs: input.manifest.blobs, facts: input.manifest.facts.map(fact => ({ ...fact, body: [] })) };
    await files.write(framedSyncPublicationKey(input.transferId), encodeFramedSyncFileJson({
      ...input, state: 'published', factDigests, manifest: encodePublicationInventory(metadata, input.inventoryDifference)
    }));
    return 'created' as const;
  });
}

/** Directory entries with no sealed publication are never pending work. */
export async function* streamFramedSyncFilePublications(files: FramedSyncFilePort) {
  for (const id of await files.list('outbound')) {
    if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('framed_sync_publication_directory_invalid');
    const transferId = hexToBytes(id);
    const publication = await loadFramedSyncFilePublication(files, transferId);
    if (publication) yield publication;
  }
}
