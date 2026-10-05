import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  acceptBlobChunk,
  verifyCompleteBlob,
  type BlobChunk,
  type ManifestBlobDescriptor
} from '../../lib/core/sync/framedSyncBlobContract.js';
import type { FramedSyncBlobContent } from '../../lib/core/sync/framedSyncTransferPayloads.js';

type Entry = Readonly<{
  chunks: BlobChunk[];
  descriptor: ManifestBlobDescriptor;
}>;

export class DesktopFramedSyncInboundBlobSet {
  readonly #entries: Map<string, Entry>;

  constructor(descriptors: readonly ManifestBlobDescriptor[]) {
    const bodyDescriptors = descriptors.filter((descriptor) => descriptor.role === 1);
    this.#entries = new Map(bodyDescriptors.map((descriptor) => [bytesToHex(descriptor.sha256), {
      chunks: [], descriptor
    }]));
    if (this.#entries.size !== bodyDescriptors.length) {
      throw new Error('framed_sync_blob_content_set_mismatch');
    }
  }

  has(sha256Value: Uint8Array) { return this.#entries.has(bytesToHex(sha256Value)); }

  append(sha256Value: Uint8Array, offset: bigint, data: Uint8Array) {
    const entry = this.#entries.get(bytesToHex(sha256Value));
    if (!entry) throw new Error('framed_sync_blob_content_set_mismatch');
    const accepted = acceptBlobChunk(entry.descriptor, entry.chunks, { data, offset });
    entry.chunks.splice(0, entry.chunks.length, ...accepted.chunks);
  }

  complete(): readonly FramedSyncBlobContent[] {
    return [...this.#entries.values()].map(({ chunks, descriptor }) => {
      const data = new Uint8Array(Buffer.concat(chunks.map((chunk) => chunk.data)));
      verifyCompleteBlob(descriptor, chunks, sha256(data));
      return { data, sha256: descriptor.sha256 };
    });
  }
}
