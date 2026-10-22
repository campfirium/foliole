import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { readUserVersion } from '../../lib/core/database/databaseUserVersion.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { loadDesktopLibraryWriterBinding } from '../deviceAnchorStore.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { DatabaseUpgradeWorkerInput, DatabaseUpgradeWorkerMessage } from './databaseUpgradeWorkerContract.js';
import { runDesktopLibraryDataUpgrade } from './desktopLibraryUpgradeHooks.js';
import { verifyDatabaseIntegrity } from './integrity.js';
import { prepareLegacyAttachmentFiles } from './legacyAttachmentFiles.js';
import { captureLegacyAttachmentTargets, migrateLegacyAttachmentReferences } from './legacyAttachmentReferenceMigration.js';
import { migrateLegacyBodyConsistency } from './legacyBodyConsistencyMigration.js';
import { migrateOrphanedInactiveReadingState } from './orphanedReadingStateMigration.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
const input = workerData as DatabaseUpgradeWorkerInput;
const post = (message: DatabaseUpgradeWorkerMessage) => parentPort?.postMessage(message);

function writeVerifiedSnapshot(sqlite: InstanceType<typeof Database>, destinationPath: string) {
  sqlite.prepare('VACUUM INTO ?').run(destinationPath);
  const snapshot = new Database(destinationPath, { fileMustExist: true, readonly: true });
  try {
    verifyDatabaseIntegrity(snapshot);
  } finally {
    snapshot.close();
    for (const suffix of ['-journal', '-shm', '-wal']) rmSync(`${destinationPath}${suffix}`, { force: true });
  }
}

function upgrade(sqlite: InstanceType<typeof Database>) {
  const version = readUserVersion(sqlite);
  if (version === 0 || version >= DATABASE_SCHEMA_VERSION) return version;
  if (input.snapshotPath) writeVerifiedSnapshot(sqlite, input.snapshotPath);
  const driver = createBetterSqlite3Driver(sqlite);
  const attachmentTargets = captureLegacyAttachmentTargets({ driver, sqlite });
  initializeDatabaseSchema(sqlite, {
    beforeVersionCommit: () => {
      if (input.scope === 'restore-candidate') {
        prepareLegacyAttachmentFiles(input.assetsDir, attachmentTargets);
        migrateLegacyAttachmentReferences({ driver, sqlite }, attachmentTargets, input.hostName);
        // These ran next on the main thread when the restored library first opened; neither depends on its path.
        migrateLegacyBodyConsistency({ driver, sqlite }, input.hostName, false);
        migrateOrphanedInactiveReadingState({ driver, sqlite });
        return;
      }
      bindParentOrderWriter(driver, loadDesktopLibraryWriterBinding(input.dbPath));
      runDesktopLibraryDataUpgrade({ driver, sqlite }, { assetsDir: input.assetsDir, attachmentTargets,
        fresh: false, hostName: input.hostName, version });
    },
    onMigrationApplied: (progress) => post({ type: 'progress', ...progress })
  });
  return version;
}

const sqlite = new Database(input.dbPath, { fileMustExist: true });
try {
  // Match the main connection: stored-source search triggers call this function.
  sqlite.function('source_search_lower', { deterministic: true, directOnly: true },
    (value: unknown) => typeof value === 'string' ? value.toLowerCase() : null);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  post({ type: 'result', ok: true, previousVersion: upgrade(sqlite) });
} catch (error) {
  post({ type: 'result', ok: false, message: error instanceof Error ? error.message : String(error) });
} finally {
  sqlite.close();
}
