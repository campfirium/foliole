import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'explicit-reading-removal';

function readFacts(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      nodes: db.prepare('SELECT * FROM nodes WHERE id = ?').all(NODE_ID),
      versions: db.prepare('SELECT * FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(NODE_ID),
      reading: db.prepare('SELECT * FROM node_reading WHERE node_id = ?').all(NODE_ID),
      deletion: db.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = ?").get(NODE_ID)
    };
  } finally { db.close(); }
}

test('persists an explicit removal of absent reading through the native command and relaunch', async ({ desktopSession, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async id => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id, kind: 'topic', title: 'Preserved topic', content: 'Preserve this topic body.' }
    ], { persist: true });
  }, NODE_ID);
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  expect(libraryHome).toBeTruthy();
  const databasePath = path.join(libraryHome!, 'Data', 'foliole.db');
  const before = readFacts(databasePath);
  expect(before.reading).toEqual([]);
  expect(before.deletion).toBeUndefined();
  const deletedAt = new Date().toISOString();
  await desktopWindow.evaluate(async ({ nodeId, updatedAt }) => {
    await window.electronAPI.invoke('save_node_reading_state', { nodeId, updatedAt, reading: null });
  }, { nodeId: NODE_ID, updatedAt: deletedAt });
  const after = readFacts(databasePath);
  expect(after).toEqual({ ...before, deletion: { deleted_at: deletedAt } });
  await closeDesktopApplication(desktopSession.electronApp);
  let reopened: DesktopSession | null = null;
  try {
    reopened = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot }
    });
    await expectWorkspaceShell(reopened.firstWindow);
    expect(readFacts(databasePath)).toEqual(after);
    await reopened.firstWindow.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), NODE_ID);
    await expect(reopened.firstWindow.locator('.prompt-editor-host .cm-content')).toContainText('Preserve this topic body.');
  } finally { await reopened?.close(); }
});
