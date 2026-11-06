import { APP_COMMAND_IDS } from '../../src/shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings';

import { expect, normalizeDesktopWindow, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const nodeId = 'playwright-content-editing-session';

export async function facts(session: DesktopSession, remote = false, baseVersionId?: string) {
  return session.electronApp.evaluate(async (_, input) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { createBetterSqliteDbPort } = require(`${process.cwd()}/dist/electron/database/betterSqliteDbPort.js`);
    const graph = require(`${process.cwd()}/dist/lib/core/sync/syncNodeGraph.js`);
    return connection.runWithDatabaseConnectionOwner(async () => {
      const { sqlite, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('foliole-playwright')) throw new Error('isolated_library_required');
      const port = createBetterSqliteDbPort(sqlite);
      if (input.remote) {
        const base = await graph.loadRetainedSyncNodeVersionFact(port, input.baseVersionId);
        const now = new Date(Date.now() + 1000).toISOString();
        const snapshot = { ...base.snapshot, content: 'Remote branch', body_blob_hash: null,
          updated_at: now, text_selection: { version_id: 'native-remote', created_at: now } };
        delete snapshot.text_alternatives;
        delete snapshot.body_deleted;
        const { topicTextSnapshotHash } = require(`${process.cwd()}/dist/lib/core/sync/topicTextSnapshotHash.js`);
        const remote = { ...base, snapshot, version_id: 'native-remote', parent_version_id: base.version_id,
          parent_version_ids: [base.version_id], ancestor_version_ids: [base.version_id, ...base.ancestor_version_ids],
          content_hash: topicTextSnapshotHash(snapshot), host_name: 'peer', body_text: 'Remote branch',
          version_created_at: now, updated_at: now };
        const { applyConvergentSyncNodesWithDbPort } = require(`${process.cwd()}/dist/lib/core/sync/syncNodeConvergence.js`);
        await applyConvergentSyncNodesWithDbPort(port, [remote]);
        require(`${process.cwd()}/dist/electron/ipc/workspaceContentChangedEvents.js`)
          .notifyWorkspaceContentChanged(null, { requestSync: false, workspaceScope: { kind: 'nodes', nodeIds: [input.nodeId] } });
      }
      const current = await graph.loadCurrentSyncNodeRecord(port, input.nodeId);
      const alternatives = sqlite.prepare("SELECT body_text FROM node_text_alternatives WHERE node_id = ? AND status = 'available'")
        .all(input.nodeId).map((row: { body_text: string }) => row.body_text);
      const { hasContentEditingSession } = require(`${process.cwd()}/dist/lib/core/sync/contentEditingSession.js`);
      return { content: current.body_text, versionId: current.version_id, parents: current.parent_version_ids, alternatives, editing: hasContentEditingSession(port, input.nodeId) };
    });
  }, { nodeId, remote, baseVersionId });
}

export async function openEditingSession(session: DesktopSession, page: import('@playwright/test').Page, repair = false,
  options: { focusNative?: boolean } = {}) {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, repair, storageKey, commandId }) => {
    if (repair) localStorage.setItem(storageKey, JSON.stringify([{ id: 'user.repair', commandId, section: 'top',
      order: 0, visible: true, source: 'user', labelOverride: 'Repair table', iconId: 'Table' }]));
    await window.__folioleWorkspaceDebug?.seedNodes([{ id, content: 'Base', kind: 'topic', title: 'Editing session' }], { persist: true });
  }, { id: nodeId, repair, storageKey: APP_SETTINGS_STORAGE_KEYS.workspaceRailItems, commandId: APP_COMMAND_IDS.repairTable });
  await page.reload();
  await expectWorkspaceShell(page);
  const exitFlow = page.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await page.evaluate(id => window.__folioleWorkspaceDebug?.openNode(id), nodeId);
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  const window = await session.electronApp.browserWindow(page);
  if (options.focusNative !== false) {
    await normalizeDesktopWindow(session);
    await session.electronApp.evaluate(({ app }) => app.focus({ steal: true }));
    await window.evaluate(window => { window.setAlwaysOnTop(true); window.focus(); window.webContents.focus(); });
    await expect.poll(() => window.evaluate(window => window.isFocused())).toBe(true);
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  }
  const base = await facts(session);
  return { editor, window, base };
}
