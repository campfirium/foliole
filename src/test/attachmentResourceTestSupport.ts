import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import {
  clearAttachmentResourceDescriptions,
  registerAttachmentResourceDescriptions
} from '../../lib/platform/attachmentResourceRegistry.js';

export const TEST_ATTACHMENT_HASH = 'a'.repeat(64);
export const TEST_ATTACHMENT_STORAGE_KEY = `${TEST_ATTACHMENT_HASH}.png`;
export const TEST_ATTACHMENT_ASSET_URL = `asset://${TEST_ATTACHMENT_STORAGE_KEY}`;

export function createTestAttachmentResource(input: {
  attachmentId?: string;
  contentHash?: string;
  mimeType?: AttachmentResourceDescription['mimeType'];
} = {}) {
  const contentHash = input.contentHash ?? TEST_ATTACHMENT_HASH;
  const mimeType = input.mimeType ?? 'image/png';
  const storageKey = buildCanonicalAttachmentStorageKey(contentHash, mimeType);
  if (!storageKey) throw new Error('test attachment resource must be canonical');
  return {
    assetUrl: `asset://${storageKey}`,
    description: {
      attachmentId: input.attachmentId ?? 'hash-1',
      availability: 'local' as const,
      contentHash,
      libraryScope: 'test-library',
      mimeType,
      storageKey
    }
  };
}

export function registerTestAttachmentResource(input: Parameters<typeof createTestAttachmentResource>[0] = {}) {
  const resource = createTestAttachmentResource(input);
  registerAttachmentResourceDescriptions([resource.description]);
  return resource;
}

export function resetTestAttachmentResources() {
  clearAttachmentResourceDescriptions();
}
