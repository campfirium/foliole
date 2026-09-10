const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const CANONICAL_EXTENSION_BY_MIME = {
  'application/pdf': '.pdf',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
} as const;

const MIME_BY_CANONICAL_EXTENSION = new Map<string, string>(
  Object.entries(CANONICAL_EXTENSION_BY_MIME).map(([mimeType, extension]) => [extension, mimeType])
);

export type SupportedAttachmentMimeType = keyof typeof CANONICAL_EXTENSION_BY_MIME;

export type AttachmentAvailability = 'cached' | 'local' | 'missing' | 'remote_known' | 'unresolved';

export interface AttachmentResourceDescription {
  attachmentId: string;
  availability: AttachmentAvailability;
  contentHash: string;
  libraryScope: string;
  mimeType: SupportedAttachmentMimeType;
  storageKey: string;
}

export function canonicalAttachmentExtension(mimeType: string) {
  return CANONICAL_EXTENSION_BY_MIME[mimeType.trim().toLowerCase() as SupportedAttachmentMimeType] ?? null;
}

export function buildCanonicalAttachmentStorageKey(contentHash: string, mimeType: string) {
  const normalizedHash = contentHash.trim();
  const extension = canonicalAttachmentExtension(mimeType);
  if (!SHA256_PATTERN.test(normalizedHash) || !extension) return null;
  return `${normalizedHash}${extension}`;
}

export function parseCanonicalAttachmentStorageKey(storageKey: string) {
  const normalizedKey = storageKey.trim();
  if (normalizedKey.includes('/') || normalizedKey.includes('\\') || normalizedKey !== storageKey) return null;
  const dotIndex = normalizedKey.lastIndexOf('.');
  if (dotIndex !== 64) return null;
  const contentHash = normalizedKey.slice(0, dotIndex);
  const extension = normalizedKey.slice(dotIndex);
  const mimeType = MIME_BY_CANONICAL_EXTENSION.get(extension);
  if (!SHA256_PATTERN.test(contentHash) || !mimeType) return null;
  return { contentHash, mimeType: mimeType as SupportedAttachmentMimeType, storageKey: normalizedKey };
}

export function isCanonicalAttachmentStorageKey(storageKey: string, contentHash: string, mimeType: string) {
  return buildCanonicalAttachmentStorageKey(contentHash, mimeType) === storageKey;
}
