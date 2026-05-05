import { inflateRawSync } from 'node:zlib';

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_END_OF_CENTRAL_DIRECTORY_SCAN = 65_557;

function decodeEntryName(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes).replace(/\\/g, '/').replace(/^\.\//, '');
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumOffset = Math.max(0, buffer.length - MAX_END_OF_CENTRAL_DIRECTORY_SCAN);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('EPUB import failed: invalid ZIP central directory');
}

function extractStoredEntry(buffer: Buffer, offset: number, compressedSize: number) {
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  return buffer.subarray(dataStart, dataStart + compressedSize);
}

function extractEntryBytes(buffer: Buffer, offset: number, compressedSize: number, compressionMethod: number) {
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('EPUB import failed: invalid ZIP local file header');
  }
  const storedBytes = extractStoredEntry(buffer, offset, compressedSize);
  if (compressionMethod === 0) {
    return storedBytes;
  }
  if (compressionMethod === 8) {
    return inflateRawSync(storedBytes);
  }
  throw new Error(`EPUB import failed: unsupported ZIP compression method ${compressionMethod}`);
}

export function readEpubArchiveEntries(input: Uint8Array) {
  const buffer = Buffer.from(input);
  const endOfCentralDirectory = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOfCentralDirectory + 10);
  let offset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  const entries = new Map<string, Uint8Array>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('EPUB import failed: invalid ZIP central directory entry');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const entryName = decodeEntryName(buffer.subarray(nameStart, nameStart + nameLength));

    offset = nameStart + nameLength + extraLength + commentLength;
    if (!entryName || entryName.endsWith('/')) {
      continue;
    }
    entries.set(entryName, extractEntryBytes(buffer, localHeaderOffset, compressedSize, compressionMethod));
  }

  return entries;
}
