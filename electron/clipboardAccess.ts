import { ClipboardItem, clipboard, nativeImage, type NativeImage } from 'electron';

type MaybePromise<T> = T | Promise<T>;

export interface LegacyClipboardData {
  bookmark?: string;
  html?: string;
  image?: NativeImage;
  rtf?: string;
  text?: string;
}

export interface ClipboardAccess {
  availableFormats(): MaybePromise<string[]>;
  clear(): MaybePromise<void>;
  readBookmark(): MaybePromise<{ title: string; url: string }>;
  readBuffer(format: string): MaybePromise<Buffer>;
  readHTML(): MaybePromise<string>;
  readImage(): MaybePromise<NativeImage>;
  readRTF(): MaybePromise<string>;
  readText(): MaybePromise<string>;
  write(data: LegacyClipboardData): MaybePromise<void>;
  writeImage(image: NativeImage): MaybePromise<void>;
}

export type ClipboardEvidenceAccess = Omit<ClipboardAccess, 'writeImage'>;

const BOOKMARK_TYPE = 'electron application/bookmark';
const RAW_FORMAT_PREFIX = 'electron application/osclipboard;format="';

function rawType(format: string) {
  return `${RAW_FORMAT_PREFIX}${format}"`;
}

function visibleType(type: string) {
  return type.startsWith(RAW_FORMAT_PREFIX) && type.endsWith('"')
    ? type.slice(RAW_FORMAT_PREFIX.length, -1)
    : type;
}

async function readType(type: string) {
  const items = await clipboard.read();
  const item = items.find((candidate) => candidate.types.includes(type));
  return item ? item.getType(type) : null;
}

async function readBlob(type: string) {
  const value = await readType(type);
  return value instanceof globalThis.Blob ? value : null;
}

async function readTextType(type: string) {
  return (await readBlob(type))?.text() ?? '';
}

export function readElectronClipboardTextType(type: string) {
  return readTextType(type);
}

async function readImage() {
  const png = await readBlob('image/png');
  const jpeg = png ? null : await readBlob('image/jpeg');
  const blob = png ?? jpeg;
  return blob ? nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())) : nativeImage.createEmpty();
}

async function write(data: LegacyClipboardData) {
  const payload: Record<string, string | Electron.ClipboardBookmark | globalThis.Blob> = {};
  if (data.text) payload['text/plain'] = data.text;
  if (data.html) payload['text/html'] = data.html;
  if (data.rtf) payload['text/rtf'] = data.rtf;
  if (data.bookmark) payload[BOOKMARK_TYPE] = { title: data.bookmark, url: data.text ?? '' };
  if (data.image && !data.image.isEmpty()) {
    payload['image/png'] = new globalThis.Blob([Uint8Array.from(data.image.toPNG())], { type: 'image/png' });
  }
  if (Object.keys(payload).length > 0) await clipboard.write([new ClipboardItem(payload)]);
}

export const electronClipboardAccess: ClipboardAccess = {
  async availableFormats() {
    const items = await clipboard.read();
    return [...new Set(items.flatMap((item) => item.types.map(visibleType)))];
  },
  clear: () => clipboard.clear(),
  async readBookmark() {
    const value = await readType(BOOKMARK_TYPE);
    return value && !(value instanceof globalThis.Blob) ? value : { title: '', url: '' };
  },
  async readBuffer(format) {
    const value = await readBlob(rawType(format));
    return value ? Buffer.from(await value.arrayBuffer()) : Buffer.alloc(0);
  },
  readHTML: () => readTextType('text/html'),
  readImage,
  readRTF: () => readTextType('text/rtf'),
  readText: () => clipboard.readText(),
  write,
  async writeImage(image) {
    await write({ image });
  }
};
