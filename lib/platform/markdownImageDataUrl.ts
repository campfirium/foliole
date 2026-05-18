const SAFE_MARKDOWN_DATA_IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export interface MarkdownDataImageSize {
  height: number;
  width: number;
}

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

function decodeBase64Prefix(value: string, maxChars: number) {
  try {
    const decoded = globalThis.atob(value.slice(0, maxChars));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function parsePngSize(bytes: Uint8Array): MarkdownDataImageSize | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

function parseGifSize(bytes: Uint8Array): MarkdownDataImageSize | null {
  if (bytes.length < 10 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint16(8, true), width: view.getUint16(6, true) };
}

function parseJpegSize(bytes: Uint8Array): MarkdownDataImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (byteAt(bytes, offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = byteAt(bytes, offset + 1);
    const length = (byteAt(bytes, offset + 2) << 8) + byteAt(bytes, offset + 3);
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb)) {
      return {
        height: (byteAt(bytes, offset + 5) << 8) + byteAt(bytes, offset + 6),
        width: (byteAt(bytes, offset + 7) << 8) + byteAt(bytes, offset + 8)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function byteAt(bytes: Uint8Array, offset: number) {
  return bytes[offset] ?? 0;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number) {
  return byteAt(bytes, offset) + (byteAt(bytes, offset + 1) << 8) + (byteAt(bytes, offset + 2) << 16);
}

function parseWebpSize(bytes: Uint8Array): MarkdownDataImageSize | null {
  if (bytes.length < 30 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[8] !== 0x57) {
    return null;
  }
  const chunk = String.fromCharCode(byteAt(bytes, 12), byteAt(bytes, 13), byteAt(bytes, 14), byteAt(bytes, 15));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (chunk === 'VP8X') {
    return { height: readUint24LittleEndian(bytes, 27) + 1, width: readUint24LittleEndian(bytes, 24) + 1 };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    return {
      height: (((byteAt(bytes, 23) << 2) | ((byteAt(bytes, 22) & 0xc0) >> 6) | ((byteAt(bytes, 24) & 0x0f) << 10)) + 1),
      width: (((byteAt(bytes, 22) & 0x3f) << 8) | byteAt(bytes, 21)) + 1
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return { height: view.getUint16(28, true) & 0x3fff, width: view.getUint16(26, true) & 0x3fff };
  }
  return null;
}

export function parseMarkdownDataImageSize(value: string): MarkdownDataImageSize | null {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/isu.exec(value);
  if (!match || !match[2]?.toLowerCase().split(';').includes('base64')) return null;
  const mimeType = match[1]?.trim().toLowerCase();
  if (!mimeType || !SAFE_MARKDOWN_DATA_IMAGE_MIME_TYPES.has(mimeType)) return null;
  const bytes = decodeBase64Prefix(match[3] ?? '', mimeType === 'image/jpeg' ? 86_000 : 128);
  if (!bytes) return null;
  if (mimeType === 'image/png') return parsePngSize(bytes);
  if (mimeType === 'image/gif') return parseGifSize(bytes);
  if (mimeType === 'image/jpeg') return parseJpegSize(bytes);
  if (mimeType === 'image/webp') return parseWebpSize(bytes);
  return null;
}
