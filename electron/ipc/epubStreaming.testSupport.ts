import { open } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

import { createTestZip } from './testZipBuilder.js';

export function bookZip(chapter: string, extras: Array<{ name: string; content: string | Uint8Array; compression?: 'store' | 'deflate' }> = []) {
  return createTestZip([
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>' },
    { name: 'OPS/book.opf', content: '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Large Book</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>' },
    { name: 'OPS/chapter.xhtml', content: chapter, compression: 'deflate' }, ...extras
  ]);
}

export function forgeEntrySize(zip: Buffer, name: string, size: number) {
  let offset = zip.readUInt32LE(zip.length - 6);
  while (offset < zip.length - 22) {
    const nameLength = zip.readUInt16LE(offset + 28);
    if (zip.subarray(offset + 46, offset + 46 + nameLength).toString() === name) {
      zip.writeUInt32LE(size, offset + 24);
      zip.writeUInt32LE(size, zip.readUInt32LE(offset + 42) + 22);
      return;
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  throw new Error('Missing fixture entry');
}

export async function createLargeStoredImageBook(filePath: string) {
  const names = Array.from({ length: 4 }, (_, i) => `image-${i}.png`);
  const zip = bookZip(`<html><body><h1>Large chapter</h1><p>All images survive.</p>${names.map((name) => `<img src="${name}"/>`).join('')}</body></html>`);
  const directoryOffset = zip.readUInt32LE(zip.length - 6);
  const directory = zip.subarray(directoryOffset, zip.length - 22);
  const imagePrefix = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII=', 'base64');
  const chunk = Buffer.alloc(1024 * 1024);
  const imageSize = imagePrefix.length + 68 * chunk.length;
  let crc = crc32(imagePrefix);
  for (let i = 0; i < 68; i += 1) crc = crc32(chunk, crc);
  const file = await open(filePath, 'wx');
  const records: Buffer[] = [];
  let offset = directoryOffset;
  try {
    await file.writeFile(zip.subarray(0, directoryOffset));
    for (const name of names) {
      const bytes = Buffer.from(`OPS/${name}`);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(imageSize, 18);
      local.writeUInt32LE(imageSize, 22);
      local.writeUInt16LE(bytes.length, 26);
      await file.writeFile(Buffer.concat([local, bytes, imagePrefix]));
      for (let i = 0; i < 68; i += 1) await file.writeFile(chunk);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(imageSize, 20);
      central.writeUInt32LE(imageSize, 24);
      central.writeUInt16LE(bytes.length, 28);
      central.writeUInt32LE(offset, 42);
      records.push(central, bytes);
      offset += local.length + bytes.length + imageSize;
    }
    const combined = Buffer.concat([directory, ...records]);
    const end = Buffer.from(zip.subarray(zip.length - 22));
    end.writeUInt16LE(8, 8);
    end.writeUInt16LE(8, 10);
    end.writeUInt32LE(combined.length, 12);
    end.writeUInt32LE(offset, 16);
    await file.writeFile(combined);
    await file.writeFile(end);
  } finally { await file.close(); }
  return { imageSize, crc };
}
