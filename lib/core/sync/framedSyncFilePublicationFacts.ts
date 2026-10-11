import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { decodeFramedSyncManifest, encodeFramedSyncManifest } from '../database/framedSyncStagingSerialization.js';

import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';

export async function writeFramedSyncFilePublicationFacts(files: FramedSyncFilePort,
  directory: string, manifest: CanonicalManifest) {
  const digests: string[] = [];
  for (const [index, fact] of manifest.facts.entries()) {
    const data = new TextEncoder().encode(encodeFramedSyncManifest({ blobs: [], facts: [fact] }));
    await files.write(`${directory}/facts/${index}.json`, data);
    digests.push(bytesToHex(sha256(data)));
  }
  return digests;
}

export async function readFramedSyncFilePublicationFact(files: FramedSyncFilePort,
  directory: string, index: number, digests: readonly string[]) {
  const expected = digests[index];
  if (!expected) throw new Error('framed_sync_fact_index_invalid');
  const bytes = await files.read(`${directory}/facts/${index}.json`);
  if (!bytes || bytesToHex(sha256(bytes)) !== expected) throw new Error('framed_sync_publication_fact_mismatch');
  const manifest = decodeFramedSyncManifest(new TextDecoder().decode(bytes));
  if (manifest.facts.length !== 1 || manifest.blobs.length) throw new Error('framed_sync_publication_fact_mismatch');
  return manifest.facts[0]!;
}
