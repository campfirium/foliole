import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { openNode } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ids = ['subtree-p', 'subtree-a', 'subtree-leaf', 'subtree-b', 'subtree-q'];

test('updates subtree membership after a move and preserves delete, restore and permanent delete', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'subtree-p', title: 'Source folder', kind: 'folder', content: '' },
      { id: 'subtree-a', parentNodeId: 'subtree-p', title: 'Moved branch', kind: 'folder', content: '' },
      { id: 'subtree-leaf', parentNodeId: 'subtree-a', title: 'Preserved descendant', kind: 'topic', content: 'Saved subtree body.' },
      { id: 'subtree-b', parentNodeId: 'subtree-p', title: 'Remaining sibling', kind: 'topic', content: 'Unchanged sibling body.' },
      { id: 'subtree-q', title: 'Destination folder', kind: 'folder', content: '' }
    ]);
  });
  const read = () => desktopWindow.evaluate((nodeIds) => nodeIds.map(id => {
    const node = window.__folioleWorkspaceDebug!.getNode(id);
    return node ? { id, parent: node.parentNodeId, trashed: node.trashed } : null;
  }), ids);
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!
    .moveNodes(['subtree-a'], 'subtree-q', 'child'))).toBe(true);
  await expect.poll(async () => (await read())[1]?.parent).toBe('subtree-q');
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.deleteNode('subtree-p'));
  await expect.poll(async () => (await read()).map(node => node?.trashed)).toEqual([true, false, false, true, false]);
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.restoreNode('subtree-b'))).toBe(true);
  await expect.poll(async () => (await read()).map(node => node?.trashed)).toEqual([false, false, false, false, false]);
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.deleteNode('subtree-q'));
  await expect.poll(async () => (await read()).map(node => node?.trashed)).toEqual([false, true, true, false, true]);
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.restoreNode('subtree-leaf'))).toBe(true);
  await expect.poll(async () => (await read()).map(node => node?.trashed)).toEqual([false, false, false, false, false]);
  await openNode(desktopWindow, 'subtree-leaf');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Saved subtree body.');
  const directory = path.resolve('.tmp/artifacts/T586');
  await mkdir(directory, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(directory, 'restored-subtree.png') });
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.deleteNodePermanently('subtree-q'));
  await expect.poll(async () => (await read()).map(node => node?.id ?? null))
    .toEqual(['subtree-p', null, null, 'subtree-b', null]);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await expect.poll(async () => (await read()).map(node => node?.id ?? null))
    .toEqual(['subtree-p', null, null, 'subtree-b', null]);
  await openNode(desktopWindow, 'subtree-b');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Unchanged sibling body.');
  await desktopWindow.screenshot({ path: path.join(directory, 'reopened-sibling.png') });
});
