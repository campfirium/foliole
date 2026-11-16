import type { Page } from '@playwright/test';

import { collectNode, redoShortcut, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const title = 'Continuation Dive';
const ids = { alpha: 'dive-continuation-alpha', bravo: 'dive-continuation-bravo', charlie: 'dive-continuation-charlie' };

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  const diveId = await page.evaluate(async ({ title, ids }) => {
    const folderIds = ['dive-continuation-folder-a', 'dive-continuation-folder-b'];
    await window.__folioleWorkspaceDebug!.seedNodes([
      ...folderIds.map((id, index) => ({ id, kind: 'folder' as const, title: `Source ${index + 1}`, content: '' })),
      ...[ids.bravo, ids.charlie, ids.alpha].map((id, index) => {
        const entryTitle = ['Bravo', 'Charlie', 'Alpha'][index]!;
        return { id, kind: 'topic' as const, parentNodeId: folderIds[index === 0 ? 0 : 1]!,
          title: entryTitle, content: `# ${entryTitle}\n\n${entryTitle} Dive continuation body` };
      })
    ], { persist: true });
    const dive = await window.electronAPI.invoke('create_dive', {
      title, sourceIds: [ids.charlie, ids.bravo, ids.alpha]
    });
    return dive.id;
  }, { title, ids });
  await page.reload();
  await expectWorkspaceShell(page);
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect(exitFlow).toBeHidden();
  const dive = page.getByRole('treeitem', { name: title, exact: true });
  await dive.click();
  const column = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await column.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Name|名称)$/ }).click();
  await expect(column.getByRole('treeitem')).toHaveText(['Alpha', 'Bravo', 'Charlie']);
  return { column, dive, diveId };
}

test('continues within the Dive, replays deletion, and returns to the empty Dive', async ({ desktopWindow: page }) => {
  const { column, dive, diveId } = await prepare(page);
  const row = (name: string) => column.getByRole('treeitem', { name, exact: true });
  const body = page.locator('.prompt-editor-host .cm-content');
  await row('Bravo').click();
  await expect(body).toContainText('Bravo Dive continuation body');
  await row('Bravo').press('Delete');
  await expect.poll(() => collectNode(page, ids.bravo)).toMatchObject({ trashed: true });
  await expect(row('Charlie')).toHaveAttribute('aria-selected', 'true');
  await expect(body).toContainText('Charlie Dive continuation body');
  await expect(body).not.toBeFocused();

  await page.keyboard.press(undoShortcut());
  await expect(body).toContainText('Bravo Dive continuation body');
  await page.keyboard.press(redoShortcut());
  await expect(body).toContainText('Charlie Dive continuation body');

  await row('Alpha').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Remove from This Dive|从此专题中移除)$/ }).click();
  await expect(row('Alpha')).toHaveCount(0);
  await expect(body).toContainText('Charlie Dive continuation body');
  expect((await collectNode(page, ids.alpha))?.trashed).toBe(false);

  await row('Charlie').press('Delete');
  await expect(column.getByRole('treeitem')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(diveId);
  await expect(dive).toBeVisible();
  const snapshot = await page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
  expect(snapshot!.trashedNodeIds).toEqual(expect.arrayContaining([ids.bravo, ids.charlie]));
  expect(snapshot!.trashedNodeIds).not.toContain(ids.alpha);
});
