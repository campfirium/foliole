import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

export const ATTACHMENT_PROTOCOL_SCHEME = 'foliole-asset';
const ATTACHMENT_PROTOCOL_HOST = 'attachment';
const ATTACHMENT_PROTOCOL_PREFIX = `${ATTACHMENT_PROTOCOL_SCHEME}://${ATTACHMENT_PROTOCOL_HOST}/`;

export function buildAttachmentAssetUrl(resource: string | { storageKey: string }) {
  const storageKey = typeof resource === 'string' ? resource : resource.storageKey;
  if (!parseCanonicalAttachmentStorageKey(storageKey)) {
    throw new Error('attachment storage key is not canonical');
  }
  return `${ATTACHMENT_PROTOCOL_SCHEME}://${ATTACHMENT_PROTOCOL_HOST}/${encodeURIComponent(storageKey)}`;
}

export function parseAttachmentAssetUrl(requestUrl: string) {
  try {
    if (!requestUrl.startsWith(ATTACHMENT_PROTOCOL_PREFIX) || requestUrl.includes('#')) return null;
    const rawStorageKey = requestUrl.slice(ATTACHMENT_PROTOCOL_PREFIX.length).split('?', 1)[0];
    if (!rawStorageKey || rawStorageKey.includes('/')) return null;
    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.protocol !== `${ATTACHMENT_PROTOCOL_SCHEME}:` || parsedUrl.host !== ATTACHMENT_PROTOCOL_HOST) {
      return null;
    }
    if (parsedUrl.username || parsedUrl.password || !/^\/[^/]+$/.test(parsedUrl.pathname)) return null;
    const storageKey = decodeURIComponent(rawStorageKey);
    const parsedStorageKey = parseCanonicalAttachmentStorageKey(storageKey);
    return parsedStorageKey;
  } catch {
    return null;
  }
}
