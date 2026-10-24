import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

// Device-local shell context, separate from synchronized active-node and reading facts.
function resumeKey(libraryScope: string) {
  return `navigation_resume:${JSON.stringify(libraryScope)}`;
}

export async function loadCompanionNavigationResume(libraryScope: string): Promise<string | null> {
  if (!isAvailableNativeCompanionRuntime()) return null;
  return readIosCompanionDatabase(async (db) => {
    const rows = await db.query<{ value: string }>(
      'SELECT value FROM companion_meta WHERE key = ?', [resumeKey(libraryScope)]
    );
    return rows[0]?.value ?? null;
  });
}

export async function saveCompanionNavigationResume(libraryScope: string, value: string) {
  if (!isAvailableNativeCompanionRuntime()) return;
  await writeIosCompanionDatabase(async (db) => {
    await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
      [resumeKey(libraryScope), value, new Date().toISOString()]);
  });
}
