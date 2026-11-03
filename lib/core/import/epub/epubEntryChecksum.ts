const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function epubCrc32(bytes: Uint8Array, previous = 0) {
  let crc = previous ^ 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
