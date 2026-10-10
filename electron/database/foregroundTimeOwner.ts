import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import { FOREGROUND_OWNER_SCHEMA, FOREGROUND_UUID_SQL } from '../../lib/core/database/foregroundTimeSource.js';
import { resolveAppPaths } from '../ipc/paths.js';

export function loadDesktopForegroundOwner(libraryPath: string) {
  const directory = resolveAppPaths().app_config_dir;
  mkdirSync(directory, { recursive: true });
  const db = new Database(path.join(directory, 'foreground-time-owners.db'));
  try {
    db.exec(FOREGROUND_OWNER_SCHEMA);
    db.prepare(`INSERT INTO foreground_time_owners(library_path, owner_id) VALUES (?, ${FOREGROUND_UUID_SQL})
      ON CONFLICT(library_path) DO NOTHING`).run(path.resolve(libraryPath));
    const row = db.prepare('SELECT owner_id FROM foreground_time_owners WHERE library_path = ?').get(path.resolve(libraryPath));
    return z.object({ owner_id: z.string().uuid() }).parse(row).owner_id;
  } finally { db.close(); }
}
