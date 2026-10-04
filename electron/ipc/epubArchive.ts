import { open, type FileHandle } from 'node:fs/promises';

export interface EpubZipEntry {
  dataOffset: number;
  compressedSize: number;
  size: number;
  crc: number;
  method: number;
}

async function readAt(file: FileHandle, offset: number, length: number, end: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > end) {
    throw new Error('EPUB import failed: invalid ZIP byte range');
  }
  const bytes = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const result = await file.read(bytes, done, length - done, offset + done);
    if (!result.bytesRead) throw new Error('EPUB import failed: truncated ZIP entry');
    done += result.bytesRead;
  }
  return bytes;
}

function readSafe64(bytes: Buffer, offset: number) {
  const value = bytes.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('EPUB import failed: invalid ZIP64 size');
  return Number(value);
}

async function readDirectory(file: FileHandle, size: number) {
  const start = Math.max(0, size - 65_557);
  const tail = await readAt(file, start, size - start, size);
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) !== 0x06054b50 || i + 22 + tail.readUInt16LE(i + 20) !== tail.length) continue;
    if (tail.readUInt16LE(i + 4) || tail.readUInt16LE(i + 6)) {
      throw new Error('EPUB import failed: multi-disk ZIP is unsupported');
    }
    let count = tail.readUInt16LE(i + 10);
    let offset = tail.readUInt32LE(i + 16);
    let length = tail.readUInt32LE(i + 12);
    if (count === 0xffff || offset === 0xffffffff || length === 0xffffffff) {
      const locator = await readAt(file, start + i - 20, 20, size);
      if (locator.readUInt32LE(0) !== 0x07064b50) throw new Error('EPUB import failed: invalid ZIP64 locator');
      const record = await readAt(file, readSafe64(locator, 8), 56, size);
      if (record.readUInt32LE(0) !== 0x06064b50 || record.readUInt32LE(16) || record.readUInt32LE(20)) {
        throw new Error('EPUB import failed: invalid ZIP64 directory');
      }
      count = readSafe64(record, 32);
      length = readSafe64(record, 40);
      offset = readSafe64(record, 48);
    }
    if (offset + length > start + i || count > Math.floor(length / 46)) {
      throw new Error('EPUB import failed: invalid ZIP central directory');
    }
    return { count, offset, end: offset + length };
  }
  throw new Error('EPUB import failed: invalid ZIP central directory');
}

function readEntrySizes(header: Buffer, extra: Buffer) {
  let size = header.readUInt32LE(24);
  let compressedSize = header.readUInt32LE(20);
  let localOffset = header.readUInt32LE(42);
  if ([size, compressedSize, localOffset].includes(0xffffffff)) {
    let found = false;
    for (let offset = 0; offset + 4 <= extra.length;) {
      const tag = extra.readUInt16LE(offset);
      const length = extra.readUInt16LE(offset + 2);
      const end = offset + 4 + length;
      if (end > extra.length) throw new Error('EPUB import failed: invalid ZIP extra data');
      if (tag === 1) {
        let cursor = offset + 4;
        const next = () => {
          if (cursor + 8 > end) throw new Error('EPUB import failed: invalid ZIP64 entry');
          const value = readSafe64(extra, cursor);
          cursor += 8;
          return value;
        };
        if (size === 0xffffffff) size = next();
        if (compressedSize === 0xffffffff) compressedSize = next();
        if (localOffset === 0xffffffff) localOffset = next();
        found = true;
        break;
      }
      offset = end;
    }
    if (!found) throw new Error('EPUB import failed: missing ZIP64 entry sizes');
  }
  return { size, compressedSize, localOffset };
}

async function readEntry(file: FileHandle, offset: number, end: number, dataEnd: number) {
  const header = await readAt(file, offset, 46, end);
  if (header.readUInt32LE(0) !== 0x02014b50) throw new Error('EPUB import failed: invalid ZIP directory entry');
  const nameLength = header.readUInt16LE(28);
  const extraLength = header.readUInt16LE(30);
  const commentLength = header.readUInt16LE(32);
  const variable = await readAt(file, offset + 46, nameLength + extraLength + commentLength, end);
  const name = variable.subarray(0, nameLength).toString('utf8').replace(/\\/g, '/').replace(/^\.\//, '');
  const { size, compressedSize, localOffset } = readEntrySizes(header, variable.subarray(nameLength, nameLength + extraLength));
  const local = await readAt(file, localOffset, 30, dataEnd);
  const method = header.readUInt16LE(10);
  if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(8) !== method
    || (header.readUInt16LE(8) & 1) || (local.readUInt16LE(6) & 1)) {
    throw new Error('EPUB import failed: invalid or encrypted ZIP local header');
  }
  const dataOffset = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (dataOffset + compressedSize > dataEnd) throw new Error('EPUB import failed: invalid ZIP payload range');
  return { name, next: offset + 46 + variable.length, entry: {
    dataOffset, compressedSize, size, method, crc: header.readUInt32LE(16)
  } };
}

export async function readEpubArchiveIndex(filePath: string) {
  const file = await open(filePath, 'r');
  try {
    const directory = await readDirectory(file, (await file.stat()).size);
    const entries = new Map<string, EpubZipEntry>();
    let offset = directory.offset;
    for (let index = 0; index < directory.count; index += 1) {
      const result = await readEntry(file, offset, directory.end, directory.offset);
      offset = result.next;
      if (result.name && !result.name.endsWith('/')) entries.set(result.name, result.entry);
    }
    return entries;
  } finally {
    await file.close();
  }
}
