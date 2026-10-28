import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const parentId = 'permanent-image-parent';
const childId = 'permanent-image-child';

test('deletion before search initialization preserves the parent document and survives reload', async ({ desktopWindow, desktopApp }) => {
  await expectWorkspaceShell(desktopWindow);
  const tables = await desktopApp.evaluate((_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { openDatabaseConnection } = require(`${cwd}/dist/electron/database/connection.js`);
    return openDatabaseConnection().driver.queryAll(
      "SELECT name FROM search.sqlite_master WHERE type = 'table' AND name IN ('node_search', 'pdf_search', 'pdf_page_map')"
    );
  }, process.cwd());
  expect(tables).toEqual([]);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async ({ parentId, childId }) => {
    const region = (id: string) => ({ id, x: 0, y: 0, width: 0.5, height: 0.5 });
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: parentId, kind: 'topic', title: 'Preserved image source', content: 'Parent document remains intact.',
        imageRegions: [{ attachmentId: 'image', regions: [region('gone'), region('keep')] }] },
      { id: childId, parentNodeId: parentId, kind: 'item', title: 'Removed image item', content: 'Image question',
        reveal: 'Answer', anchorLink: { id: 'gone', kind: 'cloze', locator: {
          attachmentId: 'image', x: 0, y: 0, width: 0.5, height: 0.5
        } } }
    ]);
    await window.__folioleWorkspaceDebug!.openNode(childId);
  }, { parentId, childId });

  expect(await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.deleteNodePermanently(id), childId)).toBe(true);

  const read = () => desktopWindow.evaluate(async ({ parentId, childId }) => {
    const parent = await window.electronAPI!.invoke('load_node_document', { nodeId: parentId }) as {
      content: string; imageRegions: Array<{ regions: Array<{ id: string }> }> | null
    };
    const child = await window.electronAPI!.invoke('load_node_document', { nodeId: childId });
    return { body: parent.content, ids: parent.imageRegions?.flatMap((group) => group.regions.map(({ id }) => id)), child };
  }, { parentId, childId });
  await expect.poll(read).toEqual({ body: 'Parent document remains intact.', ids: ['keep'], child: null });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await expect.poll(read).toEqual({ body: 'Parent document remains intact.', ids: ['keep'], child: null });
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), parentId);
  await expect(desktopWindow.locator('.cm-content').first()).toContainText('Parent document remains intact.');
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/T558/native-parent-after-reload.png') });
});
