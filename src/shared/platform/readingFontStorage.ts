import type { ReadingFontRecord } from '../typography/readingFontFamily';

const DATABASE_NAME = 'foliole-companion-reading-fonts';
const STORE_NAME = 'fonts';

function openFontDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readFontRecords(): Promise<ReadingFontRecord[]> {
  const database = await openFontDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function writeFontRecords(
  records: ReadingFontRecord[], expected: Map<string, string | null>, removed: string[] = []
): Promise<void> {
  const database = await openFontDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const current = request.result as ReadingFontRecord[];
        for (const [id, version] of expected) {
          const found = current.find(record => record.id === id);
          if ((found ? found.version ?? 'legacy' : null) !== version) { transaction.abort(); return; }
        }
        for (const record of records) {
          if (record.familyKey && current.some(other => other.id !== record.id && other.familyKey === record.familyKey)) {
            transaction.abort(); return;
          }
          store.put(record);
        }
        for (const id of removed) store.delete(id);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save fonts'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Fonts changed. Please try again.'));
    });
  } finally { database.close(); }
}
