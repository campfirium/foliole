import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/node-time-semantics-hidden-native.png');

function topicColumn(page: Page) {
  return page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
}

async function chooseModifiedSort(page: Page, surface: Locator) {
  await surface.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Date modified|修改日期)$/ }).click();
}

test('opening and reading a topic do not move it in modified order', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: 'Read without editing.', id: 'time-semantics-older', kind: 'topic', title: 'Older modified topic' },
      { content: 'Newer content.', id: 'time-semantics-newer', kind: 'topic', title: 'Newer modified topic' }
    ], { persist: false });
    await api?.openNode?.('time-semantics-newer');
    await api?.openNode?.('time-semantics-older');
    api?.setNodeViewState({ from: 3, nodeId: 'time-semantics-older', scrollTop: 12, to: 3 });
  });

  const column = topicColumn(desktopWindow);
  await chooseModifiedSort(desktopWindow, column);
  await expect.poll(async () => column.getByRole('treeitem').evaluateAll((items) => (
    items.map((item) => item.getAttribute('data-node-id'))
      .filter((id) => id?.startsWith('time-semantics-'))
  ))).toEqual(['time-semantics-newer', 'time-semantics-older']);

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('node-time-semantics', { contentType: 'image/png', path: SCREENSHOT_PATH });
});
