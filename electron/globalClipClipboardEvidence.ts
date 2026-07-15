import { createHash } from 'node:crypto';

import type { Clipboard, NativeImage } from 'electron';

type ClipboardData = Parameters<Clipboard['write']>[0];

export interface ClipboardSnapshot {
  fingerprint: string;
  formats: string[];
  hasImage: boolean;
  text: string;
}

export interface RestorableClipboardSnapshot {
  data: ClipboardData;
  snapshot: ClipboardSnapshot;
}

export interface ClipboardRestoreContext {
  afterCopy: ClipboardSnapshot;
  beforeCopy: RestorableClipboardSnapshot;
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

function safeReadBookmark(read: () => { title: string; url: string }) {
  try {
    return read();
  } catch {
    return { title: '', url: '' };
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

export function readRestorableClipboardSnapshot(
  clipboardRef: Pick<Clipboard, 'availableFormats' | 'readBookmark' | 'readBuffer' | 'readHTML' | 'readImage' | 'readRTF' | 'readText'>
): RestorableClipboardSnapshot {
  const snapshot = readClipboardSnapshot(clipboardRef);
  const text = safeReadText(() => clipboardRef.readText());
  const html = safeReadText(() => clipboardRef.readHTML());
  const rtf = safeReadText(() => clipboardRef.readRTF());
  const bookmark = safeReadBookmark(() => clipboardRef.readBookmark());
  const image = clipboardRef.readImage();
  const data: ClipboardData = {};
  if (text || bookmark.url) data.text = text || bookmark.url;
  if (html) data.html = html;
  if (rtf) data.rtf = rtf;
  if (bookmark.title) data.bookmark = bookmark.title;
  if (!isImageEmpty(image)) data.image = image;
  return { data, snapshot };
}

export function hasClipboardChanged(before: ClipboardSnapshot, after: ClipboardSnapshot) {
  return before.fingerprint !== after.fingerprint;
}

export function createClipboardRestoreContext(
  beforeCopy: RestorableClipboardSnapshot,
  afterCopy: ClipboardSnapshot
): ClipboardRestoreContext {
  return { afterCopy, beforeCopy };
}

export function restoreClipboardIfUnchanged(args: {
  clipboardRef: Pick<Clipboard, 'availableFormats' | 'clear' | 'readBuffer' | 'readHTML' | 'readImage' | 'readText' | 'write'>;
  context: ClipboardRestoreContext;
  log: (event: string, payload?: Record<string, unknown>) => void;
}) {
  const current = readClipboardSnapshot(args.clipboardRef);
  if (hasClipboardChanged(args.context.afterCopy, current)) {
    args.log('global_clip_clipboard_restore_skipped_changed');
    return false;
  }
  try {
    args.clipboardRef.clear();
    args.clipboardRef.write(args.context.beforeCopy.data);
    args.log('global_clip_clipboard_restored');
    return true;
  } catch (error) {
    args.log('global_clip_clipboard_restore_failed', { error });
    return false;
  }
}
