import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion';
import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const BODY = 'Historical source body survives migration.';
const EXISTING_BODY = 'Existing topic remains independently readable.';
const NODE = 'cache-history-existing-topic';
function seedOldLibrary(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
      last_status, first_seen_at, last_seen_at, local_node_state)
      VALUES ('history-rule', 'entry.md', 1, 2, 'blocked_deleted', 'then', 'then', 'locally_deleted');
      INSERT INTO keep_import_item_cache VALUES
      ('history-rule', 'entry.md', 'Historical entry', '${BODY}', '${BODY}', 1, 2, 'then', NULL),
      ('orphan', 'old.md', 'Orphan', 'Unique old content', NULL, 1, 2, 'then', NULL);
      PRAGMA user_version = 126;`);
  } finally { db.close(); }
}
function libraryState(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return { version: db.prepare('PRAGMA user_version').get()!.user_version,
      caches: db.prepare('SELECT rule_id, source_path FROM keep_import_item_cache ORDER BY rule_id').all() };
  } finally { db.close(); }
}

test('isolated cold upgrade keeps source reading, restoration and existing topic content usable', async ({ desktopSession }) => {
  await expectWorkspaceShell(desktopSession.firstWindow);
  const root = desktopSession.target.runtimeStateRoot;
  const sourceDir = path.join(root, 'history-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), `# Historical entry\n\n${BODY}`);
  await desktopSession.firstWindow.evaluate(async ({ sourceDir, node, body }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: node, kind: 'topic', title: 'Existing topic', content: body }]);
    await window.electronAPI!.invoke('save_import_manager_settings', { settings: { sources: [{
      id: 'history-rule', actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
      keepPreview: null, keepState: 'draft', primaryPath: sourceDir
    }] } });
  }, { sourceDir, node: NODE, body: EXISTING_BODY });
  const databasePath = path.join(desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME!, 'Data', 'foliole.db');
  expect(path.relative(root, databasePath).startsWith('..')).toBe(false);
  await closeDesktopApplication(desktopSession.electronApp);
  seedOldLibrary(databasePath);
  let reopened: DesktopSession | null = null;
  try {
    reopened = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: root } }) as DesktopSession;
    await expectWorkspaceShell(reopened.firstWindow);
    expect(libraryState(databasePath)).toEqual({ version: DATABASE_SCHEMA_VERSION,
      caches: [{ rule_id: 'history-rule', source_path: 'entry.md' }] });
    await reopened.firstWindow.evaluate((node) => window.__folioleWorkspaceDebug!.openNode(node), NODE);
    await expect(reopened.firstWindow.locator('.prompt-editor-host .cm-content')).toContainText(EXISTING_BODY);
    const removed = await reopened.firstWindow.evaluate(() => window.electronAPI!.invoke('load_removed_sources', {}));
    expect(removed.entries).toEqual([expect.objectContaining({ content: BODY, source_path: 'entry.md' })]);
    const restored = await reopened.firstWindow.evaluate(() => window.electronAPI!.invoke('restore_removed_source', {
      rule_id: 'history-rule', source_path: 'entry.md'
    }));
    expect(restored.status).toBe('restored');
    expect(restored.node_id).toEqual(expect.any(String));
    await expect.poll(() => reopened!.firstWindow.evaluate((node) =>
      window.__folioleWorkspaceDebug!.listNodes().some((entry) => entry.id === node), restored.node_id!)).toBe(true);
    expect(await reopened.firstWindow.evaluate((node) => window.__folioleWorkspaceDebug!.openNode(node), restored.node_id!)).toBe(true);
    await expect(reopened.firstWindow.locator('.prompt-editor-host .cm-content')).toContainText(BODY);
    await reopened.firstWindow.screenshot({ path: path.resolve('.tmp/artifacts/untracked-cache-upgrade-reading.png') });
    await closeDesktopApplication(reopened.electronApp);
    expect(libraryState(databasePath).version).toBe(DATABASE_SCHEMA_VERSION);
  } finally { await reopened?.close(); }
});
