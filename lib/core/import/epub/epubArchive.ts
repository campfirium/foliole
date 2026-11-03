export interface EpubZipEntry {
  dataOffset: number;
  compressedSize: number;
  size: number;
  crc: number;
  method: number;
}

export interface EpubArchiveReader { size: number; read(offset: number, length: number): Promise<Uint8Array> }
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u16 = (bytes: Uint8Array, offset: number) => view(bytes).getUint16(offset, true);
const u32 = (bytes: Uint8Array, offset: number) => view(bytes).getUint32(offset, true);
const u64 = (bytes: Uint8Array, offset: number) => view(bytes).getBigUint64(offset, true);
async function readAt(file: EpubArchiveReader, offset: number, length: number, end: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > end) {
    throw new Error('EPUB import failed: invalid ZIP byte range');
  }
  const bytes = await file.read(offset, length);
  if (bytes.length !== length) throw new Error('EPUB import failed: truncated ZIP entry');
  return bytes;
}

function readSafe64(bytes: Uint8Array, offset: number) {
  const value = u64(bytes, offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('EPUB import failed: invalid ZIP64 size');
  return Number(value);
}

async function readDirectory(file: EpubArchiveReader, size: number) {
  const start = Math.max(0, size - 65_557);
  const tail = await readAt(file, start, size - start, size);
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (u32(tail, i) !== 0x06054b50 || i + 22 + u16(tail, i + 20) !== tail.length) continue;
    if (u16(tail, i + 4) || u16(tail, i + 6)) {
      throw new Error('EPUB import failed: multi-disk ZIP is unsupported');
    }
    let count = u16(tail, i + 10);
    let offset = u32(tail, i + 16);
    let length = u32(tail, i + 12);
    if (count === 0xffff || offset === 0xffffffff || length === 0xffffffff) {
      const locator = await readAt(file, start + i - 20, 20, size);
      if (u32(locator, 0) !== 0x07064b50) throw new Error('EPUB import failed: invalid ZIP64 locator');
      const record = await readAt(file, readSafe64(locator, 8), 56, size);
      if (u32(record, 0) !== 0x06064b50 || u32(record, 16) || u32(record, 20)) {
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

function readEntrySizes(header: Uint8Array, extra: Uint8Array) {
  let size = u32(header, 24);
  let compressedSize = u32(header, 20);
  let localOffset = u32(header, 42);
  if ([size, compressedSize, localOffset].includes(0xffffffff)) {
    let found = false;
    for (let offset = 0; offset + 4 <= extra.length;) {
      const tag = u16(extra, offset);
      const length = u16(extra, offset + 2);
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

async function readEntry(file: EpubArchiveReader, offset: number, end: number, dataEnd: number) {
  const header = await readAt(file, offset, 46, end);
  if (u32(header, 0) !== 0x02014b50) throw new Error('EPUB import failed: invalid ZIP directory entry');
  const nameLength = u16(header, 28);
  const extraLength = u16(header, 30);
  const commentLength = u16(header, 32);
  const variable = await readAt(file, offset + 46, nameLength + extraLength + commentLength, end);
  const name = new TextDecoder().decode(variable.subarray(0, nameLength)).replace(/\\/g, '/').replace(/^\.\//, '');
  const { size, compressedSize, localOffset } = readEntrySizes(header, variable.subarray(nameLength, nameLength + extraLength));
  const local = await readAt(file, localOffset, 30, dataEnd);
  const method = u16(header, 10);
  if (u32(local, 0) !== 0x04034b50 || u16(local, 8) !== method
    || (u16(header, 8) & 1) || (u16(local, 6) & 1)) {
    throw new Error('EPUB import failed: invalid or encrypted ZIP local header');
  }
  const dataOffset = localOffset + 30 + u16(local, 26) + u16(local, 28);
  if (dataOffset + compressedSize > dataEnd) throw new Error('EPUB import failed: invalid ZIP payload range');
  return { name, next: offset + 46 + variable.length, entry: {
    dataOffset, compressedSize, size, method, crc: u32(header, 16)
  } };
}

export async function readEpubArchiveIndex(file: EpubArchiveReader) {
  const directory = await readDirectory(file, file.size);
  const entries = new Map<string, EpubZipEntry>();
  let offset = directory.offset;
  for (let index = 0; index < directory.count; index++) {
    const result = await readEntry(file, offset, directory.end, directory.offset);
    offset = result.next;
    if (result.name && !result.name.endsWith('/')) entries.set(result.name, result.entry);
  }
  return entries;
}
