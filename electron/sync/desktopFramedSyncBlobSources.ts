import { createReadStream } from 'node:fs';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalBlob, CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { framedSyncPublicationResources } from '../../lib/core/sync/framedSyncPublicationResources.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';

import { projectDesktopFramedSyncNodeRecord } from './desktopFramedSyncNodeProjection.js';
import { resolveDesktopFramedSyncNodeResources } from './desktopFramedSyncNodeResources.js';

export type DesktopFramedSyncBlobSource = Readonly<{
  blob: CanonicalBlob;
  chunks(): AsyncIterable<Uint8Array>;
}>;

function byteChunks(data: Uint8Array) {
  return async function* chunks() {
    for (let offset = 0; offset < data.byteLength; offset += FRAMED_SYNC_LIMITS.blobChunkBytes) {
      yield data.slice(offset, offset + FRAMED_SYNC_LIMITS.blobChunkBytes);
    }
  };
}

function fileChunks(filePath: string) {
  return async function* chunks() {
    for await (const chunk of createReadStream(filePath, {
      highWaterMark: FRAMED_SYNC_LIMITS.blobChunkBytes
    })) yield new Uint8Array(chunk);
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
    if (blob.role === 1) {
      const [row] = await db.query<{ data: Uint8Array }>(
        'SELECT data FROM content_blob_data WHERE hash = ?', [hash]);
      if (!row || !(row.data instanceof Uint8Array) ||
          BigInt(row.data.byteLength) !== blob.byteLength || bytesToHex(sha256(row.data)) !== hash) {
        throw new Error('framed_sync_published_body_unavailable');
      }
      sources.push({ blob, chunks: byteChunks(row.data) });
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
