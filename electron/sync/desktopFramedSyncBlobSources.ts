import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalBlob, CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { loadFramedSyncFrozenBody } from '../../lib/core/sync/framedSyncFrozenBody.js';
import { framedSyncPublicationResources } from '../../lib/core/sync/framedSyncPublicationResources.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';

import { projectDesktopFramedSyncNodeRecord } from './desktopFramedSyncNodeProjection.js';
import { resolveDesktopFramedSyncNodeResources } from './desktopFramedSyncNodeResources.js';
import { readFramedSyncFileChunks } from './framedSyncFileChunks.js';

export type DesktopFramedSyncBlobSource = Readonly<{
  blob: CanonicalBlob;
  /** A chunk remains valid until the consumer requests the next chunk. */
  chunks(): AsyncIterable<Uint8Array>;
}>;

function byteChunks(data: Uint8Array) {
  return async function* chunks() {
    if (data.byteLength) yield data;
  };
}

function fileChunks(filePath: string) {
  return () => readFramedSyncFileChunks(filePath, FRAMED_SYNC_LIMITS.blobChunkBytes);
}

function storedBodyChunks(db: DbPort, blob: CanonicalBlob) {
  return async function* chunks() {
    yield* byteChunks(await loadFramedSyncFrozenBody(db, blob))();
  };
}

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && bytesToHex(left.sha256) === bytesToHex(right.sha256);
}

export function loadDesktopFramedSyncBlobSources(
  records: readonly NativeSyncNodeRecord[],
  manifest: CanonicalManifest
) {
  const sources = new Map<string, DesktopFramedSyncBlobSource>();
  for (const record of records) {
    const resources = resolveDesktopFramedSyncNodeResources(record);
    const projection = projectDesktopFramedSyncNodeRecord(record, resources.map((value) => value.blob));
    const bodyBlob = projection.manifest.blobs.find((blob) => blob.role === 1);
    if (!bodyBlob) throw new Error('framed_sync_node_body_blob_missing');
    addSource(sources, { blob: bodyBlob, chunks: byteChunks(projection.bodyBlob) });
    for (const alternative of projection.alternativeBodyBlobs ?? []) {
      addSource(sources, { blob: alternative.blob, chunks: byteChunks(alternative.data) });
    }
    for (const resource of resources) {
      addSource(sources, { blob: resource.blob, chunks: fileChunks(resource.filePath) });
    }
  }
  if (sources.size !== manifest.blobs.length) throw new Error('framed_sync_blob_content_set_mismatch');
  return manifest.blobs.map((blob) => {
    const source = sources.get(bytesToHex(blob.sha256));
    if (!source || !sameBlob(source.blob, blob)) throw new Error('framed_sync_blob_content_mismatch');
    return source;
  });
}

function addSource(sources: Map<string, DesktopFramedSyncBlobSource>, source: DesktopFramedSyncBlobSource) {
  const key = bytesToHex(source.blob.sha256);
  const prior = sources.get(key);
  if (prior && !sameBlob(prior.blob, source.blob)) {
    throw new Error('framed_sync_outbound_blob_identity_conflict');
  }
  if (!prior) sources.set(key, source);
}

export async function loadDesktopFramedSyncPublishedBlobSources(db: DbPort, manifest: CanonicalManifest) {
  const resources = framedSyncPublicationResources(manifest);
  const sources: DesktopFramedSyncBlobSource[] = [];
  for (const blob of manifest.blobs) {
    const hash = bytesToHex(blob.sha256);
    if ((blob.role === 1 || blob.role === 5)) {
      const [row] = await db.query<{ size: number }>(
        'SELECT byte_length AS size FROM framed_sync_available_blobs WHERE sha256 = ?', [blob.sha256]);
      if (!row || BigInt(row.size) !== blob.byteLength) {
        throw new Error('framed_sync_published_body_unavailable');
      }
      sources.push({ blob, chunks: storedBodyChunks(db, blob) });
    } else {
      const resource = resources.get(hash);
      const resolved = resource && resolveAttachmentFileForSync(resource.storageKey);
      if (!resource || resource.role !== blob.role || !resolved || resolved.status !== 'ready' ||
          BigInt(resolved.sizeBytes) !== blob.byteLength) {
        throw new Error('framed_sync_published_resource_unavailable');
      }
      sources.push({ blob, chunks: fileChunks(resolved.filePath) });
    }
  }
  return sources;
}
