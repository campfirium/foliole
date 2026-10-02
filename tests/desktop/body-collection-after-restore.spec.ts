import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 'body-restore-retained';
const BODY = 'Retained native article after restoring the backup.';

test('restoring a completed historical migration starts safe catch-up without restarting the client', async ({ desktopSession }, testInfo) => {
  await expectWorkspaceShell(desktopSession.firstWindow);
  await desktopSession.firstWindow.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ id, kind: 'topic', title: 'Retained article', content }], { persist: true });
  }, { id: ID, content: BODY });
  await expect.poll(async () => (await loadNodeDocument(desktopSession.firstWindow, ID))?.content).toBe(BODY);
  const library = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!library) throw new Error('Missing isolated library home');
  const backup = path.join(library, 'historical-body.db');
  const fixture = await desktopSession.electronApp.evaluate(async (_, file) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const blobs = require(`${process.cwd()}/dist/lib/core/database/contentBodyBlobs.js`);
    return connection.runWithDatabaseConnectionOwner(async () => {
      const { sqlite: db, driver } = connection.openDatabaseConnection();
      const garbage = blobs.upsertTextBodyBlob(driver, '12', '2026-01-01');
      const cached = blobs.upsertTextBodyBlob(driver, 'Retained cached source body', '2026-01-01');
      db.prepare(`INSERT INTO keep_import_item_cache
        (rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at)
        VALUES ('restore','source','Cache','Retained cached source body',0,0,'then')`).run();
      db.prepare('DELETE FROM data_migration_state WHERE migration_id=?').run('released-body-collection-v3');
      db.prepare('DELETE FROM legacy_body_migration_progress WHERE migration_id=?').run('released-body-collection-v3');
      const migrations = require(`${process.cwd()}/dist/electron/database/legacyBodyMigrationState.js`);
      migrations.saveBodyMigrationProgress({ sqlite: db, driver },
        migrations.initialBodyMigrationProgress('released-body-collection-v2', 'done'), true);
      db.prepare(`INSERT INTO sync_pack_dependency_rows VALUES
        ('group','peer','view','node','object',0,'nodes','{}',?,'digest')`)
        .run(JSON.stringify({ list: Array.from({ length: 13 }, () => null) }));
      await db.backup(file);
      return { garbage, cached };
    });
  }, backup);
  await desktopSession.firstWindow.evaluate(async (sourcePath) => {
    await window.electronAPI.invoke('restore_sqlite_database', { sourcePath });
  }, backup);
  const facts = () => desktopSession.electronApp.evaluate(async (_, hashes) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return { state: db.prepare('SELECT status FROM data_migration_state WHERE migration_id=?').get('released-body-collection-v3'),
        garbage: Boolean(db.prepare('SELECT hash FROM content_blob_data WHERE hash=?').get(hashes.garbage)),
        cached: Boolean(db.prepare('SELECT hash FROM content_blob_data WHERE hash=?').get(hashes.cached)) };
    });
  }, fixture);
  await expect.poll(facts).toEqual({ state: { status: 'completed' }, garbage: false, cached: true });
  await desktopSession.firstWindow.reload();
  await expectWorkspaceShell(desktopSession.firstWindow);
  await expect.poll(async () => (await loadNodeDocument(desktopSession.firstWindow, ID))?.content).toBe(BODY);
  await testInfo.attach('restore-body-collection', { body: JSON.stringify(await facts()), contentType: 'application/json' });
});
