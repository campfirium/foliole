import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

// Local navigation context only: never emitted as a sync object or a review fact.
function resumeKey(libraryScope: string, onlyReview: boolean) {
  return `flow_resume:${JSON.stringify([libraryScope, onlyReview])}`;
}

export async function loadCompanionFlowResume(libraryScope: string, onlyReview: boolean): Promise<string | null> {
  if (!isAvailableNativeCompanionRuntime()) return null;
  return readIosCompanionDatabase(async (db) => {
    const rows = await db.query<{ value: string }>(
      'SELECT value FROM companion_meta WHERE key = ?', [resumeKey(libraryScope, onlyReview)]
    );
    return rows[0]?.value || null;
  });
}

export async function saveCompanionFlowResume(libraryScope: string, onlyReview: boolean, nodeId: string | null) {
  if (!isAvailableNativeCompanionRuntime()) return;
  await writeIosCompanionDatabase(async (db) => {
    await db.run('INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
      [resumeKey(libraryScope, onlyReview), nodeId ?? '', new Date().toISOString()]);
  });
}
