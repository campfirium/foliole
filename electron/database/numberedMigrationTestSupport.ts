import { applyNumberedSchemaMigrations } from '../../lib/core/database/numberedMigrations.js';

import type { SqliteDatabase } from './connection.js';

export function migrateNumberedFixtureTo(sqlite: SqliteDatabase, targetVersion: number) {
  const currentVersion = sqlite.pragma('user_version', { simple: true }) as number;
  sqlite.transaction(() => {
    applyNumberedSchemaMigrations({
      currentVersion,
      legacyMessage: 'numbered migration fixture is older than the supported baseline',
      setUserVersion: (version) => sqlite.pragma(`user_version = ${version}`),
      sqlite,
      targetVersion
    });
  })();
}
