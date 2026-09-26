import { createCompanionUuid } from '@/shared/platform/companionUuid';

export interface CompanionReadingFont {
  id: string;
  name: string;
}

interface StoredReadingFont extends CompanionReadingFont {
  data: ArrayBuffer;
}

const DATABASE_NAME = 'foliole-companion-reading-fonts';
const STORE_NAME = 'fonts';
const MAX_FONT_BYTES = 20 * 1024 * 1024;
const activeFontIds = new Set<string>();

function openFontDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fontRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openFontDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      let value: T;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function readingFontCssFamily(id: string) {
  return `FolioleReadingFont_${id.replace(/-/g, '_')}`;
}

function readFontFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('Font file could not be read'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function listReadingFonts(): Promise<CompanionReadingFont[]> {
  const fonts = await fontRequest<StoredReadingFont[]>('readonly', (store) => store.getAll());
  return fonts.map(({ id, name }) => ({ id, name }));
}

export async function activateReadingFont(id: string): Promise<boolean> {
  const record = await fontRequest<StoredReadingFont | undefined>('readonly', (store) => store.get(id));
  if (!record) return false;
  const family = readingFontCssFamily(id);
  if (activeFontIds.has(id)) return true;
  const face = new FontFace(family, record.data);
  await face.load();
  document.fonts.add(face);
  activeFontIds.add(id);
  return true;
}

export async function importReadingFont(file: File): Promise<CompanionReadingFont> {
  if (!/\.(ttf|otf)$/i.test(file.name) || file.size === 0 || file.size > MAX_FONT_BYTES) {
    throw new Error('Unsupported font file');
  }
  const record: StoredReadingFont = {
    id: createCompanionUuid(),
    name: file.name.replace(/\.(ttf|otf)$/i, ''),
    data: await readFontFile(file)
  };
  const face = new FontFace(readingFontCssFamily(record.id), record.data);
  await face.load();
  await fontRequest('readwrite', (store) => store.put(record));
  document.fonts.add(face);
  activeFontIds.add(record.id);
  return { id: record.id, name: record.name };
}

export async function removeReadingFont(id: string): Promise<void> {
  await fontRequest('readwrite', (store) => store.delete(id));
  activeFontIds.delete(id);
}
