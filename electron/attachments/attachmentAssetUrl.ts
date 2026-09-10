import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

export const ATTACHMENT_PROTOCOL_SCHEME = 'foliole-asset';
const ATTACHMENT_PROTOCOL_HOST = 'attachment';

export function buildAttachmentAssetUrl(description: AttachmentResourceDescription) {
  const query = new URLSearchParams({
    attachment_id: description.attachmentId,
    content_hash: description.contentHash,
    library_scope: description.libraryScope,
    mime_type: description.mimeType
  });
  return `${ATTACHMENT_PROTOCOL_SCHEME}://${ATTACHMENT_PROTOCOL_HOST}/${description.storageKey}?${query}`;
}

export function parseAttachmentAssetUrl(requestUrl: string) {
  try {
    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.protocol !== `${ATTACHMENT_PROTOCOL_SCHEME}:` || parsedUrl.host !== ATTACHMENT_PROTOCOL_HOST) {
      return null;
    }
    const storageKey = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '').trim());
    const parsedStorageKey = parseCanonicalAttachmentStorageKey(storageKey);
    const attachmentId = parsedUrl.searchParams.get('attachment_id')?.trim();
    const libraryScope = parsedUrl.searchParams.get('library_scope')?.trim();
    const contentHash = parsedUrl.searchParams.get('content_hash')?.trim();
    const mimeType = parsedUrl.searchParams.get('mime_type')?.trim();
    if (!parsedStorageKey || !attachmentId || !libraryScope || contentHash !== parsedStorageKey.contentHash ||
        mimeType !== parsedStorageKey.mimeType) return null;
    return { attachmentId, availability: 'local' as const, contentHash, libraryScope,
      mimeType: parsedStorageKey.mimeType, storageKey };
  } catch {
    return null;
  }
}
