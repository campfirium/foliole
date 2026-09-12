import { buildCanonicalAttachmentStorageKey, parseCanonicalAttachmentStorageKey } from './attachmentResource.js';

const ASSET_MARKDOWN_SCHEME = 'asset://';

export function buildAssetMarkdownUrl(storageKey: string) {
  if (!parseCanonicalAttachmentStorageKey(storageKey)) {
    throw new Error('attachment storage key is not canonical');
  }
  return `${ASSET_MARKDOWN_SCHEME}${storageKey}`;
}

export function buildCanonicalAssetMarkdownUrl(contentHash: string, mimeType: string) {
  const storageKey = buildCanonicalAttachmentStorageKey(contentHash, mimeType);
  if (!storageKey) throw new Error('attachment identity is not canonical');
  return buildAssetMarkdownUrl(storageKey);
}

export function parseAssetMarkdownUrl(resourceUrl: string) {
  if (!resourceUrl.startsWith(ASSET_MARKDOWN_SCHEME)) {
    return null;
  }

  const encodedValue = resourceUrl.slice(ASSET_MARKDOWN_SCHEME.length).trim();
  if (!encodedValue) {
    return null;
  }

  const storageKey = (() => {
    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return null;
    }
  })();
  return storageKey && parseCanonicalAttachmentStorageKey(storageKey)?.storageKey || null;
}

export { ASSET_MARKDOWN_SCHEME };
