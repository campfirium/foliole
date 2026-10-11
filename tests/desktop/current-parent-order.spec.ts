import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function orders(page: Page) {
  return page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot');
    if (!snapshot) throw new Error('workspace_snapshot_missing');
    return { topics: snapshot.nodeOrder.filter((id) => /^native-topic-[a-d]$/u.test(id)),
      items: snapshot.nodeOrder.filter((id) => /^native-item-[a-d]$/u.test(id)) };
  });
}

test('keeps directory and topic arrangements through additions, reload and application restart', async ({
  desktopSession, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'native-order-folder', kind: 'folder', title: 'Order folder' },
      ...['a', 'b', 'c'].map((id) => ({ content: `Body ${id}`, id: `native-topic-${id}`,
        kind: 'topic' as const, parentNodeId: 'native-order-folder', title: `Order ${id}` })),
      ...['a', 'b', 'c'].map((id) => ({ content: `Question ${id}`, id: `native-item-${id}`,
        kind: 'item' as const, parentNodeId: 'native-topic-a', title: `Item ${id}` }))
    ], { persist: true });
    await window.electronAPI.invoke('replace_node_order', {
      nodeIds: ['native-topic-b', 'native-topic-a', 'native-topic-c',
        'native-item-c', 'native-item-a', 'native-item-b']
    });
    for (const kind of ['topic', 'item'] as const) {
      const snapshot = await window.electronAPI.invoke('load_workspace_snapshot');
      if (!snapshot) throw new Error('workspace_snapshot_missing');
      const nodeId = `native-${kind}-d`;
      const now = new Date().toISOString();
      await window.electronAPI.invoke(kind === 'topic' ? 'create_topic' : 'create_item', {
        nodeId, kind, parentNodeId: kind === 'topic' ? 'native-order-folder' : 'native-topic-a',
        content: 'New body', title: kind === 'topic' ? 'Order d' : 'Item d', isTitleManual: true,
        anchorLink: null, reveal: null, position: 3, createdAt: now, updatedAt: now,
        nodeOrder: [...snapshot.nodeOrder, nodeId]
      });
    }
  });
  const expected = { topics: ['native-topic-b', 'native-topic-a', 'native-topic-c', 'native-topic-d'],
    items: ['native-item-c', 'native-item-a', 'native-item-b', 'native-item-d'] };
  expect(await orders(desktopWindow)).toEqual(expected);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  expect(await orders(desktopWindow)).toEqual(expected);
  const folder = desktopWindow.getByRole('treeitem', { name: 'Order folder', exact: true });
  await folder.click({ button: 'right' });
  await expect(desktopWindow.getByRole('menu')).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: 'Saved arrangements…', exact: true })).toHaveCount(0);
  const screenshot = path.resolve('.tmp/artifacts/desktop-acceptance/current-parent-order-menu.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('current-parent-order-menu', { path: screenshot, contentType: 'image/png' });
  const stateRoot = desktopSession.target.runtimeStateRoot;
  // Keep the fixture-owned library until the restarted process has been checked.
  await desktopSession.electronApp.close();
  const reopened = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
  try {
    await expectWorkspaceShell(reopened.firstWindow);
    expect(await orders(reopened.firstWindow)).toEqual(expected);
  } finally { await reopened.close(); }
});
