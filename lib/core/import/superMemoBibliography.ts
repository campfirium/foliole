import { readSuperMemoRegistryText } from './superMemoRegistryText.js';

export interface SuperMemoBibliography {
  title?: string;
  date?: string;
  url?: string;
  publisher?: string;
  comment?: string;
}

const fields = [['title', 1], ['date', 2], ['url', 3], ['publisher', 4], ['comment', 7]] as const;

export function readSuperMemoBibliography(ids: ReadonlySet<number>, references: DataView, members: DataView, text: DataView) {
  const bibliography = new Map<number, SuperMemoBibliography>();
  if (references.byteLength % 32 || members.byteLength % 30) throw new Error('invalid_supermemo_bibliography');
  for (const id of ids) {
    if (id < 1 || id > references.byteLength / 32) continue;
    const entry: SuperMemoBibliography = {};
    for (const [key, index] of fields) {
      const value = readSuperMemoRegistryText(members, text, references.getUint32((id - 1) * 32 + index * 4, true));
      if (value) entry[key] = value;
    }
    if (Object.keys(entry).length) bibliography.set(id, entry);
  }
  return bibliography;
}
