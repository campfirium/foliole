import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('body edits refresh the topic modification sort', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      {
        id: 'modification-target', kind: 'topic', title: 'Modification target',
        content: '# Modification target\n\nOriginal body'
      },
      {
        id: 'modification-neighbor', kind: 'topic', title: 'Unchanged neighbor',
        content: '# Unchanged neighbor\n\nNeighbor body'
      }
    ], { persist: true });
  });
  const target = page.locator('[role="treeitem"][data-node-id="modification-target"]');
  await expect(target).toBeVisible();
  await expect(page.locator('[role="treeitem"][data-node-id="modification-neighbor"]')).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T544/sort-before.png') });
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n\nChanged body');
  await expect.poll(() => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getNode('modification-target')?.content
  )).toBe('# Modification target\n\nOriginal body\n\nChanged body');
  await expect(target).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T544/sort-after.png') });
});
