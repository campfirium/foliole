import { createHash } from 'node:crypto';

import type { NativeImage } from 'electron';

import type { ClipboardEvidenceAccess, LegacyClipboardData } from './clipboardAccess.js';

export interface ClipboardSnapshot {
  fingerprint: string;
  formats: string[];
  hasImage: boolean;
  text: string;
}

export interface RestorableClipboardSnapshot {
  data: LegacyClipboardData;
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

async function safeRead<T>(read: () => T | Promise<T>, fallback: T) {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function isImageEmpty(image: NativeImage) {
  try {
    return image.isEmpty();
  } catch {
    return true;
  }
}

export async function readClipboardSnapshot(
  clipboardRef: ClipboardEvidenceAccess
): Promise<ClipboardSnapshot> {
  const formats = [...await safeRead(() => clipboardRef.availableFormats(), [])].sort();
  const formatFingerprints = await Promise.all(formats.map(async (format) => {
    const bytes = await safeRead(() => clipboardRef.readBuffer(format), Buffer.alloc(0));
    return `${format}:${bytes.length}:${hashBuffer(bytes)}`;
  }));
  const image = await safeRead(() => clipboardRef.readImage(), null);
  const html = await safeRead(() => clipboardRef.readHTML(), '');
  const text = await safeRead(() => clipboardRef.readText(), '');
  const hasImage = image ? !isImageEmpty(image) : false;
  const parts = [
    `formats=${formatFingerprints.join('|')}`,
    `html=${hashText(html)}`,
    `text=${hashText(text)}`,
    `image=${hasImage ? 'present' : 'empty'}`
  ];
  return { fingerprint: hashText(parts.join('\n')), formats, hasImage, text };
}

export async function readRestorableClipboardSnapshot(
  clipboardRef: ClipboardEvidenceAccess
): Promise<RestorableClipboardSnapshot> {
  const snapshot = await readClipboardSnapshot(clipboardRef);
  const text = await safeRead(() => clipboardRef.readText(), '');
  const html = await safeRead(() => clipboardRef.readHTML(), '');
  const rtf = await safeRead(() => clipboardRef.readRTF(), '');
  const bookmark = await safeRead(() => clipboardRef.readBookmark(), { title: '', url: '' });
  const image = await safeRead(() => clipboardRef.readImage(), null);
  const data: LegacyClipboardData = {};
  if (text || bookmark.url) data.text = text || bookmark.url;
  if (html) data.html = html;
  if (rtf) data.rtf = rtf;
  if (bookmark.title) data.bookmark = bookmark.title;
  if (image && !isImageEmpty(image)) data.image = image;
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

export async function restoreClipboardIfUnchanged(args: {
  clipboardRef: ClipboardEvidenceAccess;
  context: ClipboardRestoreContext;
  log: (event: string, payload?: Record<string, unknown>) => void;
}) {
  const current = await readClipboardSnapshot(args.clipboardRef);
  if (hasClipboardChanged(args.context.afterCopy, current)) {
    args.log('global_clip_clipboard_restore_skipped_changed');
    return false;
  }
  try {
    await args.clipboardRef.clear();
    await args.clipboardRef.write(args.context.beforeCopy.data);
    args.log('global_clip_clipboard_restored');
    return true;
  } catch (error) {
    args.log('global_clip_clipboard_restore_failed', { error });
    return false;
  }
}
