import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

// Local navigation context only: never emitted as a sync object or a review fact.
function resumeKey(libraryScope: string) {
  return `flow_resume:${JSON.stringify([libraryScope, false])}`;
}

export async function loadCompanionFlowResume(libraryScope: string): Promise<string | null> {
  if (!isAvailableNativeCompanionRuntime()) return null;
  return readIosCompanionDatabase(async (db) => {
    const rows = await db.query<{ value: string }>(
      'SELECT value FROM companion_meta WHERE key = ?', [resumeKey(libraryScope)]
    );
    return rows[0]?.value || null;
  });
}

export async function saveCompanionFlowResume(libraryScope: string, nodeId: string | null) {
  if (!isAvailableNativeCompanionRuntime()) return;
  await writeIosCompanionDatabase(async (db) => {
    await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
      [resumeKey(libraryScope), nodeId ?? '', new Date().toISOString()]);
  });
}
