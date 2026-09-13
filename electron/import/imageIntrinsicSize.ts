export interface ImageIntrinsicSize {
  height: number;
  width: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasPngSignature(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUint16(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! << 8) + bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function readUint16Le(bytes: Uint8Array, offset: number) {
  return bytes[offset]! + (bytes[offset + 1]! << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number) {
  return bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16);
}

function readPngSize(bytes: Uint8Array): ImageIntrinsicSize | null {
  if (bytes.length < 24 || !hasPngSignature(bytes)) {
    return null;
  }
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  return width > 0 && height > 0 ? { height, width } : null;
}

function isJpegStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegSize(bytes: Uint8Array): ImageIntrinsicSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 8 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    const length = readUint16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) {
      return null;
    }
    if (isJpegStartOfFrame(marker) && length >= 7) {
      const height = readUint16(bytes, offset + 3);
      const width = readUint16(bytes, offset + 5);
      return width > 0 && height > 0 ? { height, width } : null;
    }
    offset += length;
  }
  return null;
}

function readGifSize(bytes: Uint8Array): ImageIntrinsicSize | null {
  if (bytes.length < 10) return null;
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  const width = readUint16Le(bytes, 6);
  const height = readUint16Le(bytes, 8);
  return width > 0 && height > 0 ? { height, width } : null;
}

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  return Array.from(value).every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function readWebpSize(bytes: Uint8Array): ImageIntrinsicSize | null {
  if (bytes.length < 20 || !hasAscii(bytes, 0, 'RIFF') || !hasAscii(bytes, 8, 'WEBP')) return null;
  if (hasAscii(bytes, 12, 'VP8X') && bytes.length >= 30) {
    return { height: readUint24Le(bytes, 27) + 1, width: readUint24Le(bytes, 24) + 1 };
  }
  if (hasAscii(bytes, 12, 'VP8L') && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
    const height = 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10);
    return { height, width };
  }
  if (hasAscii(bytes, 12, 'VP8 ') && bytes.length >= 30 && hasAscii(bytes, 23, String.fromCharCode(0x9d, 0x01, 0x2a))) {
    const width = readUint16Le(bytes, 26) & 0x3fff;
    const height = readUint16Le(bytes, 28) & 0x3fff;
    return width > 0 && height > 0 ? { height, width } : null;
  }
  return null;
}

export function readImageIntrinsicSize(bytes: Uint8Array): ImageIntrinsicSize | null {
  return readPngSize(bytes) ?? readJpegSize(bytes) ?? readGifSize(bytes) ?? readWebpSize(bytes);
}
