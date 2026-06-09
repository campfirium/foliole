import { createHash } from 'node:crypto';

import type { Clipboard, NativeImage } from 'electron';

export interface ClipboardSnapshot {
  fingerprint: string;
  formats: string[];
  hasImage: boolean;
  text: string;
}

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hashBuffer(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function safeReadBuffer(clipboardRef: Pick<Clipboard, 'readBuffer'>, format: string) {
  try {
    return clipboardRef.readBuffer(format);
  } catch {
    return Buffer.alloc(0);
  }
}

function safeReadText(read: () => string) {
  try {
    return read();
  } catch {
    return '';
  }
}

function isImageEmpty(image: NativeImage) {
  try {
    return image.isEmpty();
  } catch {
    return true;
  }
}

export function readClipboardSnapshot(
  clipboardRef: Pick<Clipboard, 'availableFormats' | 'readBuffer' | 'readHTML' | 'readImage' | 'readText'>
): ClipboardSnapshot {
  const formats = [...clipboardRef.availableFormats()].sort();
  const formatFingerprints = formats.map((format) => {
    const bytes = safeReadBuffer(clipboardRef, format);
    return `${format}:${bytes.length}:${hashBuffer(bytes)}`;
  });
  const image = clipboardRef.readImage();
  const html = safeReadText(() => clipboardRef.readHTML());
  const text = safeReadText(() => clipboardRef.readText());
  const hasImage = !isImageEmpty(image);
  const parts = [
    `formats=${formatFingerprints.join('|')}`,
    `html=${hashText(html)}`,
    `text=${hashText(text)}`,
    `image=${hasImage ? 'present' : 'empty'}`
  ];
  return { fingerprint: hashText(parts.join('\n')), formats, hasImage, text };
}

export function hasClipboardChanged(before: ClipboardSnapshot, after: ClipboardSnapshot) {
  return before.fingerprint !== after.fingerprint;
}

export function hasStrictTextSelectionClipboard(snapshot: ClipboardSnapshot) {
  return snapshot.text.trim().length > 0
    && !snapshot.hasImage
    && !snapshot.formats.some(isFileLikeClipboardFormat);
}

function isFileLikeClipboardFormat(format: string) {
  const normalized = format.toLowerCase();
  return normalized.includes('filename')
    || normalized.includes('file name')
    || normalized.includes('cf_hdrop')
    || normalized.includes('text/uri-list')
    || normalized.includes('filegroupdescriptor');
}
