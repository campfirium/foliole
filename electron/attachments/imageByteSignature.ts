const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF_89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function hasBytesPrefix(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function hasWebpSignature(bytes: Uint8Array) {
  return bytes.length >= 12 &&
    hasBytesPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
}

export function hasSupportedImageSignature(bytes: Uint8Array, mimeType: string) {
  switch (mimeType) {
    case 'image/gif':
      return hasBytesPrefix(bytes, GIF_87A_SIGNATURE) || hasBytesPrefix(bytes, GIF_89A_SIGNATURE);
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return hasBytesPrefix(bytes, PNG_SIGNATURE);
    case 'image/webp':
      return hasWebpSignature(bytes);
    default:
      return false;
  }
}
