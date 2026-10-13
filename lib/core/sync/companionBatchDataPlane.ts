import { isCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import type { DbPort } from './dbPort.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface CompanionAttachmentManifestEntry {
  attachmentId: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

export async function applyCompanionAttachmentManifest(
  _port: DbPort,
  args: { entries: CompanionAttachmentManifestEntry[]; failedIds: string[]; now: string }
) {
  assertAttachmentEntries(args.entries);
  const syncedIds: string[] = [];
  const failedIds = new Set(args.failedIds);
  for (const entry of args.entries) {
    if (entry.attachmentId !== entry.contentHash) {
      failedIds.add(entry.attachmentId);
      continue;
    }
    syncedIds.push(entry.attachmentId);
  }
  return { failedIds: [...failedIds], syncedIds };
}

function assertAttachmentEntries(entries: CompanionAttachmentManifestEntry[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.attachmentId || ids.has(entry.attachmentId)) throw new Error('Attachment batch manifest has duplicate or empty ids.');
    if (!SHA256_PATTERN.test(entry.contentHash) ||
      !isCanonicalAttachmentStorageKey(entry.storageKey, entry.contentHash, entry.mimeType)
      || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
      throw new Error('Attachment batch manifest is invalid.');
    }
    ids.add(entry.attachmentId);
  }
}
