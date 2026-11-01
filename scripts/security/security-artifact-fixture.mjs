import { Buffer } from 'node:buffer';
import { crc32 } from 'node:zlib';

// Small stored ZIP fixture; production reads real GitHub ZIPs with the host utility.
export function securityArtifactFixture(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(header, filename, data);
    central.push(directory, filename);
    offset += header.length + filename.length + data.length;
  }
  const ending = Buffer.alloc(22);
  ending.writeUInt32LE(0x06054b50, 0); ending.writeUInt16LE(central.length / 2, 8);
  ending.writeUInt16LE(central.length / 2, 10);
  ending.writeUInt32LE(Buffer.concat(central).length, 12); ending.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, ending]);
}
