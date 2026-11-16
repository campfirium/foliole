import type { Page } from '@playwright/test';

import { collectNode, redoShortcut, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { waitForStartupGuidedSample } from './harness/startupGuidedSample';

const folder = 'trash-continuation-folder';
const entries = [['charlie', 'Charlie'], ['alpha', 'Alpha'], ['bravo', 'Bravo']] as const;

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await waitForStartupGuidedSample(page);
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect(exitFlow).toBeHidden();
  await page.evaluate(async ({ folder, entries }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: folder, kind: 'folder', title: 'Continuation folder', content: '' },
      ...entries.map(([id, title]) => ({
        id: `trash-continuation-${id}`, parentNodeId: folder, kind: 'topic' as const,
        title, content: `# ${title}\n\n${title} continuation body`
      }))
    ], { persist: true });
  }, { folder, entries });
  await page.getByRole('treeitem', { name: 'Continuation folder', exact: true }).click();
  const column = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await column.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Name|名称)$/ }).click();
  return column;
}

for (const entry of ['row keyboard', 'row menu', 'global keyboard'] as const) {
  test(`continues in the displayed folder order after ${entry} deletion`, async ({ desktopWindow: page }) => {
    const column = await prepare(page);
    const rows = column.getByRole('treeitem');
    await expect(rows).toHaveCount(3);
    const titles = await rows.allTextContents();
    expect(titles).toHaveLength(3);
    const expectedTitle = titles[2]!.trim();
    const target = rows.nth(1);
    await target.click();
    const deletedId = (await target.getAttribute('data-node-id'))!;
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(deletedId);
    if (entry === 'row menu') {
      await target.click({ button: 'right' });
      await page.getByRole('menuitem', { name: /^(Delete|删除)$/ }).click();
    } else if (entry === 'global keyboard') {
      await page.locator('.prompt-editor-host .cm-content').click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Delete');
    } else {
      await target.press('Delete');
    }
    await expect.poll(() => collectNode(page, deletedId)).toMatchObject({ trashed: true });
    await expect(column.getByRole('treeitem', { name: expectedTitle, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.prompt-editor-host .cm-content')).toContainText(`${expectedTitle} continuation body`);
    await expect(page.locator('.prompt-editor-host .cm-content')).not.toBeFocused();
    await page.keyboard.press(undoShortcut());
    await expect.poll(() => collectNode(page, deletedId)).toMatchObject({ trashed: false });
    await expect(column.locator(`[data-node-id="${deletedId}"]`)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press(redoShortcut());
    await expect.poll(() => collectNode(page, deletedId)).toMatchObject({ trashed: true });
    await expect(page.locator('.prompt-editor-host .cm-content')).toContainText(`${expectedTitle} continuation body`);
  });
}
