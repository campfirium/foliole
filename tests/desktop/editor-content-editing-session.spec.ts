import { mkdirSync } from 'node:fs';

import { expect, normalizeDesktopWindow, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const nodeId = 'playwright-content-editing-session';

async function facts(session: DesktopSession, remote = false, baseVersionId?: string) {
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
      return { content: current.body_text, versionId: current.version_id, parents: current.parent_version_ids, alternatives };
    });
  }, { nodeId, remote, baseVersionId });
}

test('continues saving focused input across reception and settles on actual window blur', async ({ desktopWindow: page, desktopSession: session }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async id => {
    await window.__folioleWorkspaceDebug?.seedNodes([{ id, content: 'Base', kind: 'topic', title: 'Editing session' }], { persist: true });
  }, nodeId);
  await page.reload();
  await expectWorkspaceShell(page);
  const exitFlow = page.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await page.evaluate(id => window.__folioleWorkspaceDebug?.openNode(id), nodeId);
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  const window = await session.electronApp.browserWindow(page);
  await normalizeDesktopWindow(session);
  await session.electronApp.evaluate(({ app }) => app.focus({ steal: true }));
  await window.evaluate(window => { window.setAlwaysOnTop(true); window.focus(); window.webContents.focus(); });
  await expect.poll(() => window.evaluate(window => window.isFocused())).toBe(true);
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  const base = await facts(session);
  await editor.click();
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Local 1 ');
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local 1 Base' });
  await facts(session, true, base.versionId);
  await expect(editor).toHaveText('Local 1 Base');
  await expect(editor).toBeFocused();
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local 1 Base', alternatives: [] });
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await page.keyboard.insertText('Local 2 ');
  await expect.poll(() => facts(session)).toMatchObject({ content: 'Local 2 Local 1 Base' });
  expect((await facts(session)).parents).toHaveLength(1);
  await window.evaluate(window => new Promise<void>(resolve => {
    const blurFocusedWindow = () => {
      if (!window.isFocused()) return;
      window.removeListener('focus', blurFocusedWindow);
      window.blur();
      window.setAlwaysOnTop(false);
      resolve();
    };
    window.show();
    window.setAlwaysOnTop(true);
    window.webContents.focus();
    window.on('focus', blurFocusedWindow);
    window.focus();
    blurFocusedWindow();
  }));
  await expect.poll(() => window.evaluate(window => window.isFocused())).toBe(false);
  await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
  const final = await facts(session);
  expect(new Set([final.content, ...final.alternatives])).toEqual(new Set(['Remote branch', 'Local 2 Local 1 Base']));
  await window.evaluate(window => { window.show(); window.focus(); window.webContents.focus(); });
  await expect(editor).toHaveText(final.content);
  mkdirSync('.tmp/artifacts/T727', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/T727/editing-session-window-exit.png' });
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await facts(session)).toEqual(final);
});
