const SAFE_MARKDOWN_DATA_IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export function isDataUrlDestination(value: string) {
  try {
    return new URL(value).protocol === 'data:';
  } catch {
    return false;
  }
}

export function isSafeMarkdownDataImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'data:') return false;
    const metadata = parsed.pathname.split(',', 1)[0] ?? '';
    const [mimeType, ...parameters] = metadata.split(';').map((part) => part.trim().toLowerCase());
    return Boolean(mimeType && SAFE_MARKDOWN_DATA_IMAGE_MIME_TYPES.has(mimeType) && parameters.includes('base64'));
  } catch {
    return false;
  }
}
