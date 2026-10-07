import type { Page } from '@playwright/test';
import { z } from 'zod';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const historySchema = z.object({ currentVersionId: z.string().nullable(), versions: z.array(z.object({
  versionId: z.string(), kind: z.string(), order: z.array(z.string())
})) });
const parentId = 'native-order-folder';

async function history(page: Page) {
  return historySchema.parse(await page.evaluate((id) => window.electronAPI.invoke(
    'read_parent_order_history', { parentId: id }), parentId));
}

test('retains the usable arrangement history and restores it after durable edits and renderer reload', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'native-order-folder', kind: 'folder', title: 'Order folder' },
      ...['a', 'b', 'c'].map((id) => ({ content: `Body ${id}`, id: `native-order-${id}`,
        kind: 'topic' as const, parentNodeId: 'native-order-folder', title: `Order ${id}` }))
    ], { persist: true });
  });
  const initial = await history(desktopWindow);
  expect(initial.versions).toHaveLength(1);
  expect(initial.versions[0]?.order).toEqual(['native-order-a', 'native-order-b', 'native-order-c']);
  await desktopWindow.evaluate(() => window.electronAPI.invoke('replace_node_order', {
    nodeIds: ['native-order-b', 'native-order-a', 'native-order-c']
  }));
  const chosen = await history(desktopWindow);
  const saved = chosen.versions.find((version) => version.versionId === chosen.currentVersionId);
  expect(saved?.kind).toBe('user');
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: 'New body', id: 'native-order-d', kind: 'topic',
        parentNodeId: 'native-order-folder', title: 'Order d' }
    ], { persist: true });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const afterReload = await history(desktopWindow);
  expect(afterReload.versions).toContainEqual(saved);
  await desktopWindow.evaluate(({ parentId, versionId }) => window.electronAPI.invoke(
    'restore_parent_order_snapshot', { parentId, versionId }), { parentId, versionId: saved!.versionId });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const restored = await history(desktopWindow);
  expect(restored.currentVersionId).not.toBe(saved!.versionId);
  const order = restored.versions.find((version) => version.versionId === restored.currentVersionId)!.order;
  expect(order.filter((id) => id !== 'native-order-d'))
    .toEqual(['native-order-b', 'native-order-a', 'native-order-c']);
  expect(order.filter((id) => id === 'native-order-d')).toHaveLength(1);
});
