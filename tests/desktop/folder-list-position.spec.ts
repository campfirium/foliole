import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_ID = 'position-folder';
const FOLDER_TITLE = 'Folder position acceptance';

function folderList(page: Page) {
  return page.getByRole('region', { name: /^(Folder list view|文件夹列表视图)$/ });
}

async function seedFolder(page: Page, count: number) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async ({ count, folderId, folderTitle }) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug) throw new Error('Workspace fixture bridge unavailable');
    await debug.seedNodes([
      { id: folderId, kind: 'folder', title: folderTitle, content: '' },
      ...Array.from({ length: count }, (_, index) => ({
        id: `position-topic-${index}`,
        kind: 'topic' as const,
        parentNodeId: folderId,
        title: `Position topic ${index}`,
        content: `# Position topic ${index}\n\nFolder navigation body ${index}.`
      }))
    ]);
  }, { count, folderId: FOLDER_ID, folderTitle: FOLDER_TITLE });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('treeitem', { name: FOLDER_TITLE, exact: true }).click();
  await expect(folderList(page)).toBeVisible();
  await expect(folderList(page).getByTestId('folder-list-count')).toHaveText(String(count));
}

async function readPosition(list: Locator, fraction?: number) {
  return list.evaluate((element, fraction) => {
    let scroll = element.parentElement;
    while (scroll && !['auto', 'scroll'].includes(getComputedStyle(scroll).overflowY)) {
      scroll = scroll.parentElement;
    }
    if (!scroll) throw new Error('Folder scroll surface unavailable');
    if (fraction !== undefined) {
      scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * fraction;
      scroll.dispatchEvent(new Event('scroll'));
    }
    const viewport = scroll.getBoundingClientRect();
    const row = [...element.querySelectorAll('li')].find((candidate) => {
      const bounds = candidate.getBoundingClientRect();
      return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
    });
    const title = row?.querySelector('[data-testid^="folder-list-title-"]');
    return {
      id: title?.getAttribute('data-testid')?.replace('folder-list-title-', '') ?? null,
      offset: row ? row.getBoundingClientRect().top - viewport.top : null,
      scrollTop: scroll.scrollTop
    };
  }, fraction);
}

async function deepPosition(page: Page, count: number) {
  const list = folderList(page);
  await readPosition(list, 0.7);
  if (count >= 100) {
    await expect.poll(async () => Number(await list.locator('[data-index]').first().getAttribute('data-index')))
      .toBeGreaterThan(0);
  }
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(async () => (await readPosition(list)).id).not.toBeNull();
  const position = await readPosition(list);
  expect(position.scrollTop).toBeGreaterThan(0);
  return position;
}

for (const count of [99, 152]) {
  test(`returns to the same visible folder card with ${count} topics`, async ({ desktopWindow: page }, testInfo) => {
    await seedFolder(page, count);
    const before = await deepPosition(page, count);
    await testInfo.attach('folder-before-opening', { body: await page.screenshot(), contentType: 'image/png' });
    await folderList(page).getByTestId(`folder-list-title-${before.id}`).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(before.id);
    await page.getByRole('button', { name: /^(Go back|后退)$/ }).click();
    await expect(folderList(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(FOLDER_ID);
    await expect.poll(async () => (await readPosition(folderList(page))).id).toBe(before.id);
    await expect.poll(async () => {
      const current = await readPosition(folderList(page));
      return current.offset === null || before.offset === null ? Infinity : Math.abs(current.offset - before.offset);
    }).toBeLessThan(1);
    const returned = await readPosition(folderList(page));
    await testInfo.attach('folder-return-position', {
      body: JSON.stringify({ count, before, returned }, null, 2), contentType: 'application/json'
    });
    await testInfo.attach('folder-after-returning', { body: await page.screenshot(), contentType: 'image/png' });
  });
}
