export interface SuperMemoBibliography {
  title?: string;
  date?: string;
  url?: string;
  publisher?: string;
  comment?: string;
}

const fields = [['title', 1], ['date', 2], ['url', 3], ['publisher', 4], ['comment', 7]] as const;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const legacy = new TextDecoder('windows-1252');

function readText(members: DataView, text: DataView, id: number) {
  const offset = (id - 1) * 30;
  if (id === 0 || offset + 30 > members.byteLength) return '';
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

export function readSuperMemoBibliography(ids: ReadonlySet<number>, references: DataView, members: DataView, text: DataView) {
  const bibliography = new Map<number, SuperMemoBibliography>();
  if (references.byteLength % 32 || members.byteLength % 30) throw new Error('invalid_supermemo_bibliography');
  for (const id of ids) {
    if (id < 1 || id > references.byteLength / 32) continue;
    const entry: SuperMemoBibliography = {};
    for (const [key, index] of fields) {
      const value = readText(members, text, references.getUint32((id - 1) * 32 + index * 4, true));
      if (value) entry[key] = value;
    }
    if (Object.keys(entry).length) bibliography.set(id, entry);
  }
  return bibliography;
}
