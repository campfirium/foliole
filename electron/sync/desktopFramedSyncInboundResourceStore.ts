import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { bytesToHex } from '@noble/hashes/utils.js';

import type { ManifestBlobDescriptor } from '../../lib/core/sync/framedSyncBlobContract.js';
import { readFramedSyncNodeResources, type FramedSyncNodeResource } from '../../lib/core/sync/framedSyncNodeResources.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { hashResourceFile } from './resourceFileHash.js';

type ResourceRecord = Readonly<{ snapshot: Pick<NativeSyncNodeRecord['snapshot'], 'resource_references'> }>;

type Entry = Readonly<{ descriptor: ManifestBlobDescriptor; partialPath: string }>;

export class DesktopFramedSyncInboundResourceStore {
  readonly #attemptId: Uint8Array;
  readonly #entries: Map<string, Entry>;
  readonly #staging: FramedSyncStagingPort;
  readonly #transferId: Uint8Array;

  constructor(input: Readonly<{
    attemptId: Uint8Array;
    descriptors: readonly ManifestBlobDescriptor[];
    staging: FramedSyncStagingPort;
    transferId: Uint8Array;
  }>) {
    this.#attemptId = input.attemptId;
    this.#staging = input.staging;
    this.#transferId = input.transferId;
    const transfer = bytesToHex(input.transferId);
    const attempt = bytesToHex(input.attemptId);
    this.#entries = new Map(input.descriptors.filter((descriptor) => descriptor.role !== 1 && descriptor.role !== 5)
      .map((descriptor) => {
        const hash = bytesToHex(descriptor.sha256);
        const target = resolveAttachmentStoragePath(hash, undefined, mimeForRole(descriptor.role));
        return [hash, { descriptor, partialPath: path.join(path.dirname(target),
          `.framed-sync-${transfer}-${attempt}-${hash}.partial`) }];
      }));
  }

  has(sha256: Uint8Array) { return this.#entries.has(bytesToHex(sha256)); }

  async append(sha256: Uint8Array, offset: bigint, data: Uint8Array) {
    const entry = this.#entries.get(bytesToHex(sha256));
    if (!entry) throw new Error('framed_sync_resource_blob_undeclared');
    const chunkSha256 = new Uint8Array(createHash('sha256').update(data).digest());
    await this.#staging.stageResourceBlobChunk({
      attemptId: this.#attemptId,
      chunkSha256,
      data,
      offset,
      sha256,
      transferId: this.#transferId
    });
    await fs.mkdir(path.dirname(entry.partialPath), { recursive: true });
    const handle = await fs.open(entry.partialPath, 'r+').catch(async (error: unknown) => {
      if (errorCode(error) !== 'ENOENT') throw error;
      return fs.open(entry.partialPath, 'w+', 0o600);
    });
    try {
      let written = 0;
      while (written < data.byteLength) {
        const result = await handle.write(data, written, data.byteLength - written,
          Number(offset) + written);
        if (result.bytesWritten < 1) throw new Error('framed_sync_resource_write_incomplete');
        written += result.bytesWritten;
      }
      await handle.sync();
    } finally { await handle.close(); }
  }

  async complete(records: readonly ResourceRecord[], resources: readonly FramedSyncNodeResource[] = []) {
    const keys = resourceStorageKeys(records, resources);
    for (const [hash, entry] of this.#entries) {
      const storageKey = keys.get(hash);
      if (!storageKey) throw new Error('framed_sync_resource_storage_key_missing');
      await this.#commit(entry, hash, storageKey);
      await this.#staging.verifyAndMarkResourceBlobAvailable({
        attemptId: this.#attemptId,
        sha256: entry.descriptor.sha256,
        storageKey,
        transferId: this.#transferId
      });
    }
  }

  async discard() {
    await Promise.all([...this.#entries.values()].map((entry) =>
      fs.rm(entry.partialPath, { force: true })));
  }

  async #commit(entry: Entry, hash: string, storageKey: string) {
    const parsed = parseCanonicalAttachmentStorageKey(storageKey);
    if (!parsed || parsed.contentHash !== hash) throw new Error('framed_sync_resource_storage_key_invalid');
    const target = resolveAttachmentStoragePath(hash, undefined, parsed.mimeType);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (entry.descriptor.byteLength === 0n) await fs.writeFile(entry.partialPath, '', { flag: 'a' });
    const stat = await fs.stat(entry.partialPath);
    if (BigInt(stat.size) !== entry.descriptor.byteLength || await hashResourceFile(entry.partialPath) !== hash) {
      throw new Error('framed_sync_resource_blob_mismatch');
    }
    try { await fs.link(entry.partialPath, target); } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const targetStat = await fs.stat(target);
      if (BigInt(targetStat.size) !== entry.descriptor.byteLength ||
          await hashResourceFile(target) !== hash) throw new Error('framed_sync_resource_target_conflict');
    }
    await fs.rm(entry.partialPath, { force: true });
  }
}

function resourceStorageKeys(records: readonly ResourceRecord[], resources: readonly FramedSyncNodeResource[]) {
  const result = new Map<string, string>();
  for (const resource of [...resources, ...records.flatMap((record) =>
    readFramedSyncNodeResources(record.snapshot.resource_references))]) {
    const prior = result.get(resource.contentHash);
    if (prior && prior !== resource.storageKey) throw new Error('node_resource_blob_identity_conflict');
    result.set(resource.contentHash, resource.storageKey);
  }
  return result;
}

function mimeForRole(role: number) {
  if (role === 2) return 'image/png';
  if (role === 3) return 'application/pdf';
  return 'application/epub+zip';
}

function errorCode(error: unknown) {
  return error !== null && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string' ? error.code : null;
}
