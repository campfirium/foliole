import { readFontRecords, writeFontRecords } from '../platform/companion/reading/readingFontStorage';
import { createCompanionUuid } from '../platform/companionUuid';

import { fontFamily, fontVariants, type ReadingFontRecord, type ReadingFontVariant } from './readingFontFamily';
import { appendFontVariant, parseReadingFont } from './readingFontMetadata';
import { activateFontRecord, installFontFaces, loadFontFaces, releaseFontFaces } from './readingFontRuntime';

export interface ReadingFontImport {
  records: ReadingFontRecord[];
  expected: Map<string, string | null>;
}

function readFile(file: File): Promise<ArrayBuffer> {
  if (!/\.(ttf|otf)$/i.test(file.name) || !file.size || file.size > 20 * 1024 * 1024) {
    return Promise.reject(new Error('Choose a TTF or OTF file under 20 MB'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result) : reject(new Error('Could not read font'));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function withVariants(record: ReadingFontRecord, variants: ReadingFontVariant[]): ReadingFontRecord {
  const [first, ...rest] = variants;
  if (!first) throw new Error('A font family needs a font file');
  const { data, ...face } = first;
  return { ...record, data, face, variants: rest, version: createCompanionUuid() };
}

export async function prepareReadingFonts(files: File[], targetId?: string): Promise<ReadingFontImport> {
  if (!files.length) throw new Error('Choose font files');
  const existing = await readFontRecords();
  const records = new Map<string, ReadingFontRecord>();
  const expected = new Map<string, string | null>();
  const target = existing.find(record => record.id === targetId);
  if (targetId && !target) throw new Error('Font family no longer exists');
  if (target) {
    const parsed = await parseReadingFont(target.data);
    const updated = target.face ? target : withVariants(target, [parsed.variant]);
    records.set(parsed.familyKey, { ...updated, familyKey: parsed.familyKey });
    expected.set(target.id, target.version ?? 'legacy');
  }
  for (const file of files) {
    const parsed = await parseReadingFont(await readFile(file));
    if (target && !records.has(parsed.familyKey)) throw new Error('Choose files from the same font family');
    const stored = existing.find(record => record.familyKey === parsed.familyKey);
    const record = records.get(parsed.familyKey) ?? stored ?? {
      id: createCompanionUuid(), name: parsed.name, data: parsed.variant.data, familyKey: parsed.familyKey
    };
    if (!expected.has(record.id)) expected.set(record.id, stored ? stored.version ?? 'legacy' : null);
    const variants = record.face || record.variants ? fontVariants(record) : [];
    appendFontVariant(variants, parsed.variant);
    records.set(parsed.familyKey, withVariants(record, variants));
  }
  return { records: [...records.values()], expected };
}

export async function commitReadingFonts(prepared: ReadingFontImport) {
  const faces = await Promise.all(prepared.records.map(loadFontFaces));
  await writeFontRecords(prepared.records, prepared.expected);
  prepared.records.forEach((record, index) => installFontFaces(record, faces[index]!));
  return prepared.records.map(fontFamily);
}

export async function listReadingFonts() {
  return (await readFontRecords()).map(fontFamily);
}

export async function activateReadingFont(id: string): Promise<boolean> {
  const record = (await readFontRecords()).find(font => font.id === id);
  if (!record) return false;
  await activateFontRecord(record);
  return true;
}

export async function removeReadingFont(id: string, faceId?: string): Promise<void> {
  const record = (await readFontRecords()).find(font => font.id === id);
  if (!record) return;
  const expected = new Map([[id, record.version ?? 'legacy']]);
  const variants = faceId ? fontVariants(record).filter(face => face.id !== faceId) : [];
  if (variants.length) {
    const next = withVariants(record, variants);
    const faces = await loadFontFaces(next);
    await writeFontRecords([next], expected);
    installFontFaces(next, faces);
  } else {
    await writeFontRecords([], expected, [id]);
    releaseFontFaces(id);
  }
}
