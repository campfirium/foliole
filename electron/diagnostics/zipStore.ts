import { createReadStream, promises as fs } from 'node:fs';
import { crc32 } from 'node:zlib';

interface ZipEntry {
  content: Buffer;
  name: string;
}

function writeEntryHeaders(entry: { checksum: number; name: string; size: number }, localOffset: number) {
  const name = Buffer.from(entry.name, 'utf8');
  const checksum = entry.checksum;
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(entry.size, 18);
  localHeader.writeUInt32LE(entry.size, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt32LE(0, 12);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(entry.size, 20);
  centralHeader.writeUInt32LE(entry.size, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(localOffset, 42);

  return { centralHeader, localHeader, name };
}

export async function writeStoredZip(filePath: string, entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const { centralHeader, localHeader, name } = writeEntryHeaders({
      checksum: crc32(entry.content), name: entry.name, size: entry.content.length
    }, localOffset);
    localParts.push(localHeader, name, entry.content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + entry.content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  await fs.writeFile(filePath, Buffer.concat([...localParts, centralDirectory, endRecord]));
}

export async function writeStoredZipFromFile(args: {
  bodyFilePath: string;
  bodyName: string;
  filePath: string;
  manifest: Buffer;
}) {
  const manifest = { checksum: crc32(args.manifest), name: 'manifest.json',
    size: args.manifest.length };
  const body = { ...(await inspectStoredFile(args.bodyFilePath)), name: args.bodyName };
  const entries = [manifest, body];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const output = await fs.open(args.filePath, 'w');
  try {
    for (const entry of entries) {
      const headers = writeEntryHeaders(entry, offset);
      await writeAll(output, headers.localHeader);
      await writeAll(output, headers.name);
      if (entry === manifest) await writeAll(output, args.manifest);
      else await copyStoredFile(output, args.bodyFilePath, body);
      centralParts.push(headers.centralHeader, headers.name);
      offset += headers.localHeader.length + headers.name.length + entry.size;
      if (offset > 0xffffffff) throw new Error('sync_pack_zip32_limit');
    }
    const directory = Buffer.concat(centralParts);
    await writeAll(output, directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    await writeAll(output, end);
  } catch (error) {
    await output.close();
    await fs.rm(args.filePath, { force: true });
    throw error;
  }
  await output.close();
}

async function inspectStoredFile(filePath: string) {
  let checksum = 0;
  let size = 0;
  for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
    checksum = crc32(chunk as Buffer, checksum);
    size += (chunk as Buffer).length;
    if (size > 0xffffffff) throw new Error('sync_pack_zip32_limit');
  }
  return { checksum, size };
}

async function copyStoredFile(
  output: Awaited<ReturnType<typeof fs.open>>,
  filePath: string,
  expected: { checksum: number; size: number }
) {
  let checksum = 0;
  let size = 0;
  for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
    const bytes = chunk as Buffer;
    checksum = crc32(bytes, checksum);
    size += bytes.length;
    await writeAll(output, bytes);
  }
  if (size !== expected.size || checksum !== expected.checksum) {
    throw new Error('sync_pack_zip_source_changed');
  }
}

async function writeAll(output: Awaited<ReturnType<typeof fs.open>>, buffer: Buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const result = await output.write(buffer, offset, buffer.length - offset);
    if (result.bytesWritten === 0) throw new Error('sync_pack_zip_write_failed');
    offset += result.bytesWritten;
  }
}
