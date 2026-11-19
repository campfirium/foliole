const utf8 = new TextDecoder('utf-8', { fatal: true });
const legacy = new TextDecoder('windows-1252');

export function readSuperMemoRegistryText(members: DataView, text: DataView, id: number) {
  const offset = (id - 1) * 30;
  if (id < 1 || offset + 30 > members.byteLength) return '';
  const start = members.getUint32(offset + 10, true) - 1;
  const size = members.getUint32(offset + 14, true) - 6;
  if (start < 0 || size <= 0 || start + size > text.byteLength) return '';
  const bytes = new Uint8Array(text.buffer, text.byteOffset + start, size);
  try {
    return utf8.decode(bytes).trim();
  } catch {
    return legacy.decode(bytes).trim();
  }
}
