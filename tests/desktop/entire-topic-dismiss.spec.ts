import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { openNode } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('dismisses a topic branch from its menu, keeps items and other branches, and persists after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'dismiss-folder', title: 'Dismiss test folder', kind: 'folder', content: '' },
      { id: 'dismiss-root', parentNodeId: 'dismiss-folder', title: 'Dismiss entire branch', kind: 'topic', content: 'Root body preserved.' },
      { id: 'dismiss-child', parentNodeId: 'dismiss-root', title: 'Nested topic', kind: 'topic', content: 'Child body preserved.' },
      { id: 'dismiss-card', parentNodeId: 'dismiss-root', title: 'Preserved item', kind: 'item', content: 'Question', reveal: 'Answer' },
      { id: 'dismiss-deep', parentNodeId: 'dismiss-card', title: 'Topic below item', kind: 'topic', content: 'Deep body preserved.' },
      { id: 'dismiss-other', parentNodeId: 'dismiss-folder', title: 'Other branch', kind: 'topic', content: 'Other body preserved.' }
    ]);
  });
  await openNode(page, 'dismiss-root');
  const row = page.locator('[role="treeitem"][data-node-id="dismiss-root"]');
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  const action = page.getByRole('menuitem', { name: /Dismiss (topic|主题)/ });
  await expect(action).toBeVisible();
  await action.click();
  const read = () => page.evaluate(() => ['dismiss-root', 'dismiss-child', 'dismiss-card', 'dismiss-deep', 'dismiss-other']
    .map(id => window.__folioleWorkspaceDebug!.getNode(id)?.reading?.state ?? null));
  await expect.poll(read).toEqual(['dismissed', 'dismissed', null, 'dismissed', null]);
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Root body preserved.');
  const output = path.resolve('.tmp/artifacts/T593');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'dismissed-branch.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await expect.poll(read).toEqual(['dismissed', 'dismissed', null, 'dismissed', null]);
  await openNode(page, 'dismiss-other');
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Other body preserved.');
  await page.screenshot({ path: path.join(output, 'reopened-other.png') });
});
