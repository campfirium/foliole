const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const EXTENSION_BY_MIME = {
  'application/epub+zip': '.epub',
  'application/pdf': '.pdf',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
} as const;

export type CanonicalAttachmentMimeType = keyof typeof EXTENSION_BY_MIME;

export function canonicalAttachmentExtension(mimeType: string | null) {
  if (!mimeType) return null;
  return EXTENSION_BY_MIME[mimeType.trim().toLowerCase() as CanonicalAttachmentMimeType] ?? null;
}

export function buildCanonicalAttachmentKey(contentHash: string | null, mimeType: string | null) {
  if (!contentHash || !SHA256_PATTERN.test(contentHash) || !mimeType) return null;
  const extension = canonicalAttachmentExtension(mimeType);
  return extension ? `${contentHash}${extension}` : null;
}
