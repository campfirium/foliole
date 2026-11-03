import { fontVariants, readingFontCssFamily, type ReadingFontRecord } from './readingFontFamily';

const active = new Map<string, { version: string; faces: FontFace[] }>();
const generations = new Map<string, number>();

export async function loadFontFaces(record: ReadingFontRecord) {
  return Promise.all(fontVariants(record).map(async variant => {
    const weight = variant.weightMin === variant.weightMax ? String(variant.weightMin)
      : `${variant.weightMin} ${variant.weightMax}`;
    const face = new FontFace(readingFontCssFamily(record.id), variant.data,
      { weight, style: variant.style, stretch: variant.stretch });
    await face.load();
    return face;
  }));
}

export function releaseFontFaces(id: string) {
  generations.set(id, (generations.get(id) ?? 0) + 1);
  for (const face of active.get(id)?.faces ?? []) document.fonts.delete(face);
  active.delete(id);
}

export function installFontFaces(record: ReadingFontRecord, faces: FontFace[]) {
  releaseFontFaces(record.id);
  for (const face of faces) document.fonts.add(face);
  active.set(record.id, { version: record.version ?? 'legacy', faces });
}

export async function activateFontRecord(record: ReadingFontRecord) {
  if (active.get(record.id)?.version === (record.version ?? 'legacy')) return;
  const generation = generations.get(record.id) ?? 0;
  const faces = await loadFontFaces(record);
  if ((generations.get(record.id) ?? 0) !== generation) throw new Error('Font activation was superseded');
  installFontFaces(record, faces);
}
