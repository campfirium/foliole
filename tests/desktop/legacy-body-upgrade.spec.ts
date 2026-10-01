import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 't291-legacy-body';
const BODY = '---\nauthor: Ada\n---\nCanonical historical article.\n';

async function readFacts(session: DesktopSession) {
  return session.electronApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return { node: db.prepare('SELECT current_version_id, content FROM nodes WHERE id = ?').get(id),
        versions: db.prepare('SELECT version_id, parent_version_id, body_text FROM node_sync_versions WHERE object_id = ?').all(id),
        progress: db.prepare('SELECT * FROM legacy_body_migration_progress ORDER BY migration_id').all(),
        state: db.prepare('SELECT * FROM data_migration_state WHERE migration_id LIKE ?').all('legacy-%'),
        protections: db.prepare('SELECT * FROM legacy_body_migration_protections').all(),
        garbage: db.prepare("SELECT COUNT(*) count FROM content_blob_data WHERE CAST(data AS TEXT) = 'T291 unheld native bytes'").get() };
    });
  }, ID);
}

async function prepareLegacyLibrary(session: DesktopSession) {
  await expectWorkspaceShell(session.firstWindow);
  await session.firstWindow.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ id, content, title: 'Historical body', kind: 'topic' }], { persist: true });
  }, { id: ID, content: BODY });
  await expect.poll(async () => (await loadNodeDocument(session.firstWindow, ID))?.content).toBe(BODY);
  return await session.electronApp.evaluate(async (_, { id, body }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const blobs = require(`${process.cwd()}/dist/lib/core/database/contentBodyBlobs.js`);
    const versions = require(`${process.cwd()}/dist/electron/database/nodeSyncVersionFromDriver.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite: db, driver, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('foliole-playwright') && !dbPath.includes('.tmp')) throw new Error('Fixture must use isolated library');
      versions.flushNodeSyncVersionWithDriver(driver, id, 'native-fixture', new Date().toISOString());
      const node = db.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get(id);
      db.prepare("UPDATE node_sync_versions SET body_text = '' WHERE version_id = ?").run(node.current_version_id);
      db.prepare('UPDATE nodes SET content = ?, sync_dirty = 0 WHERE id = ?').run(body, id);
      blobs.upsertTextBodyBlob(driver, 'T291 unheld native bytes', new Date().toISOString());
      db.prepare('DELETE FROM data_migration_state WHERE migration_id LIKE ?').run('legacy-%');
      db.prepare('DELETE FROM legacy_body_migration_progress WHERE migration_id LIKE ?').run('legacy-%');
      db.pragma('user_version = 123');
      return { version: node.current_version_id, dbPath };
    });
  }, { id: ID, body: BODY });
}

test('upgrades an isolated legacy library, reads and edits its repaired body, collects in background and survives process restart', async ({ desktopSession }, testInfo) => {
  let restarted: DesktopSession | null = null;
  let reopened: DesktopSession | null = null;
  try {
    const fixture = await prepareLegacyLibrary(desktopSession);
    const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot };
    await desktopSession.electronApp.close();
    restarted = await launchDesktopSession({ env });
    await expectWorkspaceShell(restarted.firstWindow);
    await expect.poll(async () => (await loadNodeDocument(restarted!.firstWindow, ID))?.content).toBe(BODY);
    await restarted.firstWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), ID);
    await expect.poll(() => restarted!.firstWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(BODY);
    const after = await readFacts(restarted);
    expect(after.node.current_version_id).not.toBe(fixture.version);
    expect(after.versions.find((row: { version_id: string }) => row.version_id === fixture.version)?.body_text).toBe('');
    expect(after.versions.find((row: { version_id: string }) => row.version_id === after.node.current_version_id)?.body_text).toBe(BODY);
    const edited = `${BODY}Persisted edit after upgrade.`;
    await restarted.firstWindow.locator('.prompt-editor-host .cm-content').focus();
    await restarted.firstWindow.evaluate((position) => window.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position), BODY.length);
    await restarted.firstWindow.keyboard.insertText('Persisted edit after upgrade.');
    await expect.poll(async () => (await loadNodeDocument(restarted!.firstWindow, ID))?.content).toBe(edited);
    await restarted.electronApp.close();
    reopened = await launchDesktopSession({ env });
    await expectWorkspaceShell(reopened.firstWindow);
    await expect.poll(async () => (await loadNodeDocument(reopened!.firstWindow, ID))?.content).toBe(edited);
    await expect.poll(async () => (await readFacts(reopened!)).state.find((row: { migration_id: string }) => row.migration_id === 'legacy-body-collection-v1')?.status,
      { timeout: 60000 }).toBe('completed');
    const final = await readFacts(reopened);
    expect(final.garbage.count).toBe(0);
    expect(final.progress.find((row: { migration_id: string }) => row.migration_id === 'legacy-current-body-v1')).toEqual(
      after.progress.find((row: { migration_id: string }) => row.migration_id === 'legacy-current-body-v1'));
    const stable = await reopened.electronApp.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      const tasks = require(`${process.cwd()}/dist/electron/database/legacyBodyCollectionTask.js`);
      await tasks.startLegacyBodyCollectionTask();
      return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().sqlite.prepare('SELECT * FROM legacy_body_migration_progress ORDER BY migration_id').all());
    });
    expect(stable).toEqual(final.progress);
    await testInfo.attach('legacy-body-upgrade', { body: JSON.stringify({ fixture, after, final }, null, 2), contentType: 'application/json' });
  } finally {
    await reopened?.close();
    await restarted?.close();
  }
});
