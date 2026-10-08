import { isWorkspaceSettingObject, OVERWRITE_SOURCE_SETTING_KEYS, WORKSPACE_SETTING_KEYS } from '../database/settingDataPolicy.js';

import type { DbPort } from './dbPort.js';

/** A library overwrite replaces shared settings and local source settings, keeping ordinary device preferences. */
export async function clearRestoreWorkspaceSettings(db: DbPort, tables: ReadonlySet<string>) {
  const keys = [...WORKSPACE_SETTING_KEYS, ...OVERWRITE_SOURCE_SETTING_KEYS];
  const placeholders = keys.map(() => '?').join(', ');
  const sourcePlaceholders = OVERWRITE_SOURCE_SETTING_KEYS.map(() => '?').join(', ');
  if (tables.has('settings')) {
    await db.run(`DELETE FROM main.settings WHERE key IN (${placeholders})`, keys);
  }
  if (tables.has('setting_records')) {
    await db.run(`DELETE FROM main.setting_records WHERE (scope = 'user_space'
      AND key IN (${WORKSPACE_SETTING_KEYS.map(() => '?').join(', ')}))
      OR key IN (${sourcePlaceholders})`, keys);
  }
  for (const table of ['sync_objects', 'sync_object_state']) {
    if (!tables.has(table)) continue;
    const rows = await db.query<{ object_id: string }>(
      `SELECT object_id FROM main.${table} WHERE object_type = 'setting'`);
    for (const { object_id: id } of rows) {
      if (isWorkspaceSettingObject(id) || OVERWRITE_SOURCE_SETTING_KEYS.some((key) => id.endsWith(`:${key}`))) {
        await db.run(`DELETE FROM main.${table} WHERE object_type = 'setting' AND object_id = ?`, [id]);
      }
    }
  }
}
