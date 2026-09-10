export type AttachmentByteKind =
  | 'application/pdf'
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'approved_html'
  | 'unknown';

const XHTML_TRANSITIONAL = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"';
const HTML5 = '<!DOCTYPE html>';

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiPrefix(bytes: Uint8Array, length = 128) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, length));
}

export function classifyAttachmentBytes(bytes: Uint8Array): AttachmentByteKind {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const ascii = asciiPrefix(bytes);
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  if (ascii.startsWith('%PDF-')) return 'application/pdf';
  if (ascii.startsWith(XHTML_TRANSITIONAL) || ascii.startsWith(HTML5)) return 'approved_html';
  return 'unknown';
}

export function isSupportedAttachmentKind(kind: AttachmentByteKind) {
  return kind !== 'approved_html' && kind !== 'unknown';
}
