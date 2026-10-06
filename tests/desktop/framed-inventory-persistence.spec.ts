import { createHash } from 'node:crypto';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

function inventory(app: DesktopSession['electronApp'], nodeId: string) {
  return app.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(async () => {
      const sqlite = connection.openDatabaseConnection().sqlite;
      const port = require(`${process.cwd()}/dist/electron/database/betterSqliteDbPort.js`).createBetterSqliteDbPort(sqlite);
      const entry = await require(`${process.cwd()}/dist/lib/core/sync/framedSyncInventoryRead.js`)
        .readFramedSyncInventoryEntry(port, { globalId: id, objectType: 'node' });
      if (!entry) throw new Error('native_inventory_missing');
      return { frontier: entry.frontierFactIds, hash: Buffer.from(entry.sharedStateHash).toString('hex'),
        resources: entry.resourceHashes.map((value: Uint8Array) => Buffer.from(value).toString('hex')),
        state: sqlite.prepare("SELECT content_hash, current_version_id FROM sync_object_state WHERE object_type = 'node' AND object_id = ?").get(id) };
    });
  }, nodeId);
}

test('discovers a native editor write from its durable lightweight inventory after reload', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const id = 'native-inventory-topic';
  await desktopWindow.evaluate(async (nodeId) => {
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: nodeId, kind: 'topic', title: 'Native inventory', content: '' }], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(nodeId);
  }, id);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(id);
  const body = 'Original native inventory body\n';
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toHaveText('');
  await editor.click();
  await expect(editor).toBeFocused();
  await desktopWindow.keyboard.insertText(body);
  await expect(editor).toContainText('Original native inventory body');
  expect(await desktopWindow.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  await expect.poll(() => desktopWindow.evaluate(async (nodeId) =>
    (await window.electronAPI.invoke('load_node_document', { nodeId }))?.content, id)).toBe(body);
  const written = await inventory(desktopApp, id);
  expect(written.hash).toBe(written.state.content_hash);
  expect(written.frontier).toContain(written.state.current_version_id);
  expect(written.resources).toContain(createHash('sha256').update(body).digest('hex'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  expect(await inventory(desktopApp, id)).toEqual(written);
});
