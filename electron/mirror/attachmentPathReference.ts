import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

export function resolveMirrorAttachmentPath(storageKey: string) {
  const identity = parseCanonicalAttachmentStorageKey(storageKey);
  return identity ? resolveAttachmentStoragePath(identity.contentHash, undefined, identity.mimeType) : null;
}
